import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  logger.info('Supabase client initialized');
} else {
  logger.warn('Supabase credentials not found - database operations will be disabled');
}

// Client ID mapping - maps string identifiers to actual UUIDs
const CLIENT_ID_MAP: Record<string, string> = {
  'asera-master': 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // Demo client UUID from schema
  'htt-client-id': 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // Using demo client for now
};

/**
 * Convert string client ID to actual UUID
 */
function resolveClientId(clientId: string): string {
  // If it's already a UUID, return as is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return clientId;
  }
  
  // Map string ID to UUID
  const mappedId = CLIENT_ID_MAP[clientId];
  if (!mappedId) {
    logger.warn('Unknown client ID, using demo client:', { clientId });
    return CLIENT_ID_MAP['asera-master'];
  }
  
  return mappedId;
}

// Simple database utility for when Supabase is not configured
export const database = {
  async raw(query: string, bindings?: any[]): Promise<any> {
    if (!supabase) {
      logger.warn('Database query attempted but Supabase not configured');
      return [];
    }
    
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql: query,
        params: bindings || [],
      });

      if (error) {
        logger.error('Database query error:', { error, query });
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('Database connection error:', error);
      throw error;
    }
  }
};

// Client-specific database operations
export class ClientDatabase {
  private resolvedClientId: string;

  constructor(private clientId: string) {
    this.resolvedClientId = resolveClientId(clientId);
  }

