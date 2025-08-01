"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const isDevelopment = process.env.NODE_ENV === 'development';
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.metadata({
        fillExcept: ['message', 'level', 'timestamp'],
    })),
    defaultMeta: {
        service: 'asera-llm-backend',
        version: process.env.npm_package_version || '1.0.0',
    },
    transports: [
        new winston_1.default.transports.Console({
            format: isDevelopment
                ? winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
                : winston_1.default.format.json(),
        }),
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        new winston_1.default.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// Create logs directory if it doesn't exist
const fs_1 = require("fs");
try {
    (0, fs_1.mkdirSync)('logs', { recursive: true });
}
catch (error) {
    // Directory already exists or permission error
}
exports.default = exports.logger;
