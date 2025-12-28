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
import { startDashboard } from "./dashboard.js";

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
        description: "지식 베이스에 정보를 저장합니다",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "기억할 내용",
            },
            agent_name: {
              type: "string",
              description: "기록하는 Agent 이름",
            },
            path: {
              type: "string",
              description: "작업 디렉토리 경로 (선택사항)",
            },
          },
          required: ["content", "agent_name"],
        },
      },
      {
        name: "recall",
        description: "지식 베이스에서 관련 정보를 검색합니다",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "검색할 내용",
            },
            agent_name: {
              type: "string",
              description: "Agent 이름으로 필터링 (선택사항)",
            },
            path: {
              type: "string",
              description: "경로로 필터링 (선택사항)",
            },
          },
          required: ["query"],
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
          text: `성공적으로 기억했습니다 (ID: ${id})`,
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

    // Get embedding for query
    const queryVector = await getEmbedding(query);

    // First search
    const rawSearchResults = await searchMemory(
      queryVector,
      {
        agent: agent_name,
        path: inputPath,
      },
      25
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
            text: "관련된 기억을 찾을 수 없습니다.",
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
          text: `검색 결과:\n\n${formattedResults}`,
        },
      ],
    };
  }

  throw new Error(`알 수 없는 도구: ${name}`);
});

// Startup
async function main() {
  try {
    // Check for --disable-gui flag
    const disableGui = process.argv.includes('--disable-gui');

    if (disableGui) {
      console.error('Dashboard disabled by flag');
    } else {
      // Start dashboard in background (don't await)
      startDashboard().catch(console.error);
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
