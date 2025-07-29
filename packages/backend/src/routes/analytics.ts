import { Router, Request, Response } from 'express';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// GET /api/analytics/usage - Get usage statistics
router.get('/usage', asyncHandler(async (req: Request, res: Response) => {
  const clientDb = new ClientDatabase(req.client!.id);
  const period = req.query.period as string || 'week';

  try {
    // Get basic usage stats
    const stats = {
      total_messages: 0,
      total_documents: 0,
      average_response_time: 0,
      active_users: 0,
      top_sources: [],
    };

    res.json({
      period,
      stats,
      client_id: req.client!.id,
    });
  } catch (error) {
    logger.error('Failed to fetch analytics:', {
      error,
      clientId: req.client!.id,
    });
    throw error;
  }
}));

export default router; 