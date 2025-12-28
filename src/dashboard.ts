import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getTable } from './lib/db.js';
import open from 'open';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

dotenv.config();

const app = new Hono();

// API: 메모리 목록 조회
app.get('/api/memories', async (c) => {
  try {
    const table = await getTable();
    const results = await table.query().limit(10000).toArray();

    // 날짜 포맷팅 및 정렬 (최신순)
    const cwd = process.cwd();
    const formatted = results
      .map((r: any) => {
        let relativePath = r.path;

        // 절대 경로를 상대 경로로 변환
        if (r.path && r.path.startsWith(cwd)) {
          relativePath = r.path.slice(cwd.length);
          // 선행 슬래시/백슬래시 제거
          relativePath = relativePath.replace(/^[\/\\]+/, '');
        }

        // 빈 경로면 (root)로 표시
        if (!relativePath || relativePath.trim() === '') {
          relativePath = '(root)';
        }

        return {
          ...r,
          path: relativePath,
          formattedDate: new Date(r.timestamp).toLocaleString(),
          pathParts: relativePath ? relativePath.split(/[/\\]/).filter((p: string) => p && p !== ':') : []
        };
      })
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    return c.json(formatted);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to fetch memories' }, 500);
  }
});

// UI: 대시보드 HTML
app.get('/', (c) => {
  const htmlPath = path.join(process.cwd(), 'src', 'dashboard.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return c.html(htmlContent);
});

export async function startDashboard(port: number = 3000) {
  console.error('Server is running on http://localhost:' + port);

  serve({
    fetch: app.fetch,
    port
  }, (info) => {
    open('http://localhost:' + info.port);
  });
}

// 파일이 직접 실행될 때만 대시보드 시작
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDashboard();
}