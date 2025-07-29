"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.requireRole = requireRole;
exports.generateToken = generateToken;
const jwt = __importStar(require("jsonwebtoken"));
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const errors_1 = require("../types/errors");
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.AuthenticationError('Authorization header required');
        }
        const token = authHeader.substring(7);
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable not configured');
        }
        // Check if supabase is available
        if (!database_1.supabase) {
            throw new Error('Database not configured');
        }
        // Verify JWT token
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        // Fetch user from database
        const { data: user, error: userError } = await database_1.supabase
            .from('users')
            .select('*')
            .eq('id', payload.userId)
            .single();
        if (userError || !user) {
            throw new errors_1.AuthenticationError('Invalid user token');
        }
        // Fetch client from database
        const { data: client, error: clientError } = await database_1.supabase
            .from('clients')
            .select('*')
            .eq('id', payload.clientId)
            .single();
        if (clientError || !client) {
            throw new errors_1.AuthenticationError('Invalid client token');
        }
        // Verify user belongs to client
        if (user.client_id !== client.id) {
            throw new errors_1.AuthorizationError('User does not belong to this client');
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
    }
    catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return next(new errors_1.AuthenticationError('Invalid token'));
        }
        if (error instanceof jwt.TokenExpiredError) {
            return next(new errors_1.AuthenticationError('Token expired'));
        }
        logger_1.logger.error('Authentication error:', error);
        next(error);
    }
}
function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.user) {
            throw new errors_1.AuthenticationError('User not authenticated');
        }
        if (requiredRole === 'admin' && req.user.role !== 'admin') {
            throw new errors_1.AuthorizationError('Admin role required');
        }
        next();
    };
}
function generateToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable not configured');
    }
    const payload = {
        userId: user.id,
        clientId: user.clientId,
        role: user.role
    };
    const secret = process.env.JWT_SECRET;
    const options = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };
    return jwt.sign(payload, secret, options);
}
