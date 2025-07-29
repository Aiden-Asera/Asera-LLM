import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

// Redis client for distributed rate limiting
let redisClient: any = null;

if (process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
  });

  redisClient.on('error', (err: Error) => {
    logger.error('Redis client error:', err);
  });

  redisClient.connect().catch((err: Error) => {
    logger.error('Failed to connect to Redis:', err);
  });
}

// Rate limiters for different endpoints
const globalLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'global_rl',
      points: 100, // Number of requests
      duration: 60, // Per 60 seconds
    })
  : new RateLimiterMemory({
      points: 100,
      duration: 60,
    });

const chatLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'chat_rl',
      points: 30, // Number of chat requests
      duration: 60, // Per 60 seconds
    })
  : new RateLimiterMemory({
      points: 30,
      duration: 60,
    });

const uploadLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'upload_rl',
      points: 10, // Number of upload requests
      duration: 60, // Per 60 seconds
    })
  : new RateLimiterMemory({
      points: 10,
      duration: 60,
    });

const embeddingLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'embedding_rl',
      points: 50, // Number of embedding requests
      duration: 60, // Per 60 seconds
    })
  : new RateLimiterMemory({
      points: 50,
      duration: 60,
    });

function getRateLimiter(endpoint: string) {
  if (endpoint.includes('/chat')) {
    return chatLimiter;
  }
  if (endpoint.includes('/upload') || endpoint.includes('/documents')) {
    return uploadLimiter;
  }
  if (endpoint.includes('/embed')) {
    return embeddingLimiter;
  }
  return globalLimiter;
}

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Use IP address as the key, or user ID if authenticated
    const key = (req as any).user?.id || req.ip || 'anonymous';
    const rateLimiter = getRateLimiter(req.path);

    const resRateLimiter = await rateLimiter.consume(key);
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': rateLimiter.points.toString(),
      'X-RateLimit-Remaining': resRateLimiter.remainingPoints?.toString() || '0',
      'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext).toISOString(),
    });

    next();
  } catch (rejRes: any) {
    // Rate limit exceeded
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    
    res.set({
      'X-RateLimit-Limit': rejRes.totalHits?.toString() || '0',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
      'Retry-After': secs.toString(),
    });

    logger.warn('Rate limit exceeded:', {
      key: (req as any).user?.id || req.ip,
      endpoint: req.path,
      retryAfter: secs,
    });

    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Try again in ${secs} seconds.`,
        retryAfter: secs,
      },
    });
  }
}

// Rate limiter for specific client operations
export function createClientRateLimiter(clientId: string, points: number = 1000, duration: number = 3600) {
  return redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: `client_${clientId}_rl`,
        points,
        duration,
      })
    : new RateLimiterMemory({
        points,
        duration,
      });
}

export default rateLimitMiddleware; 