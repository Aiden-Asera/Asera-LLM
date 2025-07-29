"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../utils/database");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("../middleware/errorHandler");
const errors_1 = require("../types/errors");
const router = (0, express_1.Router)();
// POST /api/auth/login - User login
router.post('/login', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        throw new errors_1.ValidationError('Email and password are required');
    }
    if (!database_1.supabase) {
        throw new Error('Database not configured');
    }
    try {
        // Find user by email
        const { data: user, error: userError } = await database_1.supabase
            .from('users')
            .select('*')
            .eq('email', email.toLowerCase())
            .single();
        if (userError || !user) {
            throw new errors_1.AuthenticationError('Invalid email or password');
        }
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new errors_1.AuthenticationError('Invalid email or password');
        }
        // Generate JWT token
        const token = (0, auth_1.generateToken)({
            id: user.id,
            clientId: user.client_id,
            role: user.role,
        });
        // Get client information
        const { data: client } = await database_1.supabase
            .from('clients')
            .select('*')
            .eq('id', user.client_id)
            .single();
        logger_1.logger.info('User logged in:', {
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
    }
    catch (error) {
        logger_1.logger.error('Login failed:', { error, email });
        throw error;
    }
}));
// POST /api/auth/register - User registration (admin only or invitation-based)
router.post('/register', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, name, clientId, invitationToken } = req.body;
    if (!email || !password || !name || !clientId) {
        throw new errors_1.ValidationError('Email, password, name, and clientId are required');
    }
    if (!database_1.supabase) {
        throw new Error('Database not configured');
    }
    try {
        // Verify invitation token or admin permissions here
        // For now, we'll allow registration with a valid client ID
        // Check if user already exists
        const { data: existingUser } = await database_1.supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();
        if (existingUser) {
            throw new errors_1.ValidationError('User with this email already exists');
        }
        // Hash password
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        // Create user
        const { data: newUser, error: createError } = await database_1.supabase
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
        const token = (0, auth_1.generateToken)({
            id: newUser.id,
            clientId: newUser.client_id,
            role: newUser.role,
        });
        logger_1.logger.info('User registered:', {
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
    }
    catch (error) {
        logger_1.logger.error('Registration failed:', { error, email });
        throw error;
    }
}));
// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', (0, errorHandler_1.asyncHandler)(async (req, res) => {
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
router.post('/logout', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // In a more sophisticated setup, you might invalidate the token
    res.json({ success: true, message: 'Logged out successfully' });
}));
exports.default = router;
