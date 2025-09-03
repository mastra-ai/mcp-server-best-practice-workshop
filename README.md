# Mastra MCP Workshop: Best Practices

A hands-on workshop demonstrating MCP (Model Context Protocol) best practices using Mastra. Build a "Customer Analytics" MCP server that showcases workflow-oriented tools, authentication patterns, and multi-system integration.

## 🎯 Workshop Goals

- **Minimize surface area**: 2 tools that handle many use cases
- **Workflow-shaped tools**: Capabilities (explore schema, run queries) vs endpoints (getUsers)
- **Model compatibility**: Test with multiple models, ensure consistent behavior
- **Exploration**: Let AI discover capabilities through resources
- **Guardrails**: Safe, deterministic, read-only by default

## 🏗️ What We'll Build

**Customer Analytics MCP Server** featuring:

- 📊 **2 Tools**: `compute_account_health` (multi-system workflow), `run_sql` (database queries)
- 📚 **1 Resource**: `schema://main` (discovery & exploration)
- 🔄 **Workflow Patterns**: External API integration, data fusion, scoring algorithms
- 🛡️ **Built-in Safety**: SELECT-only, implicit LIMIT, parsed queries, API rate limits
- 🔐 **Authentication**: Transparent role-based access control (admin/user/readonly)
- 💾 **Zero Dependencies**: Pure in-memory demo data (no database required)

## 🚀 Quick Start

### Prerequisites

```bash
# Required
node >= 20.9.0
pnpm >= 8.0.0

# Optional: OpenAI API key for demo
export OPENAI_API_KEY="your-key-here"
```

### Installation

```bash
# Clone and install
git clone <this-repo>
cd mcp-server-workshop-best-practices
pnpm install
```

### Run the Demo

**Option 1: Stdio Transport (Simple)**

```bash
# Terminal 1: Start MCP server (stdio)
pnpm mcp-server

# Terminal 2: Run workshop demo
pnpm workshop-demo

# Optional: Test with different auth levels
DEMO_API_KEY=api_key_admin_123 pnpm mcp-server     # Admin access
DEMO_API_KEY=api_key_readonly_789 pnpm mcp-server  # Readonly access
```

**Option 2: HTTP Transport (Production-Ready)**

```bash
# Terminal 1: Start HTTP MCP server with real auth
pnpm mcp-http-server

# Terminal 2: Run HTTP workshop demo
pnpm workshop-demo-http

# Server runs on http://localhost:3001 with endpoints:
# - /mcp (MCP endpoint with auth)
# - /health (health check)
```

## 📚 Workshop Structure (40 minutes)

### 0-5 min: Why MCP + Principles

- Fewer tools, workflow-shaped, model compatibility
- Exploration over brittle API wrappers

### 5-20 min: Live Build - Customer Analytics Server

- **Demo server**: 2 tools + 1 resource
- **Multi-system workflows**: Database + external API integration
- **Business logic**: Customer health scoring and risk analysis
- **Safe by design**: Read-only with built-in guardrails

### 20-30 min: Prove Model Compatibility

- Test same task with 2-3 different models
- Track: tool selection, arg validity, result shape

### 30-36 min: Patterns & Pitfalls

- Error handling, rate limits, timeouts, versioning

### 36-40 min: Q&A + Checklist Hand-off

## 🛠️ Technical Deep Dive

### MCP Server Implementation

```typescript
// src/mastra/mcp/server.ts
import { MCPServer } from "@mastra/mcp";
import { computeAccountHealthTool, runSqlTool } from "../tools";

const server = new MCPServer({
  name: "customer-analytics",
  version: "0.5.0",
  description: "Customer analytics MCP server with multi-system workflows",
  tools: {
    compute_account_health: computeAccountHealthTool,
    run_sql: runSqlTool,
  },
  resources: resourceHandlers,
});
```

**Key Features:**

- ✅ **Multi-system workflows**: `compute_account_health` combines database, external APIs, and business logic
- ✅ **Resource-based discovery**: Schema exploration via `schema://main` resource
- ✅ **Transparent authentication**: MCP-compliant auth context passed to tools
- ✅ **Role-based access**: admin/user/readonly permissions enforced per tool call
- ✅ **Guardrails built-in**: SELECT-only, auto-LIMIT, permission checking
- ✅ **Error teaching**: Structured, helpful error messages

