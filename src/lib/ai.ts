import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import type { MemoryRecord } from './types.js';

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
export async function rerank(query: string, documents: (MemoryRecord & { score: number })[]): Promise<(MemoryRecord & { score: number })[]> {
  // Return empty array if no documents
  if (documents.length === 0) {
    return [];
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

  // Construct prompt
  const prompt = `Query: ${query}
Documents to rank:
${documents.map((d, i) => `[${i}] ${d.content.slice(0, 300)}`).join('\n')}

Analyze the relevance of each document to the query.
Return ONLY a JSON array of the indices sorted by relevance (most relevant first).
Example output: [2, 0, 1]`;

  try {
    const response = await model.generateContent(prompt);
    let responseText = response.response.text();

    // Remove Markdown code blocks if present
    responseText = responseText.replace(/```json\s*|\s*```/g, '').trim();

    // Parse JSON response
    const indices = JSON.parse(responseText) as number[];

    // Validate that indices is an array of valid indices
    if (!Array.isArray(indices) || indices.length !== documents.length) {
      throw new Error('Invalid indices format');
    }

    // Reorder documents based on the indices
    const reranked: (MemoryRecord & { score: number })[] = [];
    for (const index of indices) {
      if (index >= 0 && index < documents.length) {
        reranked.push(documents[index]);
      }
    }

    return reranked;
  } catch (error) {
    console.error('Reranking failed, returning original documents:', error);
    return documents;
  }
}
