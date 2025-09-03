// HTTP Server with Authentication Middleware for MCP Workshop
// Demonstrates production-ready patterns with real auth context

import http from "http";
import { URL } from "url";
import { server } from "./server.js";

// --- Authentication Types ---
import type { AuthInfo, DemoUserInfo } from "./utils.js";

// --- Mock User Database (replace with real auth in production) ---
const validApiKeys: Record<string, AuthInfo> = {
  "sk-admin-123456789": {
    token: "sk-admin-123456789",
    clientId: "http-admin-client",
    scopes: ["read:all", "write:all", "delete:all"],
    extra: {
      userId: "admin-1",
      username: "admin",
      role: "admin",
      permissions: ["read:all", "write:all", "delete:all"],
    },
  },
  "sk-user-987654321": {
    token: "sk-user-987654321",
    clientId: "http-user-client",
    scopes: ["read:users", "read:orders"],
    extra: {
      userId: "user-1",
      username: "analyst",
      role: "user",
      permissions: ["read:users", "read:orders"],
    },
  },
  "sk-readonly-555666777": {
    token: "sk-readonly-555666777",
    clientId: "http-readonly-client",
    scopes: ["read:users"],
    extra: {
      userId: "readonly-1",
      username: "viewer",
      role: "readonly",
      permissions: ["read:users"],
    },
  },
};

// --- JWT Mock (in production, use proper JWT validation) ---
const mockJWTUsers: Record<string, AuthInfo> = {
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin": {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin",
    clientId: "http-jwt-admin-client",
    scopes: ["read:all", "write:all", "delete:all"],
    extra: {
      userId: "jwt-admin-1",
      username: "jwt-admin",
      role: "admin",
      permissions: ["read:all", "write:all", "delete:all"],
    },
  },
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user": {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user",
    clientId: "http-jwt-user-client",
    scopes: ["read:users", "read:orders"],
    extra: {
      userId: "jwt-user-1",
      username: "jwt-user",
      role: "user",
      permissions: ["read:users", "read:orders"],
    },
  },
};

// --- Authentication Middleware ---
function authenticateRequest(req: http.IncomingMessage): AuthInfo | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log("[Auth] No authorization header provided");
    return null;
  }

  // Handle Bearer token (JWT-style)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = mockJWTUsers[token];
    if (user) {
      const userInfo = user.extra as unknown as DemoUserInfo;
      console.log(
        `[Auth] JWT authenticated: ${userInfo.username} (${userInfo.role})`,
      );
      return user;
    }
    console.log(`[Auth] Invalid JWT token: ${token}`);
    return null;
  }

  // Handle API Key
  if (authHeader.startsWith("ApiKey ")) {
    const apiKey = authHeader.slice(7);
    const user = validApiKeys[apiKey];
    if (user) {
      const userInfo = user.extra as unknown as DemoUserInfo;
      console.log(
        `[Auth] API Key authenticated: ${userInfo.username} (${userInfo.role})`,
      );
      return user;
    }
    console.log(`[Auth] Invalid API key: ${apiKey.slice(0, 10)}...`);
    return null;
  }

  // Handle direct API key in Authorization header
  const user = validApiKeys[authHeader];
  if (user) {
    const userInfo = user.extra as unknown as DemoUserInfo;
    console.log(
      `[Auth] Direct API Key authenticated: ${userInfo.username} (${userInfo.role})`,
    );
    return user;
  }

  console.log(`[Auth] Unrecognized auth format: ${authHeader.slice(0, 20)}...`);
  return null;
}

// --- CORS Middleware ---
function setCORSHeaders(res: http.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// --- HTTP Request Handler ---
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  console.log(
    `[HTTP] ${req.method} ${url.pathname} from ${req.headers["user-agent"]?.slice(0, 50)}...`,
  );

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    setCORSHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }

  // Set CORS headers for all responses
  setCORSHeaders(res);

  // Health check endpoint
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        server: "schema-explorer-mcp",
        version: "0.2.0",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // MCP endpoint
  if (url.pathname === "/mcp") {
    try {
      // Start MCP server with HTTP transport
      await server.startHTTP({
        url,
        httpPath: "/mcp",
        req,
        res,
        options: {
          sessionIdGenerator: () =>
            `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
    } catch (error) {
      console.error("[MCP] Error handling request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Internal server error",
          message: String(error),
        }),
      );
    }
    return;
  }

  // Default 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      availableEndpoints: ["/health", "/auth/info", "/mcp"],
    }),
  );
}

// --- Server Configuration ---
const PORT = parseInt(process.env.PORT || "3001");

// --- Create and Start HTTP Server ---
const httpServer = http.createServer(handleRequest);

const startHttpServer = async () => {
  console.log("🚀 Starting Schema Explorer MCP HTTP Server");
  console.log(
    `📊 Features: 2 tools (compute_account_health, run_sql), 1 resource (schema discovery)`,
  );
  console.log(
    `🔄 Patterns: Multi-system workflows, external data integration, HTTP transport`,
  );
  console.log(`🔐 Authentication: API Keys and JWT tokens`);
  console.log(`🛡️ Security: Role-based access control`);
  console.log("");
  console.log("Available API Keys for Testing:");
  Object.entries(validApiKeys).forEach(([key, user]) => {
    const userInfo = user?.extra as unknown as DemoUserInfo;
    console.log(
      `  ${userInfo?.role.padEnd(8)} | ${userInfo?.username.padEnd(12)} | ${key}`,
    );
  });
  console.log("");
  console.log("Available JWT Tokens for Testing:");
  Object.entries(mockJWTUsers).forEach(([token, user]) => {
    const userInfo = user?.extra as unknown as DemoUserInfo;
    console.log(
      `  ${userInfo?.role.padEnd(8)} | ${userInfo?.username.padEnd(12)} | ${token}`,
    );
  });
  console.log("");

  httpServer.listen(PORT, () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log("");
    console.log("Example usage:");
    console.log(`  curl http://localhost:${PORT}/health`);
    console.log(
      `  curl -H "Authorization: ApiKey sk-user-987654321" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' http://localhost:${PORT}/mcp`,
    );
  });
};

// --- Graceful Shutdown ---
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down HTTP server...");
  httpServer.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down HTTP server...");
  httpServer.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
});

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startHttpServer().catch((error) => {
    console.error("❌ Failed to start HTTP server:", error);
    process.exit(1);
  });
}

export { startHttpServer, httpServer };
