import { getEmbedding, rerank } from '../lib/ai.js';
import { getTable, saveMemory, searchMemory } from '../lib/db.js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function main() {
  try {
    console.log('### 테스트 스크립트 시작 ###');

    if (!process.env.GOOGLE_API_KEY) {
      console.error('❌ GOOGLE_API_KEY 환경변수가 필요합니다. .env 파일을 확인하거나 환경변수를 설정해주세요.');
      process.exit(1);
    }

    // DB 초기화
    console.log('🔄 DB 연결 및 테이블 초기화 중...');
    await getTable();
    console.log('✅ DB 준비 완료');

    // 데이터 저장
    const content = `테스트 데이터: 오늘은 2025년 12월 28일입니다. (Random: ${Math.random()})`;
    console.log(`\n🔄 메모리 저장 시도: "${content}"`);
    
    const vector = await getEmbedding(content);
    const id = uuidv4();
    await saveMemory({
      id,
      content,
      agent: 'tester',
      path: process.cwd(),
      vector,
      timestamp: Date.now()
    });
    console.log(`✅ 저장 성공 (ID: ${id})`);

    // 데이터 검색
    const query = "오늘 며칠이야?";
    console.log(`\n🔄 검색 시도: "${query}"`);
    
    const queryVector = await getEmbedding(query);
    const searchResults = await searchMemory(queryVector, {}, 5);
    console.log(`✅ 1차 벡터 검색 완료: ${searchResults.length}건 발견`);

    if (searchResults.length > 0) {
      // Rerank
      console.log('🔄 Reranking 수행 중...');
      // 타입 호환성 문제 회피를 위해 as any 사용
      const reranked = await rerank(query, searchResults as any);
      
      console.log('\n🔎 [최종 결과 Top 1]');
      if (reranked.length > 0) {
        const top = reranked[0];
        console.log(`내용: ${top.content}`);
        console.log(`작성자: ${top.agent}`);
        console.log(`점수: ${top.score}`); // Rerank 점수는 score 필드에 있을 것으로 가정
      } else {
        console.log('리랭킹 결과가 없습니다.');
      }
    } else {
        console.log('검색 결과가 없습니다.');
    }

  } catch (error) {
    console.error('❌ 테스트 중 에러 발생:', error);
    if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack);
    }
  }
}

main();