  async insertDocument(document: {
    id: string;
    title: string;
    content: string;
    source: 'notion_meeting_notes' | 'notion_client_page' | 'notion_website_outline' | 'slack' | 'upload';
    sourceId: string;
    metadata: Record<string, any>;
  }): Promise<void> {
    if (!supabase) {
      logger.warn('Document insert attempted but database not configured');
      return;
    }

    const { error } = await supabase
      .from('documents')
      .upsert({
        id: document.id,
        client_id: this.resolvedClientId,
        title: document.title,
        content: document.content,
        source: document.source,
        source_id: document.sourceId,
        metadata: document.metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      logger.error('Error inserting document:', { error, document: document.id });
      throw error;
    }

    logger.info('Document inserted:', { 
      documentId: document.id, 
      clientId: this.resolvedClientId,
      source: document.source 
    });
  }

  async insertDocumentChunk(chunk: {
    id: string;
    documentId: string;
    content: string;
    embedding: number[];
    chunkIndex: number;
    tokenCount: number;
    metadata: Record<string, any>;
  }): Promise<void> {
    if (!supabase) {
      logger.warn('Chunk insert attempted but database not configured');
      return;
    }

    const { error } = await supabase
      .from('document_chunks')
      .upsert({
        id: chunk.id,
        document_id: chunk.documentId,
        content: chunk.content,
        embedding: `[${chunk.embedding.join(',')}]`, // Store as JSON string for now
        chunk_index: chunk.chunkIndex,
        token_count: chunk.tokenCount,
        metadata: chunk.metadata,
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.error('Error inserting chunk:', { error, chunkId: chunk.id });
      throw error;
    }
  }

  async searchSimilarChunks(
    query: string,
    limit: number = 5
  ): Promise<any[]> {
    if (!supabase) {
      logger.warn('Similarity search attempted but database not configured');
      return [];
    }

    try {
      logger.info('Starting chunk search:', { query, limit, clientId: this.resolvedClientId });

      // Extract meaningful keywords from the query
      const keywords = this.extractKeywords(query);
      logger.info('Extracted keywords:', { query, keywords });

      if (keywords.length === 0) {
        logger.warn('No keywords extracted from query:', { query });
        return [];
      }

      // Try multiple search strategies
      let allResults: any[] = [];

      // Strategy 1: Search for each keyword individually
      for (const keyword of keywords) {
        const { data, error } = await supabase
          .from('document_chunks')
          .select(`
            id,
            content,
            document_id,
            chunk_index,
            metadata,
            documents!inner(title, source, client_id)
          `)
          .eq('documents.client_id', this.resolvedClientId)
          .ilike('content', `%${keyword}%`)
          .limit(limit * 2); // Get more results to ensure diversity

        if (!error && data) {
          allResults.push(...data);
        }
      }

      // Strategy 2: Also search document titles
      for (const keyword of keywords) {
        const { data, error } = await supabase
          .from('document_chunks')
          .select(`
            id,
            content,
            document_id,
            chunk_index,
            metadata,
            documents!inner(title, source, client_id)
          `)
          .eq('documents.client_id', this.resolvedClientId)
          .ilike('documents.title', `%${keyword}%`)
          .limit(limit);

        if (!error && data) {
          allResults.push(...data);
        }
      }

      // Remove duplicates and score results
      const uniqueResults = this.deduplicateAndScore(allResults, keywords, limit);

      logger.info('Chunk search completed:', {
        query,
        keywords,
        totalResults: allResults.length,
        uniqueResults: uniqueResults.length,
        clientId: this.resolvedClientId
      });

      return uniqueResults;
    } catch (error) {
      logger.error('Error in chunk search:', { error, query });
      return [];
    }
  }

  /**
   * Search using vector similarity with real embeddings
   */
  async searchSimilarChunksVector(
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<any[]> {
    if (!supabase) {
      logger.warn('Vector similarity search attempted but database not configured');
      return [];
    }

    try {
      logger.info('Starting vector similarity search:', { 
        limit, 
        clientId: this.resolvedClientId,
        embeddingDimension: queryEmbedding.length 
      });

      // Get all document chunks for this client with their embeddings
      const { data, error } = await supabase
        .from('document_chunks')
        .select(`
          id,
          content,
          document_id,
          chunk_index,
          metadata,
          embedding,
          documents!inner(title, source, client_id)
        `)
        .eq('documents.client_id', this.resolvedClientId);

      if (error) {
        logger.error('Error fetching chunks for vector search:', { error });
        return [];
      }

      if (!data || data.length === 0) {
        logger.warn('No chunks found for vector similarity search');
        return [];
      }

      // Calculate similarity scores for each chunk
      const scoredChunks = data.map(chunk => {
        let similarity = 0;
        
        try {
          if (chunk.embedding && Array.isArray(chunk.embedding)) {
            similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
          }
        } catch (simError) {
          logger.warn('Error calculating similarity for chunk:', { 
            chunkId: chunk.id, 
            error: simError 
          });
          similarity = 0;
        }

        return {
          ...chunk,
          similarity,
        };
      }).filter(chunk => chunk.similarity > 0.1); // Filter out very low similarity matches

      // Sort by similarity and return top results
      const topResults = scoredChunks
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      logger.info('Vector similarity search completed:', {
        totalChunks: data.length,
        scoredChunks: scoredChunks.length,
        results: topResults.length,
        topSimilarity: topResults[0]?.similarity || 0,
        clientId: this.resolvedClientId,
      });

      return topResults;
    } catch (error) {
      logger.error('Error in vector similarity search:', { error });
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Extract meaningful keywords from a search query
   */
  private extractKeywords(query: string): string[] {
    // Convert to lowercase
    const lowercaseQuery = query.toLowerCase();
    
    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'under', 'over',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'must', 'can', 'what', 'where', 'when', 'why', 'how', 'who', 'which',
      'tell', 'me', 'you', 'i', 'we', 'they', 'them', 'us', 'it', 'this', 'that'
    ]);

    // Split into words and filter
    const words = lowercaseQuery
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, '')) // Remove punctuation
      .filter(word => word.length > 2) // Remove very short words
      .filter(word => !stopWords.has(word)) // Remove stop words
      .filter(word => /^[a-zA-Z]/.test(word)); // Only words starting with letters

    // Remove duplicates and return
    return [...new Set(words)];
  }

  /**
   * Remove duplicates and score results based on keyword relevance
   */
  private deduplicateAndScore(results: any[], keywords: string[], limit: number): any[] {
    // Remove duplicates by ID
    const uniqueById = new Map();
    results.forEach(result => {
      if (!uniqueById.has(result.id)) {
        uniqueById.set(result.id, result);
      }
    });

    const uniqueResults = Array.from(uniqueById.values());

    // Score each result
    const scoredResults = uniqueResults.map(result => {
      let score = 0;
      const content = result.content.toLowerCase();
      const title = result.documents?.title?.toLowerCase() || '';

      keywords.forEach(keyword => {
        // Content matches (higher weight)
        const contentMatches = (content.match(new RegExp(keyword, 'gi')) || []).length;
        score += contentMatches * 3;

        // Title matches (highest weight)
        const titleMatches = (title.match(new RegExp(keyword, 'gi')) || []).length;
        score += titleMatches * 5;
      });

      return { ...result, score };
    });

    // Sort by score and return top results
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getDocumentsBySource(source: string): Promise<any[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', this.resolvedClientId)
      .eq('source', source);

    if (error) {
      logger.error('Error fetching documents:', { error, source });
      return [];
    }

    return data || [];
  }

  async getAllDocuments(): Promise<any[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', this.resolvedClientId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching all documents:', { error });
      return [];
    }

    return data || [];
  }

  async deleteDocument(documentId: string): Promise<void> {
    if (!supabase) return;

    // Delete chunks first
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    // Delete document
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('client_id', this.resolvedClientId);

    if (error) {
      logger.error('Error deleting document:', { error, documentId });
      throw error;
    }
  }
}

export default database; 