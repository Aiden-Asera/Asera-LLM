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

    // Simple text search using ilike for now
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
      .ilike('content', `%${query}%`)
      .limit(limit);

    if (error) {
      logger.error('Error searching chunks:', { error, query });
      return [];
    }

    return data || [];
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
      .eq('client_id', this.clientId);

    if (error) {
      logger.error('Error deleting document:', { error, documentId });
      throw error;
    }
  }
}

export default database; 