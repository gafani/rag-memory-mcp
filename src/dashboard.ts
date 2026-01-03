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

// API: 메모리 목록 조회 (페이지네이션 지원)
// 쿼리 파라미터: limit (기본값 5), offset (기본값 0)
app.get('/api/memories', async (c) => {
  try {
    const table = await getTable();

    // 페이지네이션 파라미터 파싱
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 5;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10)) : 0;

    // 전체 데이터를 가져와서 클라이언트 측 정렬 및 필터링 수행
    // LanceDB 쿼리 정렬 제약으로 인해 전체를 가져온 후 정렬
    const allResults = await table.query().limit(10000).toArray();

    // 날짜 포맷팅 및 정렬 (최신순)
    const cwd = process.cwd();
    const formatted = allResults
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

// UI: 대시보드 HTML (내장)
const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Memory Viewer</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <script src="//unpkg.com/3d-force-graph"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['"Noto Sans KR"', 'sans-serif'],
                        mono: ['"JetBrains Mono"', 'monospace'],
                    },
                },
            },
        }
    </script>
</head>
    <body class="bg-gray-100 h-screen flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="bg-white shadow-sm p-4 z-10">
        <div class="max-w-7xl mx-auto flex justify-between items-center gap-4">
            <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2 whitespace-nowrap">
                🧠 RAG Memory Viewer (${dirName})
            </h1>

            <!-- Agent Galaxy Button -->
            <button id="toggle-graph"
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors flex items-center gap-2"
                    onclick="toggleGraph()">
                🌌 Agent Galaxy
            </button>

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

    <!-- Graph Container -->
    <div id="graph-container" class="hidden bg-slate-900 border-b-2 border-slate-700">
        <div id="3d-graph" class="w-full h-[400px]"></div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 overflow-hidden bg-gray-50">
        <main class="h-full w-full p-6 overflow-y-auto">
            <div id="memory-list" class="space-y-4 max-w-5xl mx-auto">
                <div class="text-center text-gray-400 mt-20">
                    Loading memories...
                </div>
            </div>

            <!-- Load More Button -->
            <div id="load-more-container" class="flex justify-center mt-8 mb-8 hidden">
                <button id="load-more-btn"
                        onclick="loadMemories(false)"
                        class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    더보기
                </button>
            </div>
        </main>
    </div>

    <script>
        // State management
        let allMemories = [];          // 모든 메모리 (검색 필터링용)
        let displayedMemories = [];     // 현재 표시 중인 메모리
        let graphInstance = null;
        let graphVisible = false;

        // Pagination state
        let currentOffset = 0;
        const PAGE_SIZE = 20;
        let isLoading = false;
        let hasMore = true;
        let totalCount = 0;

        // 그래프 토글
        function toggleGraph() {
            const container = document.getElementById('graph-container');
            const button = document.getElementById('toggle-graph');
            graphVisible = !graphVisible;

            if (graphVisible) {
                container.classList.remove('hidden');
                button.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                button.classList.add('bg-slate-700', 'hover:bg-slate-800');
                if (!graphInstance) {
                    renderGraph();
                } else {
                    graphInstance.resumeAnimation();
                }
            } else {
                container.classList.add('hidden');
                button.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                button.classList.remove('bg-slate-700', 'hover:bg-slate-800');
                if (graphInstance) {
                    graphInstance.pauseAnimation();
                }
            }
        }

        // 색상 해시 함수 - 에이전트 이름으로 일관된 색상 생성
        function stringToColor(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            const hue = Math.abs(hash % 360);
            return 'hsl(' + hue + ', 70%, 60%)';
        }

        // 그래프 렌더링
        function renderGraph() {
            const elem = document.getElementById('3d-graph');
            if (!elem) return;

            if (allMemories.length === 0) {
                // 기존 그래프 인스턴스 제거
                if (graphInstance) {
                    graphInstance._destructor();
                    graphInstance = null;
                }
                // 빈 상태 메시지 표시
                elem.innerHTML =
                    '<div class="flex items-center justify-center h-full">' +
                    '    <div class="text-center">' +
                    '        <div class="text-6xl mb-4">🌌</div>' +
                    '        <p class="text-gray-300 text-lg font-medium">No memory data available to visualize yet.</p>' +
                    '        <p class="text-gray-500 text-sm mt-2">Add memories to see the Agent Galaxy graph.</p>' +
                    '    </div>' +
                    '</div>';
            }

            // 에이전트별 메모리 개수 집계
            const agentCounts = new Map();
            const agents = new Set();

            allMemories.forEach(m => {
                if (m.agent) {
                    const count = agentCounts.get(m.agent) || 0;
                    agentCounts.set(m.agent, count + 1);
                    agents.add(m.agent);
                }
            });

            // 노드 생성
            const nodes = Array.from(agents).map(agent => ({
                id: agent,
                val: agentCounts.get(agent) || 1,
                color: stringToColor(agent)
            }));

            // 링크 생성 - 메모리 내에서 다른 에이전트 언급(@targetAgent) 감지
            const links = [];
            const agentRegex = /@(\w+)/g;

            allMemories.forEach(m => {
                const sourceAgent = m.agent;
                if (!sourceAgent) return;

                const content = m.content || '';
                let match;
                const mentionedAgents = new Set();

                while ((match = agentRegex.exec(content)) !== null) {
                    const targetAgent = match[1];
                    mentionedAgents.add(targetAgent);
                }

                mentionedAgents.forEach(targetAgent => {
                    if (targetAgent !== sourceAgent && agents.has(targetAgent)) {
                        links.push({
                            source: sourceAgent,
                            target: targetAgent
                        });
                    }
                });
            });

            // 그래프 초기화 - 빈 상태 메시지 제거
            elem.innerHTML = '';

            graphInstance = ForceGraph3D()(elem)
                .graphData({ nodes, links })
                .nodeLabel('id')
                .nodeAutoColorBy('group')
                .nodeVal('val')
                .linkWidth(1)
                .linkColor(() => 'rgba(255, 255, 255, 0.3)')
                .backgroundColor('#0f172a')
                .onNodeClick((node) => {
                    // 노드 클릭 시 해당 에이전트의 메모리만 필터링
                    filterMemories('@' + node.id);
                });
        }

        // 초기 메모리 로드
        async function loadMemories(reset = true) {
            console.log('[loadMemories] Called with reset:', reset, 'currentOffset:', currentOffset);

            if (reset) {
                currentOffset = 0;
                displayedMemories = [];
                hasMore = true;
            }

            // 로딩 중이거나 더 로드할 항목이 없으면 중단
            if (isLoading || !hasMore) {
                console.log('[loadMemories] Skipping - isLoading:', isLoading, 'hasMore:', hasMore);
                return;
            }

            isLoading = true;
            updateLoadMoreButton();

            try {
                // 검색 쿼리가 있으면 검색 모드, 아니면 전체 로드
                const searchInput = document.getElementById('search-input');
                const query = searchInput ? searchInput.value.trim() : '';

                const url = query
                    ? \`/api/memories?limit=\${PAGE_SIZE}&offset=\${currentOffset}\`
                    : \`/api/memories?limit=\${PAGE_SIZE}&offset=\${currentOffset}\`;

                const res = await fetch(url);

                if (!res.ok) {
                    throw new Error(\`HTTP error! status: \${res.status}\`);
                }

                const data = await res.json();

                // 응답 데이터 처리 (호환성 고려)
                const items = data.items || (Array.isArray(data) ? data : []);
                const total = data.total !== undefined ? data.total : items.length;
                hasMore = data.hasMore !== undefined ? data.hasMore : (items.length === PAGE_SIZE);
                totalCount = total;

                // 메모리 배열에 추가
                if (reset) {
                    displayedMemories = items;
                } else {
                    displayedMemories = displayedMemories.concat(items);
                }

                // 검색 모드가 아닐 때만 allMemories 업데이트
                if (!query) {
                    allMemories = displayedMemories;
                }

                // 오프셋 업데이트
                currentOffset += items.length;

                // UI 업데이트
                // reset이 false면 새로 받아온 items만 append 모드로 렌더링
                if (reset) {
                    renderMemories(displayedMemories, false);
                } else {
                    renderMemories(items, true);
                }
                updateTotalCount();
                updateLoadMoreButton();

                // 그래프 렌더링 (검색 모드가 아닐 때만)
                if (!query && reset) {
                    renderGraph();
                }

            } catch (e) {
                console.error('데이터 로드 실패:', e);
                showError('데이터 로드 실패: ' + (e.message || '알 수 없는 오류'));
                hasMore = false;
            } finally {
                isLoading = false;
                updateLoadMoreButton();
            }
        }

        // Load More 버튼 업데이트
        function updateLoadMoreButton() {
            const button = document.getElementById('load-more-btn');
            if (!button) return;

            if (isLoading) {
                button.disabled = true;
                button.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> 로딩 중...';
                button.classList.add('opacity-50', 'cursor-not-allowed');
            } else if (!hasMore || displayedMemories.length >= totalCount) {
                button.disabled = true;
                button.innerHTML = '모든 항목을 불러왔습니다';
                button.classList.add('opacity-50', 'cursor-not-allowed');
                button.style.display = 'none'; // 모두 불러오면 버튼 숨김
            } else {
                button.disabled = false;
                const remaining = totalCount - displayedMemories.length;
                button.innerHTML = \`더보기 (\${remaining}개 남음)\`;
                button.classList.remove('opacity-50', 'cursor-not-allowed');
                button.style.display = 'block';
            }
        }

        // 총 개수 표시 업데이트
        function updateTotalCount() {
            const totalCountEl = document.getElementById('total-count');
            if (totalCountEl) {
                if (totalCount > 0) {
                    totalCountEl.innerText = \`총 \${totalCount}개 중 \${displayedMemories.length}개 표시\`;
                } else {
                    totalCountEl.innerText = '저장된 메모리가 없습니다';
                }
            }
        }

        // 에러 메시지 표시
        function showError(message) {
            const container = document.getElementById('memory-list');
            const errorHtml = \`
                <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                    <p>\${message}</p>
                    <button onclick="this.parentElement.remove()" class="mt-2 text-red-600 hover:text-red-800 text-sm">닫기</button>
                </div>
            \`;
            container.insertAdjacentHTML('afterbegin', errorHtml);
        }

        // 검색 필터링
        function filterMemories(query) {
            if (!query) {
                // 검색어가 비어 있으면 초기화 후 다시 로드
                loadMemories(true);
                return;
            }

            // @agentName 형식인지 확인
            const agentMatch = query.match(/^@(\w+)$/);
            let lowerQuery = query.toLowerCase();

            const filtered = displayedMemories.filter(m => {
                if (agentMatch) {
                    // @agentName 형식이면 정확한 에이전트 이름 매칭
                    return m.agent === agentMatch[1];
                }

                const contentMatch = (m.content || '').toLowerCase().includes(lowerQuery);
                const agentNameMatch = (m.agent || '').toLowerCase().includes(lowerQuery);
                const pathMatch = (m.path || '').toLowerCase().includes(lowerQuery);
                return contentMatch || agentNameMatch || pathMatch;
            });

            // 검색 결과가 있으면 로드 모어 버튼 숨김
            displayedMemories = filtered;
            renderMemories(filtered, false);

            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = 'none';
            }

            // 총 개수 업데이트
            const totalCountEl = document.getElementById('total-count');
            if (totalCountEl) {
                totalCountEl.innerText = '검색 결과: ' + filtered.length + '개';
            }
        }

        // 메모리 리스트 렌더링 (추가 모드 지원)
        function renderMemories(list, append = false) {
            const container = document.getElementById('memory-list');
            const loadMoreContainer = document.getElementById('load-more-container');

            if (!append) {
                // 기존 내용 초기화
                container.innerHTML = '';
            }

            if (list.length === 0) {
                if (!append) {
                    container.innerHTML = '<div class="text-center text-gray-400 py-10">검색 결과가 없습니다.</div>';
                }
                // Load More 버튼 숨기기
                if (loadMoreContainer) {
                    loadMoreContainer.classList.add('hidden');
                }
                return;
            }

            // Load More 버튼 표시
            if (loadMoreContainer) {
                loadMoreContainer.classList.remove('hidden');
            }

            // 리스트가 비어있거나 append 모드가 아니면 전체 렌더링
            if (container.innerHTML === '' || !append) {
                container.innerHTML = list.map(m => createMemoryCard(m)).join('');
            } else {
                // append 모드: 전달받은 list의 모든 아이템을 순회하며 추가
                list.forEach(m => {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = createMemoryCard(m);
                    const cardElement = tempDiv.querySelector('div');
                    if (cardElement) {
                        container.appendChild(cardElement);
                    } else {
                        console.error('[renderMemories] Failed to create card element for:', m.id);
                    }
                });
            }
        }

        // 메모리 카드 HTML 생성
        function createMemoryCard(m) {
            return \`<div class="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">\${m.agent}</span>
                            <span class="text-xs text-gray-500">\${m.formattedDate || ''}</span>
                        </div>
                        <button class="text-gray-400 hover:text-gray-600" title="\${m.id}">🆔</button>
                    </div>
                    <div class="prose prose-sm max-w-none text-gray-800">\${m.contentHtml || m.content}</div>
                    <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 font-mono truncate">📍 \${m.path}</div>
                </div>\`;
        }

        // 페이지 로드 시 초기 메모리 로드
        document.addEventListener('DOMContentLoaded', () => {
            loadMemories(true);
        });
    </script>
</body>
</html>`;

app.get('/', (c) => c.html(htmlContent));

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