### Mastra Integration

```typescript
// src/workshop-demo.ts
import { MCPClient } from "@mastra/mcp";
import { Agent } from "@mastra/core/agent";

const mcpClient = new MCPClient({
  servers: {
    customerAnalytics: {
      command: "pnpm",
      args: ["mcp-server"],
      env: { DEMO_API_KEY: "api_key_user_456" }, // Auth context
    },
  },
});

const agent = new Agent({
  name: "Customer Analytics Agent",
  model: openai("gpt-4o-mini"),
});

// Use MCP tools with agent
const response = await agent.generate(task, {
  toolsets: await mcpClient.getToolsets(),
});
```

### HTTP Authentication (Production Pattern)

The workshop includes a production-ready HTTP server with real authentication:

```typescript
// src/mastra/mcp/http-server.ts
import { MCPServer } from "@mastra/mcp";
import { server } from "./server";
import type { AuthInfo, DemoUserInfo } from "./utils";

// Authentication middleware
function authenticateRequest(req: http.IncomingMessage): AuthInfo | null {
  const authHeader = req.headers.authorization;

  // Support JWT Bearer tokens
  if (authHeader?.startsWith("Bearer ")) {
    return validateJWT(authHeader.slice(7));
  }

  // Support API keys
  if (authHeader?.startsWith("ApiKey ")) {
    return validateApiKey(authHeader.slice(7));
  }

  return null;
}

// HTTP request handler with MCP-compliant auth
const handleRequest = async (req, res) => {
  const authInfo = authenticateRequest(req);

  if (!authInfo) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Authentication required",
        message: "Please provide a valid Authorization header",
      }),
    );
    return;
  }

  // Attach MCP-compliant auth to request
  (req as any).auth = authInfo;

  await server.startHTTP({
    url: new URL(`http://localhost:${PORT}`),
    httpPath: "/mcp",
    req,
    res,
  });
};
```

**Key Features:**

- ✅ **JWT & API Key Support**: Multiple authentication methods
- ✅ **MCP-Compliant Auth**: Uses official `AuthInfo` type from MCP specification
- ✅ **Real Auth Context**: Authentication info passed to tools via `options.extra.authInfo`
- ✅ **Session Management**: Unique session IDs for each connection
- ✅ **CORS Support**: Web client compatibility
- ✅ **Structured Errors**: Clear auth failure responses

**Test Credentials:**

```bash
# Health check (no auth required)
curl localhost:3001/health

# MCP endpoint (requires auth)
curl -H "Authorization: ApiKey sk-user-987654321" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
     localhost:3001/mcp

# Available credentials:
# API Keys: sk-admin-123456789, sk-user-987654321, sk-readonly-555666777
# JWT Tokens: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin, eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user
```

## 🛠️ Tools Overview

### 1. `compute_account_health` - Multi-System Workflow

**Purpose**: Demonstrates complex workflow patterns that combine multiple data sources for business insights.

**Data Flow**:

```
Internal DB (orders) → External NPS API → External Support API → Risk Scoring → Actionable Insights
```

**Key Features**:

- **Multi-source data fusion**: Order history + NPS scores + support tickets
- **Business logic**: Configurable scoring weights (recency 30%, momentum 30%, satisfaction 25%, reliability 15%)
- **Segmentation**: Filter by customer value, activity patterns, risk levels
- **External API simulation**: Realistic delays, missing data, enterprise customer patterns
- **Role-based limits**: Readonly users limited to 10 accounts

**Input Parameters**:

- `segment`: "all" | "inactive" | "highValue"
- `windowDays`: Analysis period (default 90 days)
- `limit`: Maximum accounts to analyze (default 50)
- `includeReasons`: Include risk factor explanations

**Output Structure**:

```json
{
  "accounts": [
    {
      "accountId": "1",
      "name": "Alice Johnson",
      "healthScore": 85,
      "tier": "good",
      "metrics": { "lastOrderDays": 5, "spendDeltaPct": 15.2, "nps": 72 },
      "reasons": []
    }
  ],
  "summary": {
    "totalAnalyzed": 20,
    "segmentBreakdown": { "good": 15, "watch": 3, "at_risk": 2 },
    "avgHealthScore": 75,
    "externalDataCoverage": { "npsAvailable": 18, "supportDataAvailable": 20 }
  }
}
```

### 2. `run_sql` - Database Query Tool

**Purpose**: Safe, controlled database access with automatic guardrails.

**Key Features**:

- SELECT-only validation
- Automatic LIMIT injection
- Role-based row limiting
- Permission checking based on query content

## 🧪 Testing & Validation

### Model Compatibility Test

Run the same task with multiple models:

```
Task: "Analyze customer health for high-value accounts and show database schema"

