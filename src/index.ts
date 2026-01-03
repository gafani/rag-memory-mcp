#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { getEmbedding, rerank } from "./lib/ai.js";
import { getTable, saveMemory, searchMemory } from "./lib/db.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

export { saveMemory, searchMemory, getEmbedding, rerank };

// Server Initialization
const server = new Server(
  {
    name: "rag-for-agent-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tools List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "memorize",
        description: "Stores information in the knowledge base",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Content to store",
            },
            agent_name: {
              type: "string",
              description: "Recording agent name",
            },
            path: {
              type: "string",
              description: "Working directory path (optional)",
            },
          },
          required: ["content", "agent_name"],
        },
      },
      {
        name: "recall",
        description: "Searches for related information in the knowledge base",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
            agent_name: {
              type: "string",
              description: "Filter by agent name (optional)",
            },
            path: {
              type: "string",
              description: "Filter by path (optional)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "dashboard",
        description: "Runs the dashboard in the background",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  };
});

// Request Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "memorize") {
    // Validate arguments
    const schema = z.object({
      content: z.string(),
      agent_name: z.string(),
      path: z.string().optional(),
    });

    const { content, agent_name, path: inputPath } = schema.parse(args);

    // Get embedding
    const vector = await getEmbedding(content);

    // Save memory
    const id = uuidv4();
    const timestamp = Date.now();
    const workPath = inputPath || process.cwd();

    await saveMemory({
      id,
      content,
      agent: agent_name,
      path: workPath,
      vector,
      timestamp,
    });

    return {
      content: [
        {
          type: "text",
          text: `Memory stored successfully (ID: ${id})`,
        },
      ],
    };
  }

  if (name === "recall") {
    // Validate arguments
    const schema = z.object({
      query: z.string(),
      agent_name: z.string().optional(),
      path: z.string().optional(),
    });

    const { query, agent_name, path: inputPath } = schema.parse(args);

    const ragVectorLimitEnv = process.env.RAG_VECTOR_LIMIT;
    const ragVectorLimitNumber = ragVectorLimitEnv ? Number(ragVectorLimitEnv) : NaN;
    const ragVectorLimit = Number.isFinite(ragVectorLimitNumber)
      ? Math.max(1, Math.floor(ragVectorLimitNumber))
      : 25;

    const ragRerankLimitEnv = process.env.RAG_RERANK_LIMIT;
    const ragRerankLimitNumber = ragRerankLimitEnv ? Number(ragRerankLimitEnv) : NaN;
    const ragRerankLimit = Number.isFinite(ragRerankLimitNumber)
      ? Math.max(1, Math.floor(ragRerankLimitNumber))
      : 5;

    // Get embedding for query
    const queryVector = await getEmbedding(query);

    // First search
    const rawSearchResults = await searchMemory(
      queryVector,
      {
        agent: agent_name,
        path: inputPath,
      },
      ragVectorLimit
    );

    // Add score to search results
    const searchResults = rawSearchResults.map((result: any) => ({
      id: result.id,
      content: result.content,
      agent: result.agent,
      path: result.path,
      timestamp: result.timestamp,
      vector: result.vector,
      score: result._distance,
    }));

    // Rerank
    const rerankedResults = await rerank(query, searchResults);

    // Format top 5 results
    const topResults = rerankedResults.slice(0, 5);

    if (topResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No related memories found.",
          },
        ],
      };
    }

    const formattedResults = topResults
      .map((result, index) => {
        return `${index + 1}. [${result.agent}] ${result.content}\n   Path: ${result.path}\n   Timestamp: ${new Date(result.timestamp).toLocaleString()}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Search results:\n\n${formattedResults}`,
        },
      ],
    };
  }

  if (name === "dashboard") {
    return {
      content: [
        {
          type: "text",
          text: "The dashboard starts automatically in the background when the server starts. Check http://localhost:4567 (or the assigned port).",
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Startup
async function main() {
  try {
    // Define __dirname for ES modules
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    // Check for --disable-gui flag
    const disableGui = process.argv.includes('--disable-gui');

    if (disableGui) {
      console.error('Dashboard disabled by flag');
    } else {
      // Determine extension based on the executed file
      const executedFile = process.argv[1];
      const ext = executedFile.endsWith('.ts') ? '.ts' : '.js';

      // Find dashboard path in the same directory
      const dashboardPath = path.join(__dirname, `dashboard${ext}`);

      // Spawn dashboard process
      console.error('Attempting to spawn dashboard at:', dashboardPath);
      const child = spawn(process.execPath, [dashboardPath], {
        detached: true,
        stdio: ['ignore', 'ignore', 'inherit'], // Core: disconnect from parent's stdio
        env: process.env // Inherit environment variables (API KEY, etc.)
      });

      child.unref(); // Allow child to continue running independently if parent exits
      child.on('error', (err) => console.error('Failed to spawn dashboard:', err));
    }

    // Initialize database (getTable initializes the DB on first call)
    await getTable();

    // Connect to transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

main();
