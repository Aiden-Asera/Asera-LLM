"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.asyncHandler = asyncHandler;
const logger_1 = require("../utils/logger");
const errors_1 = require("../types/errors");
function errorHandler(error, req, res, next) {
    // If response was already sent, delegate to default Express error handler
    if (res.headersSent) {
        return next(error);
    }
    // Log the error with context
    logger_1.logger.error('Request error:', {
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
        },
        request: {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            params: req.params,
            query: req.query,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
        },
        user: req.user?.id,
        client: req.client?.id,
    });
    // Handle known error types
    if (error instanceof errors_1.AuthenticationError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    if (error instanceof errors_1.AuthorizationError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    if (error instanceof errors_1.ValidationError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    if (error instanceof errors_1.ConflictError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    if (error instanceof errors_1.RateLimitError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    if (error instanceof errors_1.PayloadTooLargeError) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }
    // Handle validation errors (from Joi or other validators)
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: error.message,
            },
        });
    }
    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: {
                code: 'INVALID_TOKEN',
                message: 'Invalid authentication token',
            },
        });
    }
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: {
                code: 'TOKEN_EXPIRED',
                message: 'Authentication token has expired',
            },
        });
    }
    // Handle database errors
    if (error.message?.includes('duplicate key value')) {
        return res.status(409).json({
            error: {
                code: 'DUPLICATE_RESOURCE',
                message: 'Resource already exists',
            },
        });
    }
    if (error.message?.includes('foreign key constraint')) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REFERENCE',
                message: 'Invalid resource reference',
            },
        });
    }
    // Handle rate limiting errors
    if (error.message?.includes('Rate limit exceeded')) {
        return res.status(429).json({
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
            },
        });
    }
    // Handle file upload errors
    if (error.message?.includes('File too large')) {
        return res.status(413).json({
            error: {
                code: 'FILE_TOO_LARGE',
                message: 'Uploaded file is too large',
            },
        });
    }
    // Default to 500 for unknown errors
    res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            ...(process.env.NODE_ENV === 'development' && {
                details: {
                    message: error.message,
                    stack: error.stack,
                },
            }),
        },
    });
}
// Async error wrapper
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
