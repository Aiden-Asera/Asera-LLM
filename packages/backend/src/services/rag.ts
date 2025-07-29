import { v4 as uuidv4 } from 'uuid';
import { claudeService } from './claude';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';

export interface DocumentChunk {
  id: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, any>;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    title: string;
    content: string;
    source: string;
    relevanceScore: number;
  }>;
  tokenCount: number;
}

export class RAGService {
  private static instance: RAGService;

  public static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService();
    }
    return RAGService.instance;
  }

  private constructor() {}

  /**
   * Chunk text into smaller pieces for processing
   */
  chunkText(
    text: string,
    options: {
      maxTokens?: number;
      overlapTokens?: number;
    } = {}
  ): Array<{ content: string; index: number; tokenCount: number }> {
    const { maxTokens = 1000, overlapTokens = 100 } = options;

    // Simple sentence-based chunking
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: Array<{ content: string; index: number; tokenCount: number }> = [];
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceText = sentence.trim() + '.';
      const sentenceTokens = this.estimateTokenCount(sentenceText);
      
      // If adding this sentence would exceed maxTokens, create a new chunk
      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          tokenCount: currentTokens,
        });

        // Start new chunk with overlap
        if (overlapTokens > 0) {
          const words = currentChunk.split(' ');
          const overlapWords = words.slice(-Math.floor(overlapTokens / 4));
          currentChunk = overlapWords.join(' ') + ' ' + sentenceText;
          currentTokens = this.estimateTokenCount(currentChunk);
        } else {
          currentChunk = sentenceText;
          currentTokens = sentenceTokens;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentenceText;
        currentTokens += sentenceTokens;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        tokenCount: currentTokens,
      });
    }

    logger.info('Document chunked:', {
      originalLength: text.length,
      chunksCreated: chunks.length,
      avgChunkSize: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length,
    });

    return chunks;
  }

  /**
   * Process and store a document with embeddings
   */
  async processDocument(
    clientDb: ClientDatabase,
    document: {
      id: string;
      title: string;
      content: string;
      source: 'notion_meeting_notes' | 'notion_client_page' | 'notion_website_outline' | 'slack' | 'upload';
      sourceId: string;
      metadata: Record<string, any>;
    }
  ): Promise<void> {
    try {
      logger.info('Processing document for RAG:', {
        documentId: document.id,
        title: document.title,
        source: document.source,
        contentLength: document.content.length,
      });

      // Store the document
      await clientDb.insertDocument({
        id: document.id,
        title: document.title,
        content: document.content,
        source: document.source,
        sourceId: document.sourceId,
        metadata: document.metadata,
      });

      // Chunk the document
      const chunks = this.chunkText(document.content);

      // Generate simple embeddings (for now we'll use a placeholder)
      // In a full implementation, you'd call Claude or another embedding service
      for (const chunk of chunks) {
        const embedding = this.generateSimpleEmbedding(chunk.content);
        
        await clientDb.insertDocumentChunk({
          id: uuidv4(),
          documentId: document.id,
          content: chunk.content,
          embedding,
          chunkIndex: chunk.index,
          tokenCount: chunk.tokenCount,
          metadata: {
            ...document.metadata,
            chunkMetadata: {
              originalIndex: chunk.index,
              totalChunks: chunks.length,
            },
          },
        });
      }

      logger.info('Document processing completed:', {
        documentId: document.id,
        chunksCreated: chunks.length,
      });
    } catch (error) {
      logger.error('Error processing document:', {
        error,
        documentId: document.id,
        title: document.title,
      });
      throw error;
    }
  }

  /**
   * Generate RAG response for a query
   */
  async generateRAGResponse(
    clientDb: ClientDatabase,
    query: string,
    options: {
      maxSources?: number;
      model?: string;
    } = {}
  ): Promise<RAGResponse> {
    try {
      const { maxSources = 5, model } = options;

      // Search for relevant chunks (using simple text search for now)
      const similarChunks = await clientDb.searchSimilarChunks(query, maxSources);

      if (similarChunks.length === 0) {
        logger.warn('No relevant context found for query:', {
          query: query.substring(0, 100),
        });

        // Generate response without context
        const response = await claudeService.generateChatCompletion([
          {
            role: 'user',
            content: `${query}\n\n(Note: No specific context documents were found to answer this question.)`,
          },
        ], { model });

        return {
          answer: response.content,
          sources: [],
          tokenCount: response.tokenCount,
        };
      }

      // Create RAG prompt with context
      const contextText = similarChunks
        .map((chunk, idx) => `[${idx + 1}] ${chunk.documents?.title || 'Document'}: ${chunk.content}`)
        .join('\n\n');

      const ragPrompt = `You are a helpful AI assistant. Use the provided context to answer the user's question accurately. If the context doesn't contain enough information, say so clearly.

Context:
${contextText}

Question: ${query}

Instructions:
1. Answer based primarily on the provided context
2. If the context doesn't contain enough information, say so clearly
3. Reference specific sources when making claims (e.g., "According to document [1]...")
4. Be concise but thorough

Answer:`;

      // Generate response with context
      const response = await claudeService.generateChatCompletion([
        {
          role: 'user',
          content: ragPrompt,
        },
      ], { model });

      logger.info('RAG response generated:', {
        query: query.substring(0, 100),
        sourcesUsed: similarChunks.length,
        responseLength: response.content.length,
        tokenCount: response.tokenCount,
      });

      return {
        answer: response.content,
        sources: similarChunks.map((chunk, idx) => ({
          documentId: chunk.document_id,
          title: chunk.documents?.title || 'Unknown Document',
          content: chunk.content.substring(0, 500), // Truncate for response
          source: chunk.documents?.source || 'unknown',
          relevanceScore: 0.8 - (idx * 0.1), // Simple relevance scoring
        })),
        tokenCount: response.tokenCount,
      };
    } catch (error) {
      logger.error('Error generating RAG response:', {
        error,
        query: query.substring(0, 100),
      });
      throw error;
    }
  }

  /**
   * Estimate token count (simple approximation)
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate simple embedding (placeholder implementation)
   * In production, you'd use Claude or another embedding service
   */
  private generateSimpleEmbedding(text: string): number[] {
    // Very simple hash-based embedding for demonstration
    const dimension = 1536; // Match Claude's embedding dimension
    const embedding: number[] = new Array(dimension).fill(0);
    
    // Simple hash-based approach
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      const index = char % dimension;
      embedding[index] += Math.sin(char * 0.1) * 0.1;
    }
    
    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }
}

export const ragService = RAGService.getInstance(); 