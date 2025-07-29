# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production

# Copy shared package source
COPY packages/shared ./packages/shared

# Build shared package
RUN cd packages/shared && npm run build

# Copy backend source
COPY packages/backend ./packages/backend

# Build backend
RUN cd packages/backend && npm run build

# Create logs directory
RUN mkdir -p /app/packages/backend/logs

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /app/packages/backend

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"] 