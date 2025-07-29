import { Router, Request, Response } from 'express';
import { syncScheduler } from '../services/syncScheduler';
import { notionService } from '../services/notion';
import { ragService } from '../services/rag';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/admin/sync/trigger - Manually trigger a sync
router.post('/sync/trigger', async (req: Request, res: Response) => {
  try {
    const { type = 'comprehensive' } = req.body;

    if (!['comprehensive', 'incremental'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid sync type. Must be "comprehensive" or "incremental"'
      });
    }

    logger.info('Manual sync triggered via admin API:', { type });

    // Trigger sync in background
    syncScheduler.triggerManualSync(type).catch(error => {
      logger.error('Background sync failed:', { error, type });
    });

    res.json({
      success: true,
      message: `${type} sync triggered successfully`,
      type,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to trigger sync:', { error });
    res.status(500).json({
      error: 'Failed to trigger sync',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/sync/status - Get sync status
router.get('/sync/status', (req: Request, res: Response) => {
  try {
    const status = syncScheduler.getSyncStatus();
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get sync status:', { error });
    res.status(500).json({
      error: 'Failed to get sync status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/clients/mapping - Add client mapping for data routing
router.post('/clients/mapping', async (req: Request, res: Response) => {
  try {
    const { clientId, clientName, notionKeywords } = req.body;

    if (!clientId || !clientName || !Array.isArray(notionKeywords)) {
      return res.status(400).json({
        error: 'clientId, clientName, and notionKeywords (array) are required'
      });
    }

    notionService.addClientMapping({
      clientId,
      clientName,
      notionKeywords
    });

    logger.info('Client mapping added via admin API:', { 
      clientId, 
      clientName, 
      keywords: notionKeywords 
    });

    res.json({
      success: true,
      message: 'Client mapping added successfully',
      mapping: { clientId, clientName, notionKeywords },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to add client mapping:', { error });
    res.status(500).json({
      error: 'Failed to add client mapping',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/clients/:clientId/documents - Get documents for a client
router.get('/clients/:clientId/documents', async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { source, limit = '50' } = req.query;

    const clientDb = new ClientDatabase(clientId);
    
    let documents;
    if (source) {
      documents = await clientDb.getDocumentsBySource(source as string);
    } else {
      // Get all documents
      documents = await clientDb.getAllDocuments();
    }

    // Limit results
    const limitNum = parseInt(limit as string);
    const limitedDocs = documents.slice(0, limitNum);

    res.json({
      success: true,
      clientId,
      documents: limitedDocs.map(doc => ({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        contentLength: doc.content?.length || 0,
        lastUpdated: doc.updated_at,
        metadata: {
          sourceId: doc.source_id,
          syncedAt: doc.metadata?.syncedAt
        }
      })),
      total: limitedDocs.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get client documents:', { 
      error, 
      clientId: req.params.clientId 
    });
    res.status(500).json({
      error: 'Failed to get client documents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/test/rag - Test RAG functionality
router.post('/test/rag', async (req: Request, res: Response) => {
  try {
    const { query, clientId = 'asera-master' } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'query is required'
      });
    }

    const clientDb = new ClientDatabase(clientId);
    const ragResponse = await ragService.generateRAGResponse(clientDb, query);

    res.json({
      success: true,
      query,
      clientId,
      response: ragResponse.answer,
      sources: ragResponse.sources,
      metadata: {
        tokenCount: ragResponse.tokenCount,
        sourcesFound: ragResponse.sources.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('RAG test failed:', { error, query: req.body.query });
    res.status(500).json({
      error: 'RAG test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/test/notion - Test Notion integration
router.post('/test/notion', async (req: Request, res: Response) => {
  try {
    const { databaseId, sourceType = 'notion_meeting_notes' } = req.body;

    if (!databaseId) {
      return res.status(400).json({
        error: 'databaseId is required'
      });
    }

    if (!['notion_meeting_notes', 'notion_client_page', 'notion_website_outline'].includes(sourceType)) {
      return res.status(400).json({
        error: 'Invalid sourceType'
      });
    }

    // Test sync in background
    notionService.syncNotionDatabase(databaseId, sourceType).catch(error => {
      logger.error('Background Notion test failed:', { error, databaseId });
    });

    res.json({
      success: true,
      message: 'Notion sync test triggered',
      databaseId,
      sourceType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Notion test failed:', { error });
    res.status(500).json({
      error: 'Notion test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/system/status - Get overall system status
router.get('/system/status', (req: Request, res: Response) => {
  const status = {
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    integrations: {
      claude: !!process.env.CLAUDE_API_KEY,
      notion: !!process.env.NOTION_API_KEY,
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    },
    sync: syncScheduler.getSyncStatus(),
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    status
  });
});

export default router; 