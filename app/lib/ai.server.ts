import type { Env } from "../../server/load-context";

// Model constants - DO NOT CHANGE THESE MODELS
// plamo-embedding-1b (1024次元) - 指定された埋め込みモデル（変更禁止）
const EMBEDDING_MODEL = "@cf/pfnet/plamo-embedding-1b";
// gpt-oss-120b - 指定されたチャットモデル（変更禁止）
const CHAT_MODEL = "@cf/pfnet/gpt-oss-120b";

// Chunk configuration
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RagContext {
  content: string;
  documentId: string;
  score: number;
}

/**
 * Split text into overlapping chunks for embedding
 */
export function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Generate embeddings for text using Workers AI
 */
export async function generateEmbeddings(
  ai: Ai,
  texts: string[]
): Promise<number[][]> {
  const result = await ai.run(EMBEDDING_MODEL, {
    text: texts,
  });

  // Workers AI returns { data: number[][] } for embeddings
  return (result as { data: number[][] }).data;
}

/**
 * Store vectors in Vectorize with metadata
 */
export async function storeVectors(
  vectorIndex: VectorizeIndex,
  vectors: {
    id: string;
    values: number[];
    metadata: Record<string, string>;
  }[]
): Promise<void> {
  if (vectors.length === 0) return;

  await vectorIndex.upsert(vectors);
}

/**
 * Query Vectorize for similar documents
 */
export async function queryVectors(
  vectorIndex: VectorizeIndex,
  queryVector: number[],
  topK = 5
): Promise<VectorizeMatches> {
  return await vectorIndex.query(queryVector, {
    topK,
    returnMetadata: "all",
  });
}

/**
 * Perform RAG query: embed query, search vectors, return contexts
 */
export async function performRagQuery(
  env: Env,
  query: string,
  topK = 5
): Promise<RagContext[]> {
  // Generate embedding for query
  const [queryEmbedding] = await generateEmbeddings(env.AI, [query]);

  // Search for similar vectors
  const matches = await queryVectors(env.VECTOR_INDEX, queryEmbedding, topK);

  // Map results to context
  return matches.matches.map((match) => ({
    content: (match.metadata?.content as string) || "",
    documentId: (match.metadata?.documentId as string) || "",
    score: match.score,
  }));
}

/**
 * Build system prompt with RAG context
 */
export function buildSystemPromptWithContext(
  contexts: RagContext[],
  basePrompt = "You are a helpful AI assistant."
): string {
  if (contexts.length === 0) {
    return basePrompt;
  }

  const contextText = contexts
    .map((ctx, i) => `[Document ${i + 1}]\n${ctx.content}`)
    .join("\n\n");

  return `${basePrompt}

Use the following context to help answer the user's question:

${contextText}

If the context doesn't contain relevant information, say so and answer based on your general knowledge.`;
}

/**
 * Chat completion with streaming support
 */
export async function chatCompletionStream(
  ai: Ai,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
  const fullMessages: ChatMessage[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    fullMessages.push({ role: "system", content: systemPrompt });
  }

  // Add conversation messages
  fullMessages.push(...messages);

  // Cast to any because @cf/pfnet/gpt-oss-120b is not in the type definitions
  const response = await (ai as unknown as { run: (model: string, options: unknown) => Promise<ReadableStream<Uint8Array>> }).run(CHAT_MODEL, {
    messages: fullMessages,
    stream: true,
  });

  // Workers AI returns a ReadableStream when stream: true
  return response;
}

/**
 * Chat completion without streaming (for simpler use cases)
 */
export async function chatCompletion(
  ai: Ai,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const fullMessages: ChatMessage[] = [];

  if (systemPrompt) {
    fullMessages.push({ role: "system", content: systemPrompt });
  }

  fullMessages.push(...messages);

  // Cast to any because @cf/pfnet/gpt-oss-120b is not in the type definitions
  const response = await (ai as unknown as { run: (model: string, options: unknown) => Promise<{ response: string }> }).run(CHAT_MODEL, {
    messages: fullMessages,
    stream: false,
  });

  // Workers AI returns { response: string } for non-streaming
  return response.response;
}

/**
 * Process document: chunk, embed, and store vectors
 * This should be called with waitUntil for background processing
 */
export async function processDocument(
  env: Env,
  documentId: string,
  content: string
): Promise<{ chunkIds: string[]; vectorIds: string[] }> {
  const chunks = chunkText(content);
  const embeddings = await generateEmbeddings(env.AI, chunks);

  const chunkIds: string[] = [];
  const vectorIds: string[] = [];
  const vectors: {
    id: string;
    values: number[];
    metadata: Record<string, string>;
  }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `${documentId}-chunk-${i}`;
    const vectorId = `vec-${chunkId}`;

    chunkIds.push(chunkId);
    vectorIds.push(vectorId);

    vectors.push({
      id: vectorId,
      values: embeddings[i],
      metadata: {
        documentId,
        chunkIndex: String(i),
        content: chunks[i],
      },
    });
  }

  // Store all vectors at once
  await storeVectors(env.VECTOR_INDEX, vectors);

  return { chunkIds, vectorIds };
}

/**
 * Delete vectors for a document
 */
export async function deleteDocumentVectors(
  vectorIndex: VectorizeIndex,
  vectorIds: string[]
): Promise<void> {
  if (vectorIds.length === 0) return;

  await vectorIndex.deleteByIds(vectorIds);
}
