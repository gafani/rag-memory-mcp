export interface MemoryRecord {
  id: string;
  path: string;
  agent: string;
  timestamp: number;
  content: string;
  vector?: number[];
}
