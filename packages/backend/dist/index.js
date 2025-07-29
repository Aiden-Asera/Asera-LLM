"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const logger_1 = require("./utils/logger");
// Import routes
const chat_1 = __importDefault(require("./routes/chat"));
const admin_1 = __importDefault(require("./routes/admin"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
// Import services
const syncScheduler_1 = require("./services/syncScheduler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Basic middleware
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Logging
app.use((0, morgan_1.default)('combined', { stream: { write: message => logger_1.logger.info(message.trim()) } }));
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});
// Routes
app.use('/api/chat', chat_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/webhooks', webhooks_1.default);
// Basic test route
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Asera LLM Backend is running!',
        timestamp: new Date().toISOString()
    });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
// Basic error handler
app.use((error, req, res, next) => {
    logger_1.logger.error('Request error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});
function startServer() {
    try {
        app.listen(PORT, () => {
            logger_1.logger.info(`🚀 Asera LLM Backend running on port ${PORT}`);
            logger_1.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger_1.logger.info(`Health check: http://localhost:${PORT}/health`);
            logger_1.logger.info(`Test endpoint: http://localhost:${PORT}/api/test`);
            logger_1.logger.info(`Admin API: http://localhost:${PORT}/api/admin`);
            // Start the sync scheduler
            syncScheduler_1.syncScheduler.start();
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    syncScheduler_1.syncScheduler.stop();
    process.exit(0);
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    syncScheduler_1.syncScheduler.stop();
    process.exit(0);
});
startServer();
