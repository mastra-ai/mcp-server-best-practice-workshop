import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { server } from "./mcp/server";

export const mastra = new Mastra({
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  mcpServers: {
    customerAnalytics: server,
  },
});
