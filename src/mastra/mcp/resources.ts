import {
  MCPServerResourceContent,
  MCPServerResources,
  Resource,
} from "@mastra/mcp";

const schemaText = `
tables:
  users(id, name, city, joined)
  orders(id, user_id -> users.id, total, created)
notes:
  - read-only access
  - prefer aggregates + LIMIT for safety
examples:
  - "List distinct cities from users"
  - "Total order spend by user"
`;

const resourceHandlers: MCPServerResources = {
  listResources: async (): Promise<Resource[]> => [
    {
      uri: "schema://main",
      name: "Database schema",
      description: "Complete database schema with examples",
      mimeType: "text/plain",
    },
  ],
  getResourceContent: async ({ uri }): Promise<MCPServerResourceContent> => {
    if (uri === "schema://main") {
      return { text: schemaText };
    }
    throw new Error(`Resource not found: ${uri}`);
  },
};

export default resourceHandlers;
