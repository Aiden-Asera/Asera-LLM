import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Simple in-memory rate limiting (for development)
const requests = new Map<string, { count: number; resetTime: number }>();

export function createRateLimit(options: { windowMs: number; max: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    // For now, just log and continue (disable rate limiting)
    logger.debug('Rate limiting disabled for development');
    next();
  };
}

export const globalRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
export const authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
export const uploadRateLimit = createRateLimit({ windowMs: 60 * 60 * 1000, max: 10 }); 