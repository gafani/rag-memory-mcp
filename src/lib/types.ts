export interface MemoryRecord {
  id: string;
  path: string;
  agent: string;
  timestamp: number;
  content: string;
  vector?: number[];
}

/**
 * LanceDB 검색 결과에 포함될 수 있는 거리(distance) 필드.
 * (LanceDB SDK가 반환하는 raw row에 `_distance`가 붙는 형태를 사용합니다.)
 */
export interface LanceDbSearchRow extends MemoryRecord {
  _distance?: number;
}

/**
 * `rerank` 입력으로 허용되는 레코드 형태.
 * - 기존 벡터 검색 점수(`score`) 또는 LanceDB 거리(`_distance`) 중 하나만 있어도 됩니다.
 */
export interface RerankInputRecord extends MemoryRecord {
  score?: number;
  _distance?: number;
}

/**
 * 시스템 전반에서 “점수(score)가 있는 문서”를 표현하는 공통 타입.
 * - 벡터 검색: 보통 distance/similarity 기반 값
 * - 재랭킹: LLM 기반 relevance score
 */
export interface ScoredMemoryRecord extends MemoryRecord {
  score: number;
}
