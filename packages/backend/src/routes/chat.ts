import { Router, Request, Response } from 'express';
import { claudeService } from '../services/claude';
import { ragService } from '../services/rag';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/chat - Send a chat message
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required and must be a string'
      });
    }

    logger.info('Chat request received:', {
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });

    // Use RAG to generate contextual response
    // Default to 'asera-master' if no specific client context
    const clientId = req.query.clientId as string || 'asera-master';
    const clientDb = new ClientDatabase(clientId);

    const ragResponse = await ragService.generateRAGResponse(clientDb, message, {
      model: 'claude-3-haiku-20240307', // Fast and cost-effective for demos
    });

    logger.info('RAG response generated:', {
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

  } catch (error) {
    logger.error('Chat request failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({
      error: 'Failed to generate response',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 