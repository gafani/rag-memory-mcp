import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getTable } from './lib/db.js';
import open from 'open';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import { marked } from 'marked';
import fs from 'fs';

// ESM에서 __dirname 대체: 현재 파일 위치 기준 경로
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dirName = path.basename(process.cwd());
const app = new Hono();

// API: List memories (pagination supported)
// Query params: limit (default 5), offset (default 0)
app.get('/api/memories', async (c) => {
  try {
    const table = await getTable();

    // Parse pagination parameters
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 20;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;

    // Fetch all data, then sort/filter on the client side
    // Due to LanceDB query sorting constraints, fetch all then sort
    const allResults = await table.query().limit(10000).toArray();

    // Format dates and sort (newest first)
    const cwd = process.cwd();
    const formatted = allResults
      .map((r: any) => {
        let relativePath = r.path;

        // Convert absolute path to relative path
        if (r.path && r.path.startsWith(cwd)) {
          relativePath = r.path.slice(cwd.length);
          // Remove leading slashes/backslashes
          relativePath = relativePath.replace(/^[\/\\]+/, '');
        }

        // Display '(root)' when path is empty
        if (!relativePath || relativePath.trim() === '') {
          relativePath = '(root)';
        }

        // Convert Markdown to HTML
        const contentHtml = r.content ? marked.parse(r.content) : '';

        return {
          ...r,
          path: relativePath,
          formattedDate: new Date(r.timestamp).toLocaleString(),
          pathParts: relativePath ? relativePath.split(/[/\\]/).filter((p: string) => p && p !== ':') : [],
          contentHtml
        };
      })
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    // 페이지네이션 적용
    const total = formatted.length;
    const items = formatted.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    // 페이지네이션 응답 반환
    return c.json({
      items,
      total,
      hasMore,
      offset,
      limit
    });
  } catch (error) {
    console.error(error);
    const err = error instanceof Error ? error : new Error(String(error));
    return c.json(
      {
        error: 'Failed to fetch memories',
        details: err.message,
        stack: err.stack,
      },
      500
    );
  }
});

// UI: 대시보드 HTML (외부 파일에서 로드)
// 현재 파일 위치(__dirname) 기준으로 views/dashboard.html을 찾음 (CWD 무관)
function loadHtmlTemplate(): string {
  const htmlPath = path.join(__dirname, 'views', 'dashboard.html');
  const template = fs.readFileSync(htmlPath, 'utf-8');
  return template.replace('{{DIR_NAME}}', dirName);
}

app.get('/', (c) => c.html(loadHtmlTemplate()));

// 사용 가능한 포트 찾기
function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > 65535) {
        reject(new Error('No available port found: reached system port limit (65535)'));
        return;
      }

      const server = createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // 포트가 이미 사용 중이면 다음 포트 시도
          server.close();
          tryPort(port + 1);
        } else {
          server.close();
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => {
          resolve(port);
        });
      });

      server.listen(port);
    };

    tryPort(startPort);
  });
}


async function startDashboard() {
  try {
    const foundPort = await findAvailablePort(4567);

    serve({
      fetch: app.fetch,
      port: foundPort
    }, (info) => {
      const actualPort = info.port;
      console.error(`Server is running on http://localhost:${actualPort} (${dirName})`);
      open(`http://localhost:${actualPort}`).catch(console.error);
    });
  } catch (error) {
    console.error('Failed to find available port:', error);
    process.exit(1);
  }
}

startDashboard();
