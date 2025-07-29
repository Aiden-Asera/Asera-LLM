-- Asera LLM System Database Schema
-- Multi-tenant architecture with Row Level Security (RLS)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Public Schema (shared across all tenants)
-- ============================================================================

-- Clients table (main tenant table)
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (belongs to clients)
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_client_id ON public.users(client_id);
CREATE INDEX idx_users_email ON public.users(email);

-- ============================================================================
-- Multi-tenant tables with RLS
-- ============================================================================

-- Documents table (stores all ingested content)
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('slack', 'notion_meeting_notes', 'notion_client_page', 'notion_website_outline', 'upload')),
    source_id VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks table (for RAG embeddings)
CREATE TABLE public.document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- Claude embedding dimension
    chunk_index INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table (chat sessions)
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table (chat messages)
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feedback table (for message ratings)
CREATE TABLE public.feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating VARCHAR(10) NOT NULL CHECK (rating IN ('positive', 'negative')),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integration logs table (for tracking Slack/Notion sync)
CREATE TABLE public.integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================

-- Documents indexes
CREATE INDEX idx_documents_client_id ON public.documents(client_id);
CREATE INDEX idx_documents_source ON public.documents(source);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- Document chunks indexes (for similarity search)
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Conversations indexes
CREATE INDEX idx_conversations_client_id ON public.conversations(client_id);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);

-- Messages indexes
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- Feedback indexes
CREATE INDEX idx_feedback_message_id ON public.feedback(message_id);
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);

-- Integration logs indexes
CREATE INDEX idx_integration_logs_client_id ON public.integration_logs(client_id);
CREATE INDEX idx_integration_logs_created_at ON public.integration_logs(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tenant-specific tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- Documents RLS policies
CREATE POLICY documents_tenant_isolation ON public.documents
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- Document chunks RLS policies (through document relationship)
CREATE POLICY document_chunks_tenant_isolation ON public.document_chunks
    USING (document_id IN (
        SELECT id FROM public.documents 
        WHERE client_id = current_setting('app.current_client_id')::UUID
    ));

-- Conversations RLS policies
CREATE POLICY conversations_tenant_isolation ON public.conversations
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- Messages RLS policies (through conversation relationship)
CREATE POLICY messages_tenant_isolation ON public.messages
    USING (conversation_id IN (
        SELECT id FROM public.conversations 
        WHERE client_id = current_setting('app.current_client_id')::UUID
    ));

-- Feedback RLS policies (through message relationship)
CREATE POLICY feedback_tenant_isolation ON public.feedback
    USING (message_id IN (
        SELECT m.id FROM public.messages m
        JOIN public.conversations c ON m.conversation_id = c.id
        WHERE c.client_id = current_setting('app.current_client_id')::UUID
    ));

-- Integration logs RLS policies
CREATE POLICY integration_logs_tenant_isolation ON public.integration_logs
    USING (client_id = current_setting('app.current_client_id')::UUID);

-- ============================================================================
-- Stored Functions
-- ============================================================================

-- Function to search similar chunks using vector similarity
CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding vector(1536),
    client_id UUID,
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    similarity FLOAT,
    title TEXT,
    source TEXT,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.document_id,
        dc.content,
        1 - (dc.embedding <=> query_embedding) as similarity,
        d.title,
        d.source,
        dc.metadata
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE d.client_id = search_similar_chunks.client_id
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Updated timestamp triggers
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample Data (for development)
-- ============================================================================

-- Insert sample client
INSERT INTO public.clients (id, name, slug, settings) VALUES 
(
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'Demo Client',
    'demo',
    '{
        "slack_channel_id": null,
        "notion_workspace_id": null,
        "embedding_model": "claude-3-haiku-20240307",
        "chat_model": "claude-3-sonnet-20240229"
    }'
);

-- Insert sample admin user (password: 'password123')
INSERT INTO public.users (id, email, password_hash, name, client_id, role) VALUES 
(
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'admin@demo.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeStNnkP6MKUPDKq2', -- bcrypt hash of 'password123'
    'Demo Admin',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'admin'
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres; 