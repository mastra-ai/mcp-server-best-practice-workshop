// Customer Analytics MCP Server - Workshop Demo
// Demonstrates workflow patterns: database queries + multi-system customer health analysis

import { MCPServer } from "@mastra/mcp";
import resourceHandlers from "./resources";
import { computeAccountHealthTool, runSqlTool } from "../tools";
import { readFileSync } from "fs";
import path from "node:path";

// Read version from package.json
const version = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version;

// --- Create and configure the MCP server ---
const server = new MCPServer({
  name: "customer-analytics",
  version,
  description:
    "Customer analytics MCP server with multi-system workflows: database queries, health scoring, and external data integration",
  tools: {
    compute_account_health: computeAccountHealthTool,
    run_sql: runSqlTool,
  },
  resources: resourceHandlers,
});

// --- Start server based on transport type ---
const main = async () => {

  const transport = process.env.MCP_TRANSPORT || "stdio";

  console.error(
    `Starting Customer Analytics MCP Server v${version} via ${transport}`,
  );
  console.error(
    "Purpose: Customer health analysis with multi-system data integration",
  );
  console.error(
    "Tools: compute_account_health (workflow), run_sql (database), schema resource",
  );
  console.error(
    "Patterns: External APIs, business logic, authentication, safety guardrails",
  );

  if (transport === "stdio") {
    // Log authentication mode for stdio
    const authMode = process.env.DEMO_API_KEY ? "environment" : "default";
    console.error(
      `Authentication: Using ${authMode} credentials (DEMO_API_KEY=${process.env.DEMO_API_KEY || "not set"})`,
    );

    await server.startStdio();
  } else if (transport === "http") {
    console.error(
      "HTTP transport: Use the http-server.ts script for HTTP mode with real authentication",
    );
    console.error("Run: node src/mcp-server/http-server.js");
    process.exit(1);
  } else {
    console.error(`Error: Unsupported transport: ${transport}`);
    console.error("Supported transports: stdio, http");
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down Customer Analytics MCP Server...");
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down Customer Analytics MCP Server...");
  await server.close();
  process.exit(0);
});

// Start server if this is the main module
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

export { server };
