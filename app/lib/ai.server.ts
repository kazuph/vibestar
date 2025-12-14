import type { Env } from "../../server/load-context";

// Model constants - DO NOT CHANGE THESE MODELS
// plamo-embedding-1b (2048次元) - 日本語埋め込みモデル by Preferred Networks
const EMBEDDING_MODEL = "@cf/pfnet/plamo-embedding-1b";
// gpt-oss-120b - OpenAI製チャットモデル (Responses API形式)
const CHAT_MODEL = "@cf/openai/gpt-oss-120b";

// Vectorize configuration
// plamo-embedding-1b outputs 2048 dimensions, but Vectorize supports max 1536
// We truncate embeddings to fit Vectorize's limit while preserving most important features
const VECTORIZE_DIMENSIONS = 1536;

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
 * Note: plamo-embedding-1b outputs 2048 dimensions, but Vectorize max is 1536
 * We truncate to VECTORIZE_DIMENSIONS to fit the index
 */
export async function generateEmbeddings(
  ai: Ai,
  texts: string[]
): Promise<number[][]> {
  const result = await ai.run(EMBEDDING_MODEL, {
    text: texts,
  });

  // Workers AI returns { data: number[][] } for embeddings
  const embeddings = (result as { data: number[][] }).data;

  // Truncate to VECTORIZE_DIMENSIONS (1536) for Vectorize compatibility
  // The first dimensions typically contain the most important semantic information
  return embeddings.map((emb) => emb.slice(0, VECTORIZE_DIMENSIONS));
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

// Responses API output type for gpt-oss-120b
interface ResponsesApiOutput {
  id: string;
  output: Array<{
    type: string;
    content?: Array<{ text: string; type: string }>;
    role?: string;
  }>;
}

/**
 * Chat completion with streaming support
 * Uses Responses API format: instructions + input (string)
 * For multi-turn conversations, we concatenate messages into a single input string
 *
 * Note: gpt-oss-120b doesn't support streaming well via remote bindings,
 * so we use non-streaming and simulate a stream for compatibility
 */
export async function chatCompletionStream(
  ai: Ai,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<ReadableStream<Uint8Array>> {
  // Build conversation text from messages
  // Format: "User: message\nAssistant: message\n..."
  const conversationText = messages
    .map((msg) => {
      const roleLabel = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      return `${roleLabel}: ${msg.content}`;
    })
    .join("\n\n");

  // Use non-streaming for gpt-oss-120b (Responses API model)
  console.log("[AI] chatCompletionStream calling model:", CHAT_MODEL);
  console.log("[AI] instructions:", systemPrompt || "You are a helpful AI assistant.");
  console.log("[AI] input:", conversationText.substring(0, 200));

  let response: ResponsesApiOutput;
  try {
    response = await (ai as unknown as { run: (model: string, options: unknown) => Promise<ResponsesApiOutput> }).run(CHAT_MODEL, {
      instructions: systemPrompt || "You are a helpful AI assistant.",
      input: conversationText,
      stream: false,
    });
    console.log("[AI] Response received:", JSON.stringify(response).substring(0, 500));
  } catch (aiError) {
    console.error("[AI] Workers AI call failed:", aiError);
    throw aiError;
  }

  // Extract text from Responses API format
  let responseText = "";
  if (response.output) {
    for (const item of response.output) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            responseText += content.text;
          }
        }
      }
    }
  }

  // Create a simple stream from the response text
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(responseText));
      controller.close();
    },
  });
}

/**
 * Chat completion without streaming (for simpler use cases)
 * Uses Responses API format: instructions + input (string)
 */
export async function chatCompletion(
  ai: Ai,
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  // Build conversation text from messages
  const conversationText = messages
    .map((msg) => {
      const roleLabel = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
      return `${roleLabel}: ${msg.content}`;
    })
    .join("\n\n");

  console.log("[AI] chatCompletion calling model:", CHAT_MODEL);
  console.log("[AI] input:", conversationText.substring(0, 200));

  let response: ResponsesApiOutput;
  try {
    response = await (ai as unknown as { run: (model: string, options: unknown) => Promise<ResponsesApiOutput> }).run(CHAT_MODEL, {
      instructions: systemPrompt || "You are a helpful AI assistant.",
      input: conversationText,
      stream: false,
    });
    console.log("[AI] Response received:", JSON.stringify(response).substring(0, 500));
  } catch (aiError) {
    console.error("[AI] Workers AI call failed:", aiError);
    throw aiError;
  }

  // Extract text from Responses API format
  let responseText = "";
  if (response.output) {
    for (const item of response.output) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            responseText += content.text;
          }
        }
      }
    }
  }

  return responseText;
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
