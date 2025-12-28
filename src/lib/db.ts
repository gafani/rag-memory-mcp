import { connect } from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import type { MemoryRecord } from './types.js';

const DB_DIR = path.join(process.cwd(), '.rag-for-agent-mcp', 'lancedb');

/**
 * LanceDB 테이블을 가져옵니다. 존재하지 않으면 생성합니다.
 */
export async function getTable() {
  // 상위 디렉토리 생성
  const dbParentDir = path.dirname(DB_DIR);
  if (!fs.existsSync(dbParentDir)) {
    fs.mkdirSync(dbParentDir, { recursive: true });
  }

  // DB 연결
  const db = await connect(DB_DIR);

  // 테이블 존재 여부 확인 후 가져오기 또는 생성
  const tableName = 'memories';
  const tableNames = await db.tableNames();

  if (tableNames.includes(tableName)) {
    return await db.openTable(tableName);
  }

  // 테이블이 없으면 생성 - 더미 데이터로 초기화 후 삭제
  const dummyRecord = {
    id: 'init',
    vector: Array(768).fill(0),
    path: '',
    agent: '',
    content: '',
    timestamp: 0,
  };

  await db.createTable(tableName, [dummyRecord], { existOk: true });

  const table = await db.openTable(tableName);

  // 더미 레코드 삭제
  await table.delete('id = "init"');

  return table;
}

/**
 * 메모리를 저장합니다.
 */
export async function saveMemory(record: MemoryRecord): Promise<void> {
  const table = await getTable();
  await table.add([record as unknown as Record<string, unknown>]);
}

/**
 * 벡터로 메모리를 검색합니다.
 */
export async function searchMemory(
  vector: number[],
  filter?: { path?: string; agent?: string },
  limit: number = 25
): Promise<any[]> {
  const table = await getTable();

  let query = table.search(vector);

  if (filter) {
    const conditions: string[] = [];
    if (filter.path) {
      conditions.push(`path = '${filter.path}'`);
    }
    if (filter.agent) {
      conditions.push(`agent = '${filter.agent}'`);
    }
    if (conditions.length > 0) {
      query = query.where(conditions.join(' AND '));
    }
  }

  const results = await query.limit(limit).toArray();
  return results;
}
