export interface MemoryRecord {
  id: string;
  path: string;
  agent: string;
  timestamp: number;
  content: string;
  vector?: number[];
}

/**
 * A distance field that may be included in LanceDB search results.
 * (We use the shape where the LanceDB SDK adds `_distance` to the raw row.)
 */
export interface LanceDbSearchRow extends MemoryRecord {
  _distance?: number;
}

/**
 * Record shape accepted as `rerank` input.
 * - Either the existing vector search score (`score`) or the LanceDB distance (`_distance`) is sufficient.
 */
export interface RerankInputRecord extends MemoryRecord {
  score?: number;
  _distance?: number;
}

/**
 * Common type representing a “document with a score” across the system.
 * - Vector search: typically a distance/similarity-based value
 * - Reranking: an LLM-based relevance score
 */
export interface ScoredMemoryRecord extends MemoryRecord {
  score: number;
}
