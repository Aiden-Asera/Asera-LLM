# Use Node.js 18 Alpine
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy shared package source
COPY packages/shared ./packages/shared

# Build shared package
RUN cd packages/shared && npm run build

# Copy frontend source
COPY packages/frontend ./packages/frontend

# Set working directory to frontend
WORKDIR /app/packages/frontend

# Build the app for production
RUN npm run build

# Install serve to run the production build
RUN npm install -g serve

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5173 || exit 1

# For development, use dev server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# For production, use this instead:
# CMD ["serve", "-s", "dist", "-l", "5173"] 