# rag-for-agent-mcp

## 프로젝트 소개

Agent를 위한 RAG(Vector+Reranking) 메모리 서버(기존 내용 유지).

Agent용 RAG 메모리 서버입니다. LanceDB(Vector DB)와 Google Gemini(Embedding/Reranking)를 사용하여 효율적인 지식 저장 및 검색을 제공합니다.

## 설치 방법 (Installation)

메인 설치 방법은 Git 저장소에서 직접 설치하는 방법을 권장합니다. npm 레지스트리를 거치지 않고 바로 설치합니다.

```powershell
npm install -g git+https://forgejo.home/gafani/rag-for-agent-mcp.git
```

> 참고: 위 명령어는 Git 저장소에서 직접 설치합니다. 필요 시 Node.js/npm 버전을 확인해주세요.

## MCP 설정 (Configuration)

Claude Desktop 등에서 사용할 때의 설정 예시를 정확히 보여드립니다:

```json
{
  "mcpServers": {
    "rag-memory": {
      "command": "npx",
      "args": ["-y", "git+https://forgejo.home/gafani/rag-for-agent-mcp.git"],
      "env": {
        "GOOGLE_API_KEY": "<YOUR_GOOGLE_API_KEY>"
      }
    }
  }
}
```

- **필수 환경변수:**
- `GOOGLE_API_KEY`: Google Generative AI API 키 (AI embedding 및 reranking에 사용).

## Tools

### `memorize`

지식 베이스에 정보를 저장합니다.

**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `content` | string | ✅ | 기억할 내용 |
| `agent_name` | string | ✅ | 기록자 이름 |
| `path` | string | ❌ | 관련 작업 경로 (기본값: 실행 위치) |

### `recall`

지식 베이스에서 관련 정보를 검색합니다.

**파라미터:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `query` | string | ✅ | 검색어 |
| `agent_name` | string | ❌ | 기록자 필터 |
| `path` | string | ❌ | 경로 필터 |

**특징:**
- Vector Search로 후보를 찾고, Gemini Flash로 Reranking하여 정확도 높은 상위 5개를 반환합니다.
- `agent_name`과 `path`를 사용하여 특정 에이전트 또는 작업 경로의 기억만 검색할 수 있습니다.

## 데이터 저장소

데이터는 실행하는 디렉토리 하위에 영구 저장됩니다:

```
.rag-for-agent-mcp/
└── lancedb/
```

## 기술 스택

- **LanceDB**: Vector Database (벡터 검색)
- **Google Gemini**:
  - `text-embedding-004`: 텍스트 임베딩
  - `gemini-1.5-flash`: Reranking
- **MCP SDK**: Model Context Protocol 구현
- **TypeScript**: 타입 안전한 개발

## 개발 가이드 (Development)

- 클론 후 `npm install`
- 빌드: `npm run build`
- 테스트: `.env` 설정 후 `npx tsx src/scripts/test-manual.ts` 실행

### 개발 실행 예시 (Windows PowerShell):

```powershell
# 클론 및 설치
git clone https://forgejo.home/gafani/rag-for-agent-mcp.git
cd rag-for-agent-mcp
npm install

# 빌드
npm run build

# 테스트 설정 및 실행
$env:GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
npx tsx src/scripts/test-manual.ts
```

## 라이선스

ISC
