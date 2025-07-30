import { Router, Request, Response } from 'express';
import { clientSyncService } from '../services/clientSync';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

/**
 * Verify Notion webhook signature
 */
function verifyNotionWebhook(request: Request, body: string): boolean {
  const signature = request.headers['x-notion-signature'] as string;
  const timestamp = request.headers['x-notion-timestamp'] as string;
  const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;

  if (!signature || !timestamp || !webhookSecret) {
    logger.warn('Missing webhook verification data:', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasSecret: !!webhookSecret,
    });
    return false;
  }

  try {
    const signedContent = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedContent, 'utf8')
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
      logger.warn('Invalid webhook signature');
    }

    return isValid;
  } catch (error) {
    logger.error('Error verifying webhook signature:', { error });
    return false;
  }
}

/**
 * POST /api/webhooks/notion - Handle Notion webhooks
 */
router.post('/notion', async (req: Request, res: Response) => {
  try {
    const body = JSON.stringify(req.body);
    
    // For private integrations, skip signature verification
    // Private integrations don't provide webhook secrets
    if (process.env.NOTION_WEBHOOK_SECRET) {
      if (!verifyNotionWebhook(req, body)) {
        logger.warn('Invalid webhook signature, rejecting request');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle verification silently
    if (req.body.verification_token && !req.body.type) {
      // Silent verification response
      return res.status(200).json({ challenge: req.body.verification_token });
    }

    // Only log meaningful webhooks
    if (req.body.type && req.body.type !== 'ping') {
      logger.info('Processing Notion webhook:', { type: req.body.type });
    }

    // Process the webhook
    const result = await clientSyncService.handleWebhook(req.body);

    if (result.success) {
      logger.info('Webhook processed successfully:', { message: result.message });
      res.json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error('Webhook processing failed:', { message: result.message });
      res.status(500).json({
        success: false,
        error: result.message,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error processing webhook:', { error });
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
router.get('/notion/health', (req: Request, res: Response) => {
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

export default router; 