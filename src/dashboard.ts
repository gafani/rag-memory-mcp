import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getTable } from './lib/db.js';
import open from 'open';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'net';
import { marked } from 'marked';

dotenv.config();

const dirName = path.basename(process.cwd());
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

        // 마크다운을 HTML로 변환
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

    return c.json(formatted);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to fetch memories' }, 500);
  }
});

// UI: 대시보드 HTML (내장)
const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Memory Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="bg-white shadow-sm p-4 z-10">
        <div class="max-w-7xl mx-auto flex justify-between items-center gap-4">
            <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2 whitespace-nowrap">
                🧠 RAG Memory Viewer (${dirName})
            </h1>

            <!-- 검색 기능 -->
            <div class="flex-1 max-w-xl">
                 <input type="text"
                        id="search-input"
                        placeholder="Search content, agent, or path..."
                        class="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        oninput="filterMemories(this.value)">
            </div>

            <div class="text-sm text-gray-500 whitespace-nowrap" id="total-count">Loading...</div>
        </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 overflow-hidden bg-gray-50">
        <main class="h-full w-full p-6 overflow-y-auto">
            <div id="memory-list" class="space-y-4 max-w-5xl mx-auto">
                <div class="text-center text-gray-400 mt-20">
                    Loading memories...
                </div>
            </div>
        </main>
    </div>

    <script>
        let allMemories = [];

        // 데이터 로드
        async function loadMemories() {
            try {
                const res = await fetch('/api/memories');
                allMemories = await res.json();
                document.getElementById('total-count').innerText = 'Total Memories: ' + allMemories.length;
                // 로드 후 바로 전체 렌더링
                renderMemories(allMemories);
            } catch (e) {
                console.error(e);
                alert('데이터 로드 실패');
            }
        }

        // 검색 필터링
        function filterMemories(query) {
            if (!query) {
                renderMemories(allMemories);
                return;
            }

            const lowerQuery = query.toLowerCase();
            const filtered = allMemories.filter(m => {
                const contentMatch = (m.content || '').toLowerCase().includes(lowerQuery);
                const agentMatch = (m.agent || '').toLowerCase().includes(lowerQuery);
                const pathMatch = (m.path || '').toLowerCase().includes(lowerQuery);
                return contentMatch || agentMatch || pathMatch;
            });

            renderMemories(filtered);
        }

        // 메모리 리스트 렌더링
        function renderMemories(list) {
            const container = document.getElementById('memory-list');
            if (list.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-400 py-10">검색 결과가 없습니다.</div>';
                return;
            }

            container.innerHTML = list.map(m => \`
                <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">\${m.agent}</span>
                            <span class="text-xs text-gray-500">\${m.formattedDate || ''}</span>
                        </div>
                        <button class="text-gray-400 hover:text-gray-600" title="\${m.id}">🆔</button>
                    </div>
                    <div class="prose prose-sm max-w-none text-gray-800">\${m.contentHtml || m.content}</div>
                    <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 font-mono truncate">📍 \${m.path}</div>
                </div>
            \`).join('');
        }

        loadMemories();
    </script>
</body>
</html>`;

app.get('/', (c) => c.html(htmlContent));

// 사용 가능한 포트 찾기
function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const maxAttempts = 10;

    const tryPort = (port: number, attempt: number) => {
      if (attempt >= maxAttempts) {
        reject(new Error(`No available port found after ${maxAttempts} attempts`));
        return;
      }

      const server = createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          // 포트가 이미 사용 중이면 다음 포트 시도
          server.close();
          tryPort(port + 1, attempt + 1);
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

    tryPort(startPort, 0);
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
