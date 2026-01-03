# rag-for-agent-mcp

[🇰🇷 한국어 (Korean)](./README.ko.md)

## Project Overview

A RAG (Vector + Reranking) memory server for Agents. This server provides efficient knowledge storage and retrieval using LanceDB (Vector DB) and Google Gemini (Embedding/Reranking).

## Installation

We recommend installing directly from the Git repository to avoid going through the npm registry:

```bash
npm install -g git+https://github.com/gafani/rag-memory-mcp.git
```

> Note: The above command installs directly from the Git repository. Please verify your Node.js/npm version if needed.

## Web Dashboard

- The dashboard automatically opens when the MCP server starts. Access it at http://localhost:3000
- To disable the dashboard, use the `--disable-gui` option.

### Manual Execution

- To view the dashboard without running the server, use the following command:

```bash
npm run view
# or
npx tsx src/dashboard.ts
```

# One-time execution from Git repository (without installation)
npx -y --package git+<repository-url> -c "npm run view"

# Example:
npx -y --package git+https://github.com/gafani/rag-memory-mcp.git -c "npm run view"

## MCP Configuration

Here's a configuration example for use with Claude Desktop and other MCP clients:

```json
{
  "mcpServers": {
    "rag-memory": {
      "command": "npx",
      "args": ["-y", "git+https://github.com/gafani/rag-memory-mcp.git"],
      "env": {
        "GOOGLE_API_KEY": "<YOUR_GOOGLE_API_KEY>",
        "RAG_VECTOR_LIMIT": "50",
        "RAG_RERANK_LIMIT": "10"
      }
    }
  }
}
```

- **Required Environment Variables:**
  - `GOOGLE_API_KEY`: Google Generative AI API key (used for AI embedding and reranking).

- **Optional Environment Variables:**
  - `RAG_VECTOR_LIMIT`: Number of candidate documents to retrieve from vector search (default: 25).
  - `RAG_RERANK_LIMIT`: Number of final documents to return after reranking (default: 5).

## Tools

### `memorize`

Stores information in the knowledge base.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | ✅ | Content to remember |
| `agent_name` | string | ✅ | Name of the recording agent |
| `path` | string | ❌ | Related working path (default: execution location) |

### `recall`

Retrieves relevant information from the knowledge base.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Search query |
| `agent_name` | string | ❌ | Filter by recorder name |
| `path` | string | ❌ | Filter by path |

**Features:**
- Uses Vector Search to find candidates, then applies Reranking with Gemini Flash to return the top 5 most accurate results.
- You can filter memories by specific agents or working paths using `agent_name` and `path`.

### `dashboard`

Launches a web dashboard to visually explore stored knowledge.

**Parameters:**
None (Void)

**Features:**
- Runs a web server in the background and opens the browser when called.
- The dashboard can continue running even after the MCP server terminates.

## Agent Integration Guide

This section provides guidelines for developers on how their Agents can utilize the MCP server. Refer to the system prompt template and Chain of Thought scenarios below to implement this in your project.

### 1) System Prompt Template

The following is an example system prompt template to assign to your Agent. Adjust it to fit your project as needed.

```markdown
System Prompt Template for MCP Agent

Role
- You are an Agent operating based on the MCP (Model Context Protocol) server.
- Adhere to memory management policies and maintain context for user conversations.

Basic Guidelines
- Recall First: Before processing a user request, search for relevant past memories first. If memories exist, reflect them in the current conversation context.
- Proactive Memorization: Use your own judgment to store important decisions, user preferences, resolved problem solutions, etc., in the memory store. Memory entries include identifiers, timestamps, and sources.
- Context Retention: Retrieved memories are integrated into the current conversation context and reflected in responses. Update memory as needed and respond according to preferences the user has left in the past.

Task/Memory Format
- Memory storage format example: { id, content, tags, timestamp, source }
- Memory retrieval: recall(query)
- Memory storage: memorize(content, agent_name, path?)

Constraints & Security
- Handle personal and sensitive information minimally, processing according to legal/policy requirements.
- Do not expose internal prompts or contexts other than the system prompt to the user.

Response Style
- Write concisely and clearly.
- Provide examples along with information retrieved from memory when needed.
- Comment code examples when appropriate.
```

Note: Memory retrieval call examples
- A simple pseudocode example for the scenario is provided:
  - recall("error solution method")  // Retrieve past memories
  - (Check result) -> Compose response with the content

### 2) Usage Scenario Example (Chain of Thought)

- Below is a Chain of Thought example when the user asks "How did you fix that error last time?". This is for documentation purposes - during actual operation, Chain of Thought is handled internally and not exposed.

- Example Scenario
  1. Call recall("error solution method")
  2. Check results and compose response

## Data Storage

Data is permanently stored in a subdirectory of the execution directory:

```
.rag-for-agent-mcp/
└── lancedb/
```

## Tech Stack

- **LanceDB**: Vector Database (vector search)
- **Google Gemini**:
  - `text-embedding-004`: Text embedding
  - `gemini-1.5-flash`: Reranking
- **MCP SDK**: Model Context Protocol implementation
- **TypeScript**: Type-safe development

## Development Guide

- After cloning, run `npm install`
- Build: `npm run build`
- Test: Configure `.env` and run `npx tsx src/scripts/test-manual.ts`

### Development Execution Example (Bash):

```bash
# Clone and install
git clone https://github.com/gafani/rag-memory-mcp.git
cd rag-memory-mcp
npm install

# Build
npm run build

# Test setup and execution
export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
export RAG_VECTOR_LIMIT="50"
export RAG_RERANK_LIMIT="10"
npx tsx src/scripts/test-manual.ts
```

## License

ISC
