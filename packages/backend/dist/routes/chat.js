"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rag_1 = require("../services/rag");
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// POST /api/chat - Send a chat message
router.post('/', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string'
            });
        }
        logger_1.logger.info('Chat request received:', {
            messageLength: message.length,
            timestamp: new Date().toISOString()
        });
        // Use RAG to generate contextual response
        // Default to 'asera-master' if no specific client context
        const clientId = req.query.clientId || 'asera-master';
        const clientDb = new database_1.ClientDatabase(clientId);
        const ragResponse = await rag_1.ragService.generateRAGResponse(clientDb, message, {
            model: 'claude-3-haiku-20240307', // Fast and cost-effective for demos
        });
        logger_1.logger.info('RAG response generated:', {
            query: message.substring(0, 100),
            responseLength: ragResponse.answer.length,
            sourcesUsed: ragResponse.sources.length,
            tokenCount: ragResponse.tokenCount,
            clientId
        });
        res.json({
            success: true,
            response: ragResponse.answer,
            sources: ragResponse.sources,
            metadata: {
                model: 'claude-3-haiku-20240307',
                tokenCount: ragResponse.tokenCount,
                sourcesUsed: ragResponse.sources.length,
                clientId,
                timestamp: new Date().toISOString()
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Chat request failed:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        res.status(500).json({
            error: 'Failed to generate response',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
