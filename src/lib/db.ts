import { connect } from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import type { MemoryRecord } from './types.js';

const DB_DIR = path.join(process.cwd(), '.rag-for-agent-mcp', 'lancedb');

/**
 * Get the LanceDB table. Create it if missing.
 */
export async function getTable() {
  // Create parent directory
  const dbParentDir = path.dirname(DB_DIR);
  if (!fs.existsSync(dbParentDir)) {
    fs.mkdirSync(dbParentDir, { recursive: true });
  }

  // Connect to DB
  const db = await connect(DB_DIR);

  // Open existing table or create a new one
  const tableName = 'memories';
  const tableNames = await db.tableNames();

  if (tableNames.includes(tableName)) {
    return await db.openTable(tableName);
  }

  // Create table if missing - initialize with a dummy row, then delete it
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

  // Delete dummy record
  await table.delete('id = "init"');

  return table;
}

/**
 * Save a memory record.
 */
export async function saveMemory(record: MemoryRecord): Promise<void> {
  const table = await getTable();
  await table.add([record as unknown as Record<string, unknown>]);
}

/**
 * Search memories by vector.
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
