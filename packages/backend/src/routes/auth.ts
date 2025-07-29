import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../utils/database';
import { generateToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticationError, ValidationError } from '../types/errors';

const router = Router();

// POST /api/auth/login - User login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  if (!supabase) {
    throw new Error('Database not configured');
  }

  try {
    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      clientId: user.client_id,
      role: user.role,
    });

    // Get client information
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', user.client_id)
      .single();

    logger.info('User logged in:', {
      userId: user.id,
      email: user.email,
      clientId: user.client_id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.client_id,
      },
      client: client || null,
    });
  } catch (error) {
    logger.error('Login failed:', { error, email });
    throw error;
  }
}));

// POST /api/auth/register - User registration (admin only or invitation-based)
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, clientId, invitationToken } = req.body;

  if (!email || !password || !name || !clientId) {
    throw new ValidationError('Email, password, name, and clientId are required');
  }

  if (!supabase) {
    throw new Error('Database not configured');
  }

  try {
    // Verify invitation token or admin permissions here
    // For now, we'll allow registration with a valid client ID

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
        client_id: clientId,
        role: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError || !newUser) {
      throw new Error('Failed to create user account');
    }

    // Generate JWT token
    const token = generateToken({
      id: newUser.id,
      clientId: newUser.client_id,
      role: newUser.role,
    });

    logger.info('User registered:', {
      userId: newUser.id,
      email: newUser.email,
      clientId: newUser.client_id,
    });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        clientId: newUser.client_id,
      },
    });
  } catch (error) {
    logger.error('Registration failed:', { error, email });
    throw error;
  }
}));

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  // This would typically use a refresh token mechanism
  // For simplicity, we'll require re-authentication
  res.status(401).json({
    error: {
      code: 'TOKEN_REFRESH_NOT_IMPLEMENTED',
      message: 'Please log in again',
    },
  });
}));

// POST /api/auth/logout - User logout
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  // In a more sophisticated setup, you might invalidate the token
  res.json({ success: true, message: 'Logged out successfully' });
}));

export default router; 