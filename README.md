# 🧠 Asera LLM System

A comprehensive multi-tenant AI chatbot system using Claude for both embeddings and chat completions, with integrated Slack and Notion data sources for Retrieval-Augmented Generation (RAG).

## 🎯 Features

### Core Chatbot (MVP)
- **Multi-tenant Architecture**: Complete data isolation per client with Row Level Security
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
- **Tenant-isolated tables**: `documents`, `document_chunks`, `conversations`, `messages`
- **Vector search**: pgvector embeddings with similarity search functions
- **RLS policies**: Automatic tenant isolation for all queries

Key tables:
- `documents`: Store ingested content from all sources
- `document_chunks`: Vectorized chunks for RAG search  
- `conversations` & `messages`: Chat history with metadata
- `feedback`: User ratings for continuous improvement

## 🔧 Configuration

### Client Settings
Each client can configure:
```json
{
  "slack_channel_id": "C1234567890",
  "notion_workspace_id": "workspace-uuid", 
  "embedding_model": "claude-3-haiku-20240307",
  "chat_model": "claude-3-sonnet-20240229"
}
```

### Rate Limits (per minute)
- General API: 100 requests
- Chat endpoints: 30 requests  
- File uploads: 10 requests
- Embeddings: 50 requests

## 🔌 Integrations Setup

### Slack Integration
1. Create a Slack app at https://api.slack.com/apps
2. Enable permissions: `channels:read`, `channels:history`, `chat:write`
3. Install app to workspace and invite to target channel
4. Add bot token to environment variables

### Notion Integration  
1. Create integration at https://www.notion.so/my-integrations
2. Share target databases with the integration
3. Configure database IDs for meeting notes, client pages
4. Add API key to environment variables

### Sentry Error Tracking
1. Create project at https://sentry.io
2. Add DSN to environment variables
3. Error tracking automatically enabled

## 🚢 Deployment

### Production Checklist
- [ ] Set strong JWT_SECRET (32+ characters)
- [ ] Configure production Supabase instance
- [ ] Set up Redis cluster for scaling
- [ ] Configure environment variables in deployment platform
- [ ] Set up domain and SSL certificates
- [ ] Configure Slack/Notion OAuth for production URLs
- [ ] Set up monitoring and log aggregation
- [ ] Configure backup strategy for PostgreSQL

### Environment Variables for Production
```bash
NODE_ENV=production
JWT_SECRET=your-production-jwt-secret
CLAUDE_API_KEY=your-claude-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-production-service-key
REDIS_URL=your-production-redis-url
SENTRY_DSN=your-production-sentry-dsn
```

## 📁 Project Structure
```
asera-llm-system/
├── packages/
│   ├── backend/           # Express API server
│   │   ├── src/
│   │   │   ├── routes/    # API endpoints
│   │   │   ├── services/  # Business logic (Claude, RAG)
│   │   │   ├── middleware/# Auth, rate limiting, errors
│   │   │   └── utils/     # Database, logging utilities
│   │   └── package.json
│   ├── frontend/          # React application  
│   │   ├── src/
│   │   │   ├── components/# Reusable UI components
│   │   │   ├── pages/     # Main application pages
│   │   │   ├── contexts/  # React contexts (auth, etc)
│   │   │   └── hooks/     # Custom React hooks
│   │   └── package.json
│   └── shared/            # Shared types and utilities
│       ├── src/types.ts   # TypeScript definitions
│       └── package.json
├── database/
│   └── schema.sql         # PostgreSQL schema with RLS
├── docker-compose.yml     # Local development setup
└── package.json           # Workspace configuration
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Run linting: `npm run lint`
5. Run type checking: `npm run type-check`  
6. Commit changes: `git commit -m "Description"`
7. Push to branch: `git push origin feature-name`
8. Create a Pull Request

## 📝 API Documentation

### Authentication
All API endpoints (except `/api/auth/*`) require a Bearer token:
```bash
Authorization: Bearer <jwt-token>
```

### Main Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/chat` - Send chat message with RAG
- `POST /api/chat/stream` - Streaming chat responses
- `GET /api/documents` - List client documents
- `POST /api/documents/upload` - Upload and process documents
- `GET /api/analytics/usage` - Usage statistics

### WebSocket Support
Real-time features available via Socket.io (planned):
- Live chat responses
- Document processing status
- Integration sync notifications

## 🔒 Security Features

- **Multi-tenant isolation**: Complete data separation per client
- **JWT authentication**: Secure token-based auth with expiration
- **Rate limiting**: Per-user and per-endpoint limits
- **Input validation**: Comprehensive request validation with Joi
- **SQL injection prevention**: Parameterized queries and ORM usage
- **Password security**: bcrypt hashing with salt rounds
- **CORS configuration**: Restricted to frontend domain
- **Error handling**: No sensitive data exposed in error messages

## 📈 Monitoring & Analytics

- **Error tracking**: Sentry integration for real-time error monitoring
- **Performance metrics**: Response times and token usage tracking
- **Usage analytics**: Message counts, document processing stats
- **Client insights**: Per-tenant usage and popular content sources
- **Integration monitoring**: Slack/Notion sync status and errors

## 🐛 Troubleshooting

### Common Issues

**"Module not found" errors**: 
```bash
npm install
npm run build
```

**Database connection issues**:
- Verify Supabase credentials
- Check pgvector extension is enabled
- Ensure RLS policies are applied

**Claude API errors**:
- Verify API key is valid
- Check rate limits and usage
- Ensure model names are correct

**Vector search not working**:
- Confirm pgvector extension installed
- Check embedding dimensions (1536)
- Verify similarity search function exists

For more detailed troubleshooting, check the logs:
```bash
# Backend logs
docker-compose logs backend

# Database logs  
docker-compose logs postgres
```

## 📞 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Create GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub Discussions for questions

---

Built with ❤️ for efficient, scalable AI-powered customer support.