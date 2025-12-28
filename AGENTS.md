# Rules

## External File Loading
CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.
Instructions:
- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## Project Standards
- **Runtime**: Node.js v24.12.0
- **Language**: TypeScript (ESM)
- **Architecture**: Model Context Protocol (MCP) Server
- **Core Libraries**: `@lancedb/lancedb`, `@google/generative-ai`
- **Conventions**:
  - Prefer `zod` for input validation
  - Use `async/await` for all I/O operations
