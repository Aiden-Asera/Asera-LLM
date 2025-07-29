# 🧠 Asera LLM System

A comprehensive multi-tenant AI chatbot system featuring **Corra**, a friendly and personable AI assistant powered by Claude for both embeddings and chat completions, with integrated Slack and Notion data sources for Retrieval-Augmented Generation (RAG).

## 🎯 Features

### Core Chatbot (MVP)
- **Multi-tenant Architecture**: Complete data isolation per client with Row Level Security
- **Corra AI Assistant**: Friendly and personable AI chatbot with warm, conversational responses
- **RAG Pipeline**: Claude-powered embeddings with semantic search capabilities  
- **Real-time Integrations**: Slack channels and Notion pages auto-sync
- **Secure Chat Interface**: JWT authentication with conversation history
- **Source Attribution**: Every answer includes references to source documents
- **Error Logging**: Comprehensive monitoring with Sentry integration

### Data Sources
- **Slack**: Ingests messages from designated client channels
- **Notion**: Syncs meeting notes, client pages, and website outlines  
- **File Uploads**: PDF, Word docs, and text files with automatic processing
- **Real-time Updates**: Webhook triggers for new content

### Advanced Features (Roadmap)
- **Client Customization**: Feedback loops and document management
- **Analytics Dashboard**: Usage statistics and insights
- **Agent Capabilities**: Claude tool use for task automation
- **Slack Bot**: Interactive bot with commands and notifications

## 🏗️ Architecture

### Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Database**: PostgreSQL + pgvector (via Supabase)
- **Vector Search**: pgvector with IVFFlat indexing
- **LLM**: Claude 3 (Haiku for embeddings, Sonnet for chat)
- **Cache/Rate Limiting**: Redis
- **Authentication**: JWT with bcrypt password hashing
- **File Storage**: Local development / Cloud storage for production

### Multi-tenant Security
- Row Level Security (RLS) policies in PostgreSQL
- Client-specific database schemas and API isolation
- JWT tokens scoped to client and user
- Rate limiting per client and endpoint

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Claude API key from Anthropic

### 1. Clone and Install
```bash
git clone <repository-url>
cd asera-llm-system
npm install
```

### 2. Environment Setup
Create environment files for each package:

**Backend (.env in packages/backend/)**:
```bash
# Required
CLAUDE_API_KEY=your-claude-api-key
JWT_SECRET=your-super-secret-jwt-key-change-this
SUPABASE_URL=your-supabase-project-url  
SUPABASE_SERVICE_KEY=your-supabase-service-role-key

# Optional for development
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your-sentry-dsn
SLACK_BOT_TOKEN=xoxb-your-bot-token
NOTION_API_KEY=your-notion-key
```

**Frontend (.env in packages/frontend/)**:
```bash
VITE_API_URL=http://localhost:3000/api
```

### 3. Database Setup

#### Option A: Using Supabase (Recommended for Production)
1. Create a new Supabase project
2. Enable the pgvector extension in SQL Editor:
   ```sql
   CREATE EXTENSION vector;
   ```
3. Run the schema from `database/schema.sql`
4. Update your .env with Supabase credentials

#### Option B: Local PostgreSQL with Docker
```bash
# Start PostgreSQL with pgvector
docker-compose up postgres redis -d

# The schema will be automatically loaded
```

### 4. Start Development Servers
```bash
# Start all services with Docker Compose
docker-compose up

# OR run individually:
npm run dev:backend    # Backend on http://localhost:3000
npm run dev:frontend   # Frontend on http://localhost:5173
```

### 5. Test the System
1. Navigate to http://localhost:5173
2. Login with demo credentials:
   - Email: `admin@demo.com`
   - Password: `password123`
3. Upload a document or start chatting!

## 📊 Database Schema

The system uses a multi-tenant PostgreSQL schema with:

- **Public tables**: `clients`, `users` (shared)
- **Tenant-isolated tables**: `documents`, `