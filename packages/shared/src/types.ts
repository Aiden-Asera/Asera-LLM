import { z } from 'zod';

// ============================================================================
// Base Types
// ============================================================================

export const ClientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  settings: z.object({
    slack_channel_id: z.string().optional(),
    notion_workspace_id: z.string().optional(),
    embedding_model: z.string().default('claude-3-haiku-20240307'),
    chat_model: z.string().default('claude-3-sonnet-20240229'),
  }),
});

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  client_id: z.string().uuid(),
  role: z.enum(['admin', 'user']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// ============================================================================
// Document Types
// ============================================================================

export const DocumentSourceSchema = z.enum([
  'slack',
  'notion_meeting_notes',
  'notion_client_page',
  'notion_website_outline',
  'upload'
]);

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  source: DocumentSourceSchema,
  source_id: z.string(), // Slack message ID, Notion page ID, etc.
  metadata: z.record(z.any()),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const DocumentChunkSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  content: z.string(),
  embedding: z.array(z.number()),
  chunk_index: z.number(),
  token_count: z.number(),
  metadata: z.record(z.any()),
  created_at: z.string().datetime(),
});

// ============================================================================
// Chat Types
// ============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  metadata: z.object({
    sources: z.array(z.object({
      document_id: z.string().uuid(),
      chunk_id: z.string().uuid(),
      similarity_score: z.number(),
      title: z.string(),
      source: DocumentSourceSchema,
    })).optional(),
    token_count: z.number().optional(),
    model: z.string().optional(),
  }),
  created_at: z.string().datetime(),
});

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// ============================================================================
// Integration Types
// ============================================================================

export const SlackMessageSchema = z.object({
  ts: z.string(),
  channel: z.string(),
  user: z.string(),
  text: z.string(),
  thread_ts: z.string().optional(),
  files: z.array(z.object({
    id: z.string(),
    name: z.string(),
    mimetype: z.string(),
    url_private: z.string(),
  })).optional(),
});

export const NotionPageSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  database_id: z.string(),
  properties: z.record(z.any()),
  last_edited_time: z.string().datetime(),
});

// ============================================================================
// API Types
// ============================================================================

export const ChatRequestSchema = z.object({
  message: z.string(),
  conversation_id: z.string().uuid().optional(),
  stream: z.boolean().default(false),
});

export const ChatResponseSchema = z.object({
  message: MessageSchema,
  conversation_id: z.string().uuid(),
  sources: z.array(z.object({
    document_id: z.string().uuid(),
    title: z.string(),
    content: z.string(),
    source: DocumentSourceSchema,
    similarity_score: z.number(),
  })),
});

export const EmbeddingRequestSchema = z.object({
  text: z.string(),
  client_id: z.string().uuid(),
});

export const SearchRequestSchema = z.object({
  query: z.string(),
  client_id: z.string().uuid(),
  limit: z.number().default(10),
  threshold: z.number().default(0.7),
});

// ============================================================================
// Analytics Types
// ============================================================================

export const UsageStatsSchema = z.object({
  client_id: z.string().uuid(),
  period: z.enum(['day', 'week', 'month']),
  total_messages: z.number(),
  total_documents: z.number(),
  average_response_time: z.number(),
  top_sources: z.array(z.object({
    source: DocumentSourceSchema,
    count: z.number(),
  })),
  active_users: z.number(),
});

export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  message_id: z.string().uuid(),
  user_id: z.string().uuid(),
  rating: z.enum(['positive', 'negative']),
  comment: z.string().optional(),
  created_at: z.string().datetime(),
});

// ============================================================================
// Export Type Inference
// ============================================================================

export type Client = z.infer<typeof ClientSchema>;
export type User = z.infer<typeof UserSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type SlackMessage = z.infer<typeof SlackMessageSchema>;
export type NotionPage = z.infer<typeof NotionPageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type UsageStats = z.infer<typeof UsageStatsSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;

// ============================================================================
// Error Types
// ============================================================================

export class AseraError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AseraError';
  }
}

export class AuthenticationError extends AseraError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AseraError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class ValidationError extends AseraError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends AseraError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
  }
}

export class IntegrationError extends AseraError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} integration error: ${message}`, 'INTEGRATION_ERROR', 502, details);
  }
} 