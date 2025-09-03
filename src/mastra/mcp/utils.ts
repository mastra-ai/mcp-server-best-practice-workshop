import { MCPRequestHandlerExtra } from "@mastra/mcp";

// --- Tool Execute Options Type ---
// Define our own interface that matches what Mastra provides
// Note: Mastra uses 'ToolExecutionOptions' (with 'ion')
export interface ToolExecuteOptions {
  extra?: MCPRequestHandlerExtra;
  [key: string]: any;
}

// Also export as the name Mastra expects
export type ToolExecutionOptions = ToolExecuteOptions;

// --- Authentication Types ---
// Using the official MCP AuthInfo type from MCPRequestHandlerExtra
export type AuthInfo = MCPRequestHandlerExtra["authInfo"];

// Extended user info for our demo (stored in extra)
export interface DemoUserInfo {
  userId: string;
  username: string;
  role: "admin" | "user" | "readonly";
  permissions: string[];
}

export interface AuthContext {
  isAuthenticated: boolean;
  authInfo?: AuthInfo;
  user?: DemoUserInfo;
  sessionId?: string;
}

// --- Mock Authentication Data ---
export const mockUsers: Record<string, AuthInfo> = {
  api_key_admin_123: {
    token: "api_key_admin_123",
    clientId: "demo-admin-client",
    scopes: ["read:all", "write:all", "delete:all"],
    extra: {
      userId: "admin-1",
      username: "admin",
      role: "admin",
      permissions: ["read:all", "write:all", "delete:all"],
    },
  },
  api_key_user_456: {
    token: "api_key_user_456",
    clientId: "demo-user-client",
    scopes: ["read:users", "read:orders"],
    extra: {
      userId: "user-1",
      username: "analyst",
      role: "user",
      permissions: ["read:users", "read:orders"],
    },
  },
  api_key_readonly_789: {
    token: "api_key_readonly_789",
    clientId: "demo-readonly-client",
    scopes: ["read:users"],
    extra: {
      userId: "readonly-1",
      username: "viewer",
      role: "readonly",
      permissions: ["read:users"],
    },
  },
};

export function authenticateRequest(options?: ToolExecuteOptions): AuthContext {
  // Check for auth info from HTTP context (when using HTTP transport)
  if (options?.extra?.authInfo) {
    const authInfo = options.extra.authInfo;
    const userInfo = authInfo?.extra as unknown as DemoUserInfo;

    console.error(
      `[Auth] HTTP context auth: ${userInfo?.username} (${userInfo?.role})`,
    );
    return {
      isAuthenticated: true,
      authInfo,
      user: userInfo,
      sessionId: options.extra.sessionId,
    };
  }

  // For stdio transport or testing, use mock authentication
  const apiKey = process.env.DEMO_API_KEY || "api_key_user_456";
  const authInfo = mockUsers[apiKey];

  if (authInfo) {
    const userInfo = authInfo.extra as unknown as DemoUserInfo;
    console.error(
      `[Auth] Environment auth: ${userInfo?.username} (${userInfo?.role})`,
    );
    return {
      isAuthenticated: true,
      authInfo,
      user: userInfo,
      sessionId: "demo-session",
    };
  }

  console.error(`[Auth] No valid authentication found`);
  return {
    isAuthenticated: false,
  };
}

export function checkPermission(
  auth: AuthContext,
  permission: string,
): boolean {
  if (!auth.isAuthenticated || !auth.user) {
    return false;
  }

  return (
    auth.user.permissions.includes(permission) || auth.user.role === "admin"
  );
}

export function requireAuth(auth: AuthContext, permission?: string): void {
  if (!auth.isAuthenticated) {
    throw new Error(
      "Authentication required. Please provide valid credentials.",
    );
  }

  if (permission && !checkPermission(auth, permission)) {
    throw new Error(`Insufficient permissions. Required: ${permission}`);
  }
}
