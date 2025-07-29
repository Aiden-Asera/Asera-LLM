"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// GET /api/integrations - Get integration status
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    res.json({
        slack: {
            connected: !!req.client.settings?.slack_channel_id,
            channel_id: req.client.settings?.slack_channel_id || null,
        },
        notion: {
            connected: !!req.client.settings?.notion_workspace_id,
            workspace_id: req.client.settings?.notion_workspace_id || null,
        },
    });
}));
// POST /api/integrations/slack/connect - Connect Slack integration
router.post('/slack/connect', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // This would handle Slack OAuth flow
    res.json({
        message: 'Slack integration setup not implemented',
        oauth_url: 'https://slack.com/oauth/authorize?...',
    });
}));
// POST /api/integrations/notion/connect - Connect Notion integration
router.post('/notion/connect', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // This would handle Notion OAuth flow
    res.json({
        message: 'Notion integration setup not implemented',
        oauth_url: 'https://api.notion.com/v1/oauth/authorize?...',
    });
}));
exports.default = router;
