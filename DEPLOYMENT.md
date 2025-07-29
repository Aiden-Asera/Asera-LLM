# 🚀 Asera LLM System - Deployment Guide

This guide covers deploying the Asera LLM System across different environments, from development to production.

## 📋 Pre-Deployment Checklist

### Required Services & API Keys
- [ ] Claude API key from Anthropic Console
- [ ] Supabase project with pgvector extension enabled
- [ ] Redis instance (Redis Cloud or self-hosted)
- [ ] Sentry project for error tracking
- [ ] Domain name and SSL certificate (production)

### Optional Integrations
- [ ] Slack app with bot token and signing secret
- [ ] Notion integration with API key
- [ ] Google Cloud Storage bucket (for file uploads)

## 🏠 Local Development Setup

### 1. Quick Start with Docker
```bash
# Clone and install dependencies
git clone <repository-url>
cd asera-llm-system
npm install

# Set up environment variables (see below)
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# Start all services
docker-compose up
```

### 2. Manual Setup
```bash
# Install dependencies
npm install

# Start database and Redis
docker-compose up postgres redis -d

# Start backend (terminal 1)
cd packages/backend
npm run dev

# Start frontend (terminal 2)  
cd packages/frontend
npm run dev
```

Access the application at http://localhost:5173

## ☁️ Cloud Deployment Options

### Option 1: Vercel + Railway (Recommended)

**Frontend (Vercel)**:
1. Connect your GitHub repo to Vercel
2. Set build command: `npm run build`
3. Set output directory: `packages/frontend/dist`
4. Add environment variables:
   ```
   VITE_API_URL=https://your-backend-domain.railway.app/api
   ```

**Backend (Railway)**:
1. Connect GitHub repo to Railway
2. Select `packages/backend` as root directory
3. Add environment variables (see production section below)
4. Deploy with automatic SSL and domain

### Option 2: Google Cloud Platform

**Cloud Run Deployment**:
```bash
# Build and push backend
gcloud builds submit --tag gcr.io/PROJECT-ID/asera-backend packages/backend
gcloud run deploy asera-backend --image gcr.io/PROJECT-ID/asera-backend --platform managed

# Build and push frontend  
gcloud builds submit --tag gcr.io/PROJECT-ID/asera-frontend packages/frontend
gcloud run deploy asera-frontend --image gcr.io/PROJECT-ID/asera-frontend --platform managed
```

**Cloud SQL for PostgreSQL**:
```bash
# Create PostgreSQL instance with pgvector
gcloud sql instances create asera-db --database-version=POSTGRES_14 --tier=db-f1-micro

# Enable pgvector extension
gcloud sql connect asera-db --user=postgres
> CREATE EXTENSION vector;
```

### Option 3: AWS Deployment

**ECS Fargate**:
1. Build and push Docker images to ECR
2. Create ECS cluster and task definitions
3. Set up Application Load Balancer
4. Configure RDS PostgreSQL with pgvector
5. Use ElastiCache for Redis

**Lambda + API Gateway (Serverless)**:
- Deploy backend as Lambda functions
- Use RDS Proxy for database connections
- Deploy frontend to S3 + CloudFront

## 🔧 Environment Configuration

### Backend Environment Variables

**Required**:
```bash
NODE_ENV=production
PORT=3000

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Authentication
JWT_SECRET=your-strong-32-character-secret
JWT_EXPIRES_IN=7d

# Claude API
CLAUDE_API_KEY=sk-ant-your-claude-api-key

# Redis (optional, falls back to memory)
REDIS_URL=redis://your-redis-host:6379

# Error Tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# CORS
FRONTEND_URL=https://your-frontend-domain.com
```

**Optional Integrations**:
```bash
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_APP_ID=A1B2C3D4E5
SLACK_SIGNING_SECRET=your-slack-signing-secret

# Notion Integration
NOTION_API_KEY=secret_your-notion-api-key

# File Storage
GCS_BUCKET_NAME=your-storage-bucket
GCS_PROJECT_ID=your-gcp-project
```

### Frontend Environment Variables
```bash
VITE_API_URL=https://your-backend-domain.com/api
VITE_SENTRY_DSN=https://your-frontend-sentry-dsn@sentry.io/project-id
```

## 🗄️ Database Setup

### Supabase Configuration
1. Create new Supabase project
2. Run the schema from `database/schema.sql`
3. Enable Row Level Security (RLS)
4. Create service role key with full access

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Run the complete schema from database/schema.sql
-- This includes tables, RLS policies, indexes, and functions
```

### Local PostgreSQL (Development)
```bash
# Start PostgreSQL with pgvector
docker run -d \
  --name asera-postgres \
  -e POSTGRES_DB=asera_llm \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres123 \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

