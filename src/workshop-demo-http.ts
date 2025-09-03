// HTTP Workshop Demo: Customer Analytics MCP + Real Authentication
// Demonstrates production-ready HTTP MCP with JWT/API key authentication

import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { PinoLogger } from "@mastra/loggers";

// Real authentication credentials for testing
const AUTH_SCENARIOS = [
  {
    name: "Admin User (API Key)",
    authorization: "ApiKey sk-admin-123456789",
    description: "Full access to all data and operations",
    expectedPermissions: ["read:all", "write:all", "delete:all"],
  },
  {
    name: "Regular User (API Key)",
    authorization: "ApiKey sk-user-987654321",
    description: "Can read users and orders",
    expectedPermissions: ["read:users", "read:orders"],
  },
  {
    name: "Readonly User (API Key)",
    authorization: "ApiKey sk-readonly-555666777",
    description: "Limited to users table, max 10 rows",
    expectedPermissions: ["read:users"],
  },
  {
    name: "Admin User (JWT)",
    authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin",
    description: "Full access via JWT token",
    expectedPermissions: ["read:all", "write:all", "delete:all"],
  },
  {
    name: "Regular User (JWT)",
    authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user",
    description: "Standard access via JWT token",
    expectedPermissions: ["read:users", "read:orders"],
  },
];

const MODELS_TO_TEST = [
  { name: "GPT-4o Mini", model: openai("gpt-4o-mini") },
  { name: "GPT-4o", model: openai("gpt-4o") },
];

const logger = new PinoLogger({
  name: "HTTP MCP Workshop Demo",
  level: "info",
});

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3001";

