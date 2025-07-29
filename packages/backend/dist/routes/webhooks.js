"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clientSync_1 = require("../services/clientSync");
const logger_1 = require("../utils/logger");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
/**
 * Verify Notion webhook signature
 */
function verifyNotionWebhook(request, body) {
    const signature = request.headers['x-notion-signature'];
    const timestamp = request.headers['x-notion-timestamp'];
    const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;
    if (!signature || !timestamp || !webhookSecret) {
        logger_1.logger.warn('Missing webhook verification data:', {
            hasSignature: !!signature,
            hasTimestamp: !!timestamp,
            hasSecret: !!webhookSecret,
        });
        return false;
    }
    try {
        const signedContent = `${timestamp}.${body}`;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', webhookSecret)
            .update(signedContent, 'utf8')
            .digest('hex');
        const isValid = crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
        if (!isValid) {
            logger_1.logger.warn('Invalid webhook signature');
        }
        return isValid;
    }
    catch (error) {
        logger_1.logger.error('Error verifying webhook signature:', { error });
        return false;
    }
}
/**
 * POST /api/webhooks/notion - Handle Notion webhooks
 */
router.post('/notion', async (req, res) => {
    try {
        const body = JSON.stringify(req.body);
        // For private integrations, skip signature verification
        // Private integrations don't provide webhook secrets
        if (process.env.NOTION_WEBHOOK_SECRET) {
            if (!verifyNotionWebhook(req, body)) {
                logger_1.logger.warn('Invalid webhook signature, rejecting request');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }
        else {
            logger_1.logger.info('Private integration detected, skipping signature verification');
        }
        logger_1.logger.info('Received Notion webhook:', {
            type: req.body.type,
            pageId: req.body.page?.id,
            timestamp: new Date().toISOString(),
        });
        // Process the webhook
        const result = await clientSync_1.clientSyncService.handleWebhook(req.body);
        if (result.success) {
            logger_1.logger.info('Webhook processed successfully:', { message: result.message });
            res.json({
                success: true,
                message: result.message,
                timestamp: new Date().toISOString(),
            });
        }
        else {
            logger_1.logger.error('Webhook processing failed:', { message: result.message });
            res.status(500).json({
                success: false,
                error: result.message,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        logger_1.logger.error('Error processing webhook:', { error });
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        });
    }
});
/**
 * GET /api/webhooks/notion/health - Health check for webhook endpoint
 */
router.get('/notion/health', (req, res) => {
    res.json({
        success: true,
        message: 'Notion webhook endpoint is healthy',
        timestamp: new Date().toISOString(),
        config: {
            hasWebhookSecret: !!process.env.NOTION_WEBHOOK_SECRET,
            hasNotionApiKey: !!process.env.NOTION_API_KEY,
            hasSupabaseConfig: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
        },
    });
});
exports.default = router;
