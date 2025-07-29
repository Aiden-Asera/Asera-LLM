"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayloadTooLargeError = exports.RateLimitError = exports.ConflictError = exports.ValidationError = exports.AuthorizationError = exports.AuthenticationError = void 0;
class AuthenticationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 401;
        this.code = 'AUTHENTICATION_ERROR';
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 403;
        this.code = 'AUTHORIZATION_ERROR';
        this.name = 'AuthorizationError';
    }
}
exports.AuthorizationError = AuthorizationError;
class ValidationError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 400;
        this.code = 'VALIDATION_ERROR';
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class ConflictError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 409;
        this.code = 'CONFLICT_ERROR';
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 429;
        this.code = 'RATE_LIMIT_ERROR';
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class PayloadTooLargeError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 413;
        this.code = 'PAYLOAD_TOO_LARGE';
        this.name = 'PayloadTooLargeError';
    }
}
exports.PayloadTooLargeError = PayloadTooLargeError;