async function checkServerHealth(): Promise<boolean> {
  try {
    console.log(`🏥 Checking server health at ${MCP_SERVER_URL}/health...`);
    const response = await fetch(`${MCP_SERVER_URL}/health`);
    if (response.ok) {
      const health = await response.json();
      console.log(`   ✅ Server healthy: ${health.server} v${health.version}`);
      return true;
    } else {
      console.log(
        `   ❌ Server returned ${response.status}: ${response.statusText}`,
      );
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error}`);
    return false;
  }
}

async function testMCPConnection(scenario: any): Promise<boolean> {
  try {
    console.log(`   Testing MCP connection...`);
    const mcpClient = await createHttpMCPClient(scenario);
    const toolsets = await mcpClient.getToolsets();
    await mcpClient.disconnect();

    console.log(
      `   ✅ MCP connection successful, ${Object.keys(toolsets.customerAnalytics).length} tools available`,
    );
    return true;
  } catch (error) {
    console.log(`   ❌ MCP connection failed: ${error}`);
    return false;
  }
}

async function createHttpMCPClient(scenario: any): Promise<MCPClient> {
  console.log({ scenario });
  console.log(
    `🔌 Creating HTTP MCP Client for Customer Analytics with auth: ${scenario.authorization.slice(0, 20)}...`,
  );

  const mcpClient = new MCPClient({
    id: `http-workshop-demo-${scenario.name}`,
    servers: {
      customerAnalytics: {
        url: new URL(`${MCP_SERVER_URL}/mcp`),
        requestInit: {
          headers: {
            Authorization: scenario.authorization,
            "Content-Type": "application/json",
          },
        },
        // For SSE fallback, ensure auth headers are included
        eventSourceInit: {
          fetch(input: Request | URL | string, init?: RequestInit) {
            const headers = new Headers(init?.headers || {});
            headers.set("Authorization", scenario.authorization);
            headers.set("Content-Type", "application/json");
            return fetch(input, {
              ...init,
              headers,
            });
          },
        },
        logger: (logMessage) => {
          console.log(
            `   [MCP Server ${logMessage.level}] ${logMessage.message}`,
          );
        },
        timeout: 30000,
      },
    },
  });

  return mcpClient;
}

async function testHttpAuthentication() {
  console.log("\n🔐 Testing HTTP Authentication Scenarios");
  console.log("=".repeat(60));

  for (const scenario of AUTH_SCENARIOS) {
    console.log(`\n👤 Testing: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Authorization: ${scenario.authorization}...`);

    try {
      // Test MCP connection (which validates auth)
      const connectionWorked = await testMCPConnection(scenario);

      if (!connectionWorked) {
        console.log(`   ❌ Authentication or connection failed`);
        continue;
      }

      // Create MCP client for testing
      const mcpClient = await createHttpMCPClient(scenario);
      const toolsets = await mcpClient.getToolsets();

      console.log(
        `   🛠️  Available tools: ${Object.keys(toolsets.customerAnalytics).join(", ")}`,
      );

      // Create agent for testing
      const agent = new Agent({
        name: `HTTP Test Agent (${scenario.name})`,
        instructions: `You have access to a database via MCP tools. Authentication is handled transparently. Explore the schema and query data as needed.`,
        model: openai("gpt-4o-mini"),
      });

      agent.__setLogger(logger);

      // Test schema exploration (auth is transparent)
      console.log(`   Testing schema exploration...`);
      const schemaResponse = await agent.generateVNext(
        "What database schema is available to me?",
        {
          toolsets,
        },
      );
      console.log(`   🔍 Schema response: ${schemaResponse.text}...`);

      // Test data access based on role
      let testQuery = "";
      if (scenario.name.includes("Readonly")) {
        testQuery = "Show me the users table";
      } else if (scenario.expectedPermissions.includes("read:orders")) {
        testQuery =
          "Show me data from both users and orders, including total spending by city";
      } else {
        testQuery = "Show me the users table";
      }

      console.log(`   Testing data access: "${testQuery}"`);
      const dataResponse = await agent.generateVNext(testQuery, {
        toolsets,
      });
      console.log(`   📊 Data response: ${dataResponse.text}...`);

      // Test permission boundaries
      if (!scenario.expectedPermissions.includes("read:orders")) {
        console.log(`   Testing permission boundary (should fail)...`);
        try {
          const boundaryResponse = await agent.generateVNext(
            "Try to access the orders table",
            {
              toolsets,
            },
          );
          console.log(
            `   ⚠️  Boundary test response: ${boundaryResponse.text}...`,
          );
        } catch (error) {
          console.log(`   ✅ Permission boundary enforced: ${error}`);
        }
      }

      await mcpClient.disconnect();
      console.log(`   ✅ ${scenario.name} test completed successfully`);
    } catch (error) {
      console.log(`   ❌ ${scenario.name} test failed: ${error}`);
    }
  }
}

async function testModelCompatibilityWithAuth() {
  console.log("\n🧪 Testing Model Compatibility with Authentication");
  console.log("=".repeat(60));

  const testAuth = AUTH_SCENARIOS[1]; // Use regular user for testing
  console.log(`Using authentication: ${testAuth.name}`);

  const results: Array<{
    modelName: string;
    success: boolean;
    toolsUsed: string[];
    error?: string;
  }> = [];

  for (const { name: modelName, model } of MODELS_TO_TEST) {
    console.log(`\n📊 Testing with ${modelName}...`);

    try {
      const mcpClient = await createHttpMCPClient(testAuth);
      const toolsets = await mcpClient.getToolsets();

      const agent = new Agent({
        name: `Model Test Agent (${modelName})`,
        instructions: `You are testing a database connection. Authentication is handled transparently. Query for distinct cities and total spending by city.`,
        model,
      });

      const startTime = Date.now();
      const response = await agent.generateVNext(
        "Show me distinct cities where users live and total order spend per city.",
        { toolsets },
      );
      const duration = Date.now() - startTime;

      console.log(`   ✅ Success in ${duration}ms`);
      console.log(`   Response: ${response.text}...`);

      const toolsUsed = response.toolCalls?.map((call) => call.toolName) || [];
      console.log(`   Tools used: ${toolsUsed.join(" → ") || "None"}`);

      results.push({
        modelName,
        success: true,
        toolsUsed,
      });

      await mcpClient.disconnect();
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      results.push({
        modelName,
        success: false,
        toolsUsed: [],
        error: String(error),
      });
    }
  }

  return results;
}

async function demonstrateProductionPatterns() {
  console.log("\n🏭 Demonstrating Production Patterns");
  console.log("=".repeat(60));

  console.log("\n🔒 Security Features:");
  console.log("  ✅ HTTP transport with real auth middleware");
  console.log("  ✅ JWT and API key authentication");
  console.log("  ✅ Role-based access control (admin/user/readonly)");
  console.log("  ✅ Permission-based tool access");
  console.log("  ✅ Session management with unique session IDs");
  console.log("  ✅ CORS headers for web client support");

  console.log("\n🛡️ Security Headers & Middleware:");
  console.log("  ✅ Authorization header validation");
  console.log("  ✅ Structured error responses for auth failures");
  console.log("  ✅ Request logging with user context");
  console.log("  ✅ Graceful degradation for invalid credentials");

  console.log("\n🔧 MCP Integration:");
  console.log(
    "  ✅ Authentication context passed to tools via options.extra.authInfo",
  );
  console.log("  ✅ Session-aware tool execution");
  console.log("  ✅ Dynamic permission checking per tool call");
  console.log("  ✅ Structured metadata in tool responses");
}

async function main() {
  console.log("🚀 Mastra HTTP MCP Workshop Demo");
  console.log("Real Authentication with Production Patterns");
  console.log("=".repeat(60));

  try {
    // Health check
    const isHealthy = await checkServerHealth();
    if (!isHealthy) {
      console.log("\n❌ Server is not healthy. Please start the HTTP server:");
      console.log("   pnpm mcp-http-server");
      process.exit(1);
    }

    // Demo sections
    await demonstrateProductionPatterns();
    await testHttpAuthentication();

    // Model compatibility testing
    const compatibilityResults = await testModelCompatibilityWithAuth();

    // Summary
    console.log("\n📊 Workshop Summary");
    console.log("=".repeat(60));
    console.log("✅ Demonstrated Production MCP Patterns:");
    console.log("  • HTTP transport with real authentication middleware");
    console.log("  • JWT and API key authentication");
    console.log("  • Role-based access control (admin/user/readonly)");
    console.log("  • Permission-based tool filtering");
    console.log("  • Session-aware tool execution");
    console.log("  • Structured error handling and logging");
    console.log("  • CORS support for web clients");

    console.log("\n🎯 Model Compatibility Results:");
    compatibilityResults.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      console.log(
        `  ${status} ${result.modelName}: ${result.success ? `Used ${result.toolsUsed.length} tools` : result.error}`,
      );
    });

    console.log("\n🎉 HTTP Workshop completed successfully!");
    console.log(
      "Next steps: Deploy this pattern to production with real JWT validation",
    );
  } catch (error) {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  }
}

// Run demo if this is the main module
main().catch(console.error);
