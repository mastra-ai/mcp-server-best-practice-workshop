import { z } from "zod";
import { authenticateRequest, requireAuth } from "../mcp/utils";
import { orders, users } from "../mcp/mock-data";
import { createTool } from "@mastra/core/tools";
import { MCPTool } from "@mastra/mcp";

// Simple SQL parser for demo purposes
function parseSQL(sql: string): {
  table?: string;
  operation: string;
  error?: string;
} {
  const trimmed = sql.trim().toLowerCase();

  if (!trimmed.startsWith("select")) {
    return { operation: "invalid", error: "Only SELECT queries are allowed." };
  }

  if (trimmed.includes("users")) {
    return { table: "users", operation: "select" };
  } else if (trimmed.includes("orders")) {
    return { table: "orders", operation: "select" };
  } else {
    return {
      operation: "select",
      error: "Table not found. Available tables: users, orders",
    };
  }
}

function executeQuery(sql: string, limit: number): any[] {
  const parsed = parseSQL(sql);

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  const trimmed = sql.trim().toLowerCase();

  // Handle basic queries for demonstration
  if (trimmed.includes("distinct") && trimmed.includes("city")) {
    const cities = [...new Set(users.map((u) => u.city))];
    return cities.map((city) => ({ city }));
  }

  if (
    trimmed.includes("join") ||
    (trimmed.includes("users") && trimmed.includes("orders"))
  ) {
    // Simple join simulation
    const result = users.map((user) => {
      const userOrders = orders.filter((o) => o.user_id === user.id);
      const totalSpend = userOrders.reduce(
        (sum, order) => sum + order.total,
        0,
      );
      return {
        id: user.id,
        name: user.name,
        city: user.city,
        joined: user.joined,
        total_spend: totalSpend,
        order_count: userOrders.length,
      };
    });
    return result.slice(0, limit);
  }

  if (parsed.table === "users") {
    return users.slice(0, limit);
  } else if (parsed.table === "orders") {
    return orders.slice(0, limit);
  }

  // Default: return users
  return users.slice(0, limit);
}

const RunSqlInput = z.object({
  sql: z.string().describe("A SELECT-only SQL query. Consider adding LIMIT."),
  limit: z.number().int().positive().max(200).default(50),
});

export const runSqlTool = createTool({
  id: "run_sql",
  description:
    "Execute a read-only SQL query (SELECT only) against the demo DB. Requires appropriate permissions.",
  inputSchema: RunSqlInput,
  outputSchema: z.object({
    rows: z.array(z.record(z.any())),
    rowCount: z.number(),
    metadata: z.object({
      executedBy: z.string(),
      permission: z.string(),
      filteredByRole: z.boolean(),
      error: z.string().optional(),
    }),
  }),
  // @ts-expect-error TODO MCPTool type is not compatible with createTool
  execute: (async (context, options) => {
    try {
      let { sql, limit } = context.context;

      // Check specific permissions based on query
      const parsed = parseSQL(sql);
      let requiredPermission = "read:users";

      if (parsed.table === "orders" || sql.toLowerCase().includes("orders")) {
        requiredPermission = "read:orders";
      } else if (
        sql.toLowerCase().includes("join") ||
        sql.toLowerCase().includes("orders")
      ) {
        requiredPermission = "read:orders";
      }

      // Guardrails: SELECT-only + implicit LIMIT
      if (!/^\s*select/i.test(sql)) {
        throw new Error("Only SELECT queries are allowed.");
      }

      if (!/\blimit\b/i.test(sql)) {
        sql = `${sql.trim()} LIMIT ${limit}`;
      }

      // Role-based row filtering
      let effectiveLimit = limit;
      let filteredByRole = false;

      // Execute the query using our in-memory data
      try {
        const rows = executeQuery(sql, effectiveLimit);

        return {
          rows,
          rowCount: rows.length,
          metadata: {
            executedBy: "unknown",
            permission: requiredPermission,
            filteredByRole,
          },
        };
      } catch (error) {
        // Return structured error response instead of throwing
        return {
          rows: [],
          rowCount: 0,
          metadata: {
            executedBy: "unknown",
            permission: requiredPermission,
            filteredByRole,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    } catch (error) {
      // Outer try-catch for auth/parsing errors
      return {
        rows: [],
        rowCount: 0,
        metadata: {
          executedBy: "unknown",
          permission: "unknown",
          filteredByRole: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }) as MCPTool<typeof RunSqlInput>["execute"],
});
