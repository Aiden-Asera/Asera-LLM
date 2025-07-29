import { Router, Request, Response } from 'express';
import { syncScheduler } from '../services/syncScheduler';
import { notionService } from '../services/notion';
import { ragService } from '../services/rag';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/analytics';

const router = Router();

// GET /api/admin/sync/status - Get sync scheduler status
router.get('/sync/status', async (req: Request, res: Response) => {
  try {
    const stats = syncScheduler.getStats();
    const isHealthy = syncScheduler.isHealthy();

    res.json({
      success: true,
      data: {
        isHealthy,
        stats,
        healthDetails: {
          hasRecentSync: stats.lastIncrementalSync || stats.lastFullSync ? true : false,
          successRate: stats.totalSyncs > 0 
            ? `${((stats.totalSyncs - stats.failedSyncs) / stats.totalSyncs * 100).toFixed(1)}%`
            : '0%',
          lastSyncType: stats.lastIncrementalSync && stats.lastFullSync
            ? (stats.lastIncrementalSync > stats.lastFullSync ? 'incremental' : 'full')
            : stats.lastIncrementalSync ? 'incremental' : stats.lastFullSync ? 'full' : 'none',
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get sync status:', { error });
    res.status(500).json({
      error: 'Failed to get sync status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/admin/sync/trigger - Trigger manual sync
router.post('/sync/trigger', async (req: Request, res: Response) => {
  try {
    const { type = 'incremental' } = req.body;
    
    if (!['incremental', 'full'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid sync type',
        message: 'Type must be "incremental" or "full"',
      });
    }

    logger.info('Manual sync requested via API:', { type });
    
    const result = await syncScheduler.triggerManualSync(type);

    res.json({
      success: result.success,
      data: {
        message: result.message,
        stats: result.stats,
        syncType: type,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to trigger manual sync:', { error });
    res.status(500).json({
      error: 'Failed to trigger sync',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/system/health - Get overall system health
router.get('/system/health', async (req: Request, res: Response) => {
  try {
    const syncStats = syncScheduler.getStats();
    const syncHealthy = syncScheduler.isHealthy();
    
    // Get analytics metrics for health check
    const analyticsMetrics = await analyticsService.getSearchMetrics('asera-master');
    
    const systemHealth = {
      status: syncHealthy && analyticsMetrics.totalSearches > 0 ? 'healthy' : 'warning',
      components: {
        sync: {
          status: syncHealthy ? 'healthy' : 'unhealthy',
          lastSync: syncStats.lastIncrementalSync || syncStats.lastFullSync,
          totalSyncs: syncStats.totalSyncs,
          failureRate: syncStats.totalSyncs > 0 
            ? `${(syncStats.failedSyncs / syncStats.totalSyncs * 100).toFixed(1)}%`
            : '0%',
        },
        search: {
          status: analyticsMetrics.totalSearches > 0 ? 'healthy' : 'no_activity',
          totalSearches: analyticsMetrics.totalSearches,
          avgResponseTime: analyticsMetrics.avgResponseTime,
          successRate: `${analyticsMetrics.successRate}%`,
        },
        database: {
          status: 'connected', // Would check actual DB connection in production
          embeddings: 'claude-enhanced',
        },
        apis: {
          claude: process.env.CLAUDE_API_KEY ? 'configured' : 'missing',
          supabase: process.env.SUPABASE_URL ? 'configured' : 'missing',
          notion: process.env.NOTION_API_KEY ? 'configured' : 'missing',
        },
      },
    };

    res.json({
      success: true,
      data: systemHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get system health:', { error });
    res.status(500).json({
      error: 'Failed to get system health',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/admin/test/rag - Test RAG functionality
router.post('/test/rag', async (req: Request, res: Response) => {
  try {
    const { query, clientId = 'asera-master' } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required'
      });
    }

    const clientDb = new ClientDatabase(clientId);
    
    // Test RAG response
    const ragResponse = await ragService.generateRAGResponse(clientDb, query, {
      model: 'claude-3-haiku-20240307'
    });

    res.json({
      success: true,
      query,
      clientId,
      response: ragResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('RAG test failed:', { error });
    res.status(500).json({
      error: 'RAG test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/debug/search - Debug search functionality
router.get('/debug/search', async (req: Request, res: Response) => {
  try {
    const { query = 'asera', clientId = 'asera-master' } = req.query;
    
    const clientDb = new ClientDatabase(clientId as string);
    
    // Get all documents
    const allDocs = await clientDb.getAllDocuments();
    
    // Search for chunks
    const chunks = await clientDb.searchSimilarChunks(query as string, 10);
    
    // Search in document content directly
    const docsWithContent = allDocs.filter(doc => 
      doc.content?.toLowerCase().includes((query as string).toLowerCase())
    );
    
    res.json({
      success: true,
      debug: {
        query,
        clientId,
        totalDocuments: allDocs.length,
        chunksFound: chunks.length,
        documentsWithQueryInContent: docsWithContent.length,
        documentTitles: allDocs.map(doc => ({
          id: doc.id,
          title: doc.title,
          source: doc.source,
          contentLength: doc.content?.length || 0,
          hasQueryInTitle: doc.title?.toLowerCase().includes((query as string).toLowerCase()),
          hasQueryInContent: doc.content?.toLowerCase().includes((query as string).toLowerCase())
        })),
        chunks: chunks.map(chunk => ({
          id: chunk.id,
          documentTitle: chunk.documents?.title,
          contentSnippet: chunk.content.substring(0, 200) + '...',
          chunkIndex: chunk.chunk_index
        }))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Debug search failed:', { error });
    res.status(500).json({
      error: 'Debug search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/admin/analytics/popular-queries - Get popular search queries
router.get('/analytics/popular-queries', async (req: Request, res: Response) => {
  try {
    const { clientId = 'asera-master', limit = 10 } = req.query;
    
    const popularQueries = await analyticsService.getPopularQueries(
      clientId as string, 
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: {
        popularQueries,
        totalQueries: popularQueries.length,
        clientId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get popular queries:', { error });
    res.status(500).json({
      error: 'Failed to get analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/analytics/metrics - Get comprehensive search metrics
router.get('/analytics/metrics', async (req: Request, res: Response) => {
  try {
    const { clientId = 'asera-master' } = req.query;
    
    const metrics = await analyticsService.getSearchMetrics(clientId as string);

    res.json({
      success: true,
      data: {
        ...metrics,
        clientId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get search metrics:', { error });
    res.status(500).json({
      error: 'Failed to get search metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/admin/analytics/trending - Get trending queries
router.get('/analytics/trending', async (req: Request, res: Response) => {
  try {
    const { clientId = 'asera-master', limit = 5 } = req.query;
    
    const trendingQueries = await analyticsService.getTrendingQueries(
      clientId as string,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: {
        trendingQueries,
        clientId,
        timeframe: 'last 24 hours vs previous 24 hours',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get trending queries:', { error });
    res.status(500).json({
      error: 'Failed to get trending queries',
      message: error instanceof Error ? error.message : 'Unknown error',
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

// GET /api/admin/system/status - Get basic system status
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
    sync: {
      isHealthy: syncScheduler.isHealthy(),
      stats: syncScheduler.getStats(),
    },
    timestamp: new Date().toISOString()
  };

  res.json({
    success: true,
    status
  });
});

export default router; 