Expected flow:
1. Schema resource → understand available data structure
2. compute_account_health → multi-system customer analysis
3. run_sql → supplementary database queries if needed
4. Valid JSON response with insights and recommendations
```

**Testing Matrix:**

- ✅ Right tool chosen? (compute_account_health for analysis, run_sql for queries)
- ✅ Args valid? (proper segment filtering, reasonable limits)
- ✅ Result shape? (structured health scores, actionable insights)
- ✅ Authentication? (role-based access control working)

### Demo Workflows

1. **Schema Exploration**: "What data is available?" (via schema resource)
2. **Customer Health Analysis**: "Show me at-risk customers" (compute_account_health)
3. **Database Queries**: "Show me recent high-value orders" (run_sql)
4. **Multi-system Integration**: "Combine order data with support tickets" (workflow tool)
5. **Guardrails Test**: "Try to delete users" (safely fails with helpful error)
6. **Authentication Test**: Different access levels (admin/user/readonly)

## 📊 Best Practices Demonstrated

### ✅ Tool Design

- **Capability-oriented**: `run_sql` (workflow) vs `getUserById` (endpoint)
- **Self-documenting**: Descriptions include examples
- **Composable**: One general tool > many specific ones

### ✅ Safety & Reliability

- **Read-only default**: Only SELECT operations allowed
- **Implicit limits**: Auto-add LIMIT clauses
- **Structured errors**: "Only SELECT queries allowed" (teaches the model)

### ✅ Model Compatibility

- **Cross-model testing**: GPT-4, GPT-3.5, etc.
- **Consistent behavior**: Same tools, same args, same output shape
- **Graceful degradation**: Weaker models still succeed

### ✅ Exploration & Discovery

- **Resource-driven**: Schema exposed via MCP resources
- **Progressive disclosure**: Start simple, add complexity
- **Documentation**: Examples and usage notes included

## 🎮 Try It Yourself

### Extend the Demo

Add a third tool to show workflow composition:

```typescript
const cityReportTool = createTool({
  id: "make_city_report",
  description: "Generate a comprehensive city analysis report",
  execute: async ({ context }) => {
    // Internally runs 2-3 SQL queries
    // Returns: { city, userCount, totalSpend, avgOrderValue }[]
  },
});
```

### Connect to Your Own Database

Replace the in-memory data with real database connections:

```typescript
// Update src/mcp-server/server.ts
import Database from "better-sqlite3";
const db = new Database("path/to/your/database.db");

// or with PostgreSQL
import postgres from "postgres";
const sql = postgres("postgresql://...");

// Update executeQuery function to use real SQL
```

### Test with More Models

Add models to the compatibility test:

```typescript
// src/workshop-demo.ts
const MODELS_TO_TEST = [
  { name: "GPT-4o Mini", model: openai("gpt-4o-mini") },
  { name: "GPT-4o", model: openai("gpt-4o") },
  { name: "Claude Sonnet", model: anthropic("claude-3-sonnet-20240229") },
  // Add your preferred models
];
```

## 🎯 Key Takeaways

1. **Tools are workflows, not APIs** - Design for capabilities
2. **Fewer is better** - 2 general tools > 10 specific ones
3. **Safety first** - Guardrails built into every tool
4. **Test compatibility** - Multiple models, same behavior
5. **Enable exploration** - Resources help discovery

## 📚 Resources

- [Mastra MCP Documentation](https://mastra.ai/en/reference/tools/mcp-server)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/docs/getting-started/intro)

## 🤝 Contributing

Found an issue or want to improve the workshop?

- Report bugs via GitHub issues
- Submit improvements via pull requests
- Share your workshop experiences

---

**Built with ❤️ using [Mastra](https://mastra.ai) - The TypeScript AI Framework**
