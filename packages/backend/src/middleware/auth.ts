import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../utils/database';
import { logger } from '../utils/logger';
import { AuthenticationError, AuthorizationError } from 'shared';

interface JWTPayload {
  userId: string;
  clientId: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'user';
        clientId: string;
      };
      client?: {
        id: string;
        name: string;
        slug: string;
        settings: Record<string, any>;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization header required');
    }

    const token = authHeader.substring(7);
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable not configured');
    }

    // Verify JWT token
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    
    // Fetch user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.userId)
      .single();

    if (userError || !user) {
      throw new AuthenticationError('Invalid user token');
    }

    // Fetch client from database
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', payload.clientId)
      .single();

    if (clientError || !client) {
      throw new AuthenticationError('Invalid client token');
    }

    // Verify user belongs to client
    if (user.client_id !== client.id) {
      throw new AuthorizationError('User does not belong to this client');
    }

    // Add user and client to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clientId: user.client_id,
    };

    req.client = {
      id: client.id,
      name: client.name,
      slug: client.slug,
      settings: client.settings,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AuthenticationError('Invalid token'));
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token expired'));
    }

    logger.error('Authentication error:', error);
    next(error);
  }
}

export function requireRole(requiredRole: 'admin' | 'user') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('User not authenticated');
    }

    if (requiredRole === 'admin' && req.user.role !== 'admin') {
      throw new AuthorizationError('Admin role required');
    }

    next();
  };
}

export function generateToken(user: {
  id: string;
  clientId: string;
  role: 'admin' | 'user';
}): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable not configured');
  }

  return jwt.sign(
    {
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
} 