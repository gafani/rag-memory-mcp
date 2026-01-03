import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { z } from 'zod';
import type { MemoryRecord, RerankInputRecord, ScoredMemoryRecord } from './types.js';


// Setup: Validate API key and initialize client
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_API_KEY environment variable is required');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Generate embedding for the given text using Google's text-embedding-004 model
 * @param text - The text to embed
 * @returns Array of embedding values
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Rerank documents based on their relevance to the query using gemini-flash-latest
 * @param query - The query to rank documents against
 * @param documents - Array of MemoryRecord to rank
 * @returns Reranked array of MemoryRecord, or original array if reranking fails
 */
export async function rerank(
  query: string,
  documents: Array<MemoryRecord & { score?: number; _distance?: number }>
): Promise<ScoredMemoryRecord[]> {
  if (documents.length === 0) {
    return [];
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

  const prompt = `Query: ${query}
Documents to rank:
${documents.map((d, i) => `[${i}] ${d.content.slice(0, 300)}`).join('\n')}

For each document, estimate how relevant it is to the query.
Return ONLY valid JSON: an array of objects sorted by relevance (best first).
Each object must have:
- index: the document index (0-based)
- score: a number between 0 and 1 (higher = more relevant)

Example output:
[{"index":2,"score":0.91},{"index":0,"score":0.62},{"index":1,"score":0.12}]`;

  const fallbackScore = (d: { score?: number; _distance?: number }) => {
    if (typeof d.score === 'number' && Number.isFinite(d.score)) return d.score;
    if (typeof d._distance === 'number' && Number.isFinite(d._distance)) return d._distance;
    return 0;
  };

  try {
    const response = await model.generateContent(prompt);
    let responseText = response.response.text();

    // Remove Markdown code blocks if present
    responseText = responseText.replace(/```(?:json)?\s*|\s*```/g, '').trim();

    const parsedJson = JSON.parse(responseText) as unknown;

    const scoredSchema = z.array(
      z.object({
        index: z.coerce.number().int(),
        score: z.coerce.number(),
      })
    );

    const indicesSchema = z.array(z.coerce.number().int());

    const scored = scoredSchema.safeParse(parsedJson);
    if (scored.success) {
      const used = new Set<number>();
      const reranked: ScoredMemoryRecord[] = [];

      for (const item of scored.data) {
        const index = item.index;
        if (!Number.isInteger(index) || index < 0 || index >= documents.length) continue;
        if (used.has(index)) continue;
        used.add(index);

        const score = Number.isFinite(item.score) ? Math.min(1, Math.max(0, item.score)) : 0;
        reranked.push({ ...(documents[index] as MemoryRecord), score } as ScoredMemoryRecord);
      }

      // Fill missing docs at the end (defensive)
      for (let i = 0; i < documents.length; i++) {
        if (used.has(i)) continue;
        reranked.push({ ...(documents[i] as MemoryRecord), score: fallbackScore(documents[i]) } as ScoredMemoryRecord);
      }

      return reranked;
    }

    // Backward-compatible: if model returns just indices
    const indices = indicesSchema.parse(parsedJson);

    const used = new Set<number>();
    const reranked: ScoredMemoryRecord[] = [];
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= documents.length) continue;
      if (used.has(index)) continue;
      used.add(index);
      reranked.push({ ...(documents[index] as MemoryRecord), score: fallbackScore(documents[index]) } as ScoredMemoryRecord);
    }

    for (let i = 0; i < documents.length; i++) {
      if (used.has(i)) continue;
      reranked.push({ ...(documents[i] as MemoryRecord), score: fallbackScore(documents[i]) } as ScoredMemoryRecord);
    }

    return reranked;
  } catch (error) {
    console.error('Reranking failed, returning original documents:', error);
    return documents.map((d) => ({ ...(d as MemoryRecord), score: fallbackScore(d) }));
  }
}