# Load schema
psql -h localhost -U postgres -d asera_llm -f database/schema.sql
```

## 🔐 Security Hardening

### Production Security Checklist
- [ ] Use strong, unique JWT_SECRET (32+ characters)
- [ ] Enable HTTPS/SSL on all endpoints
- [ ] Configure CORS to only allow frontend domain
- [ ] Set up rate limiting with Redis
- [ ] Enable Supabase RLS policies
- [ ] Use environment-specific Sentry projects
- [ ] Set up database backups and monitoring
- [ ] Configure firewall rules for database access
- [ ] Enable audit logging for sensitive operations

### Secrets Management
```bash
# Using Google Secret Manager
gcloud secrets create jwt-secret --data-file=jwt-secret.txt
gcloud secrets create claude-api-key --data-file=claude-key.txt

# Using AWS Secrets Manager
aws secretsmanager create-secret --name "asera/jwt-secret" --secret-string "your-jwt-secret"
aws secretsmanager create-secret --name "asera/claude-api-key" --secret-string "your-claude-key"

# Using Azure Key Vault
az keyvault secret set --vault-name asera-vault --name jwt-secret --value "your-jwt-secret"
az keyvault secret set --vault-name asera-vault --name claude-api-key --value "your-claude-key"
```

## 📊 Monitoring & Observability

### Sentry Setup
1. Create separate Sentry projects for backend and frontend
2. Configure error alerting for critical errors
3. Set up performance monitoring for API endpoints
4. Create custom dashboards for key metrics

### Logging Configuration
```bash
# Production logging environment variables
LOG_LEVEL=info
LOG_FORMAT=json

# Structured logging example
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "service": "asera-backend",
  "clientId": "client-uuid",
  "userId": "user-uuid",
  "endpoint": "/api/chat",
  "responseTime": 1234,
  "tokenCount": 567
}
```

### Health Checks
```bash
# Backend health endpoint
curl https://your-backend.com/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected"
}
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example
```yaml
# .github/workflows/deploy.yml
name: Deploy Asera LLM System

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test
      - run: npm run type-check
      - run: npm run lint

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        uses: railway-app/railway@v1
        with:
          api-key: ${{ secrets.RAILWAY_API_KEY }}
          service: asera-backend

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

## 🚨 Disaster Recovery

### Backup Strategy
- **Database**: Daily automated backups via Supabase
- **File Storage**: Versioned with Google Cloud Storage
- **Configuration**: Store in version control
- **Secrets**: Replicated across multiple secret managers

### Recovery Procedures
1. **Database Recovery**:
   ```bash
   # Restore from Supabase backup
   supabase db restore --backup-id backup-20240115
   ```

2. **Application Recovery**:
   ```bash
   # Rollback deployment
   vercel rollback
   railway rollback
   ```

3. **Full Environment Recreation**:
   ```bash
   # Re-run deployment with Infrastructure as Code
   terraform apply
   ```

## 📈 Scaling Considerations

### Horizontal Scaling
- **Backend**: Deploy multiple instances behind load balancer
- **Database**: Use read replicas for analytics queries
- **Redis**: Use Redis Cluster for distributed caching
- **File Storage**: Use CDN for static assets

### Performance Optimization
- **Database**: Optimize pgvector indexes for similarity search
- **API**: Implement caching for document chunks
- **Frontend**: Code splitting and lazy loading
- **Claude API**: Batch embedding requests when possible

### Cost Optimization
- **Claude API**: Use Haiku model for embeddings (cheaper)
- **Database**: Archive old conversations and documents
- **Infrastructure**: Auto-scaling based on usage patterns
- **Monitoring**: Set up billing alerts and usage dashboards

## 🧪 Testing in Production

### Smoke Tests
```bash
# Test critical user flows
curl -X POST https://your-api.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}'

curl -X POST https://your-api.com/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, how can you help me?"}'
```

### Load Testing
```bash
# Using Artillery
npm install -g artillery
artillery quick --count 10 --num 50 https://your-api.com/health

# Using k6
k6 run --vus 10 --duration 30s load-test.js
```

## 📞 Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly: Review error logs and performance metrics
- [ ] Monthly: Update dependencies and security patches
- [ ] Quarterly: Review and optimize database indexes
- [ ] Annually: Security audit and penetration testing

### Emergency Contacts
- **Infrastructure**: Cloud provider support
- **Application**: Development team on-call rotation
- **Database**: Supabase support team
- **Monitoring**: Sentry alerts and notifications

---

## 🎯 Next Steps After Deployment

1. **Integration Setup**: Configure Slack and Notion OAuth flows
2. **Client Onboarding**: Create first production client and test data ingestion
3. **Performance Tuning**: Monitor and optimize based on real usage
4. **Feature Rollout**: Deploy Part 2 (Analytics) and Part 3 (Agent capabilities)
5. **Documentation**: Create user guides and admin documentation

For additional support, check the main README.md or create an issue in the repository. 