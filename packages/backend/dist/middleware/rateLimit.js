"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRateLimit = exports.authRateLimit = exports.globalRateLimit = void 0;
exports.createRateLimit = createRateLimit;
const logger_1 = require("../utils/logger");
// Simple in-memory rate limiting (for development)
const requests = new Map();
function createRateLimit(options) {
    return (req, res, next) => {
        // For now, just log and continue (disable rate limiting)
        logger_1.logger.debug('Rate limiting disabled for development');
        next();
    };
}
exports.globalRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
exports.authRateLimit = createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
exports.uploadRateLimit = createRateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
