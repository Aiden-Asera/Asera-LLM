import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// GET /api/integrations - Get integration status
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    slack: {
      connected: !!req.client!.settings?.slack_channel_id,
      channel_id: req.client!.settings?.slack_channel_id || null,
    },
    notion: {
      connected: !!req.client!.settings?.notion_workspace_id,
      workspace_id: req.client!.settings?.notion_workspace_id || null,
    },
  });
}));

// POST /api/integrations/slack/connect - Connect Slack integration
router.post('/slack/connect', asyncHandler(async (req: Request, res: Response) => {
  // This would handle Slack OAuth flow
  res.json({
    message: 'Slack integration setup not implemented',
    oauth_url: 'https://slack.com/oauth/authorize?...',
  });
}));

// POST /api/integrations/notion/connect - Connect Notion integration
router.post('/notion/connect', asyncHandler(async (req: Request, res: Response) => {
  // This would handle Notion OAuth flow
  res.json({
    message: 'Notion integration setup not implemented',
    oauth_url: 'https://api.notion.com/v1/oauth/authorize?...',
  });
}));

export default router; 