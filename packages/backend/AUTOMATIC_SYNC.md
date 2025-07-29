# Automatic Client Synchronization

This document explains how the automatic client synchronization system works, which keeps your Supabase database in sync with changes made in your Notion client database.

## Overview

The system provides multiple ways to automatically sync client data from Notion to Supabase:

1. **Scheduled Sync** - Automatic sync every 2 hours during business hours
2. **Webhook Sync** - Real-time sync when changes are made in Notion
3. **Manual Sync** - On-demand sync via API endpoints
4. **Incremental Sync** - Only sync changed clients for efficiency

## How It Works

### 1. Scheduled Automatic Sync

The system runs automatic client synchronization every 2 hours during business hours (Monday-Friday, 9 AM - 6 PM EST).

**Schedule:**
- **Frequency**: Every 2 hours during business hours
- **Time**: 9 AM, 11 AM, 1 PM, 3 PM, 5 PM (EST)
- **Type**: Incremental (only changed clients)
- **Lookback**: Last 2 hours of changes

### 2. Webhook-Based Real-Time Sync

For immediate updates, the system can receive webhooks from Notion when changes are made.

**Webhook Endpoint:** `POST /api/webhooks/notion`

**Features:**
- Real-time updates when clients are modified in Notion
- Signature verification for security
- Automatic client creation/updates
- Error handling and logging

### 3. Manual Sync Options

You can trigger syncs manually through API endpoints:

#### Full Sync (All Clients)
```bash
curl -X POST http://localhost:3000/api/admin/clients/sync \
  -H "Content-Type: application/json" \
  -d '{"type": "full"}'
```

#### Incremental Sync (Recent Changes)
```bash
curl -X POST http://localhost:3000/api/admin/clients/sync \
  -H "Content-Type: application/json" \
  -d '{"type": "incremental", "hoursBack": 4}'
```

## Setup Instructions

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Required for sync functionality
NOTION_API_KEY=your_notion_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Optional: For webhook security
NOTION_WEBHOOK_SECRET=your_webhook_secret
```

### 2. Database Migration

If you haven't already, run the migration to add the new columns:

```sql
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS products_services TEXT,
ADD COLUMN IF NOT EXISTS client_page_info TEXT;
```

### 3. Webhook Setup (Optional)

To enable real-time updates, set up a Notion webhook:

1. **Create Webhook in Notion:**
   - Go to your Notion integration settings
   - Add a webhook endpoint: `https://your-domain.com/api/webhooks/notion`
   - Select events: `page.updated`, `page.created`
   - Copy the webhook secret

2. **Add Webhook Secret:**
   ```bash
   NOTION_WEBHOOK_SECRET=your_webhook_secret_here
   ```

## API Endpoints

### Client Sync Endpoints

#### `POST /api/admin/clients/sync`
Trigger a client sync operation.

**Request Body:**
```json
{
  "type": "incremental|full",
  "hoursBack": 2
}
```

**Response:**
```json
{
  "success": true,
  "message": "incremental client sync completed",
  "stats": {
    "total": 5,
    "created": 0,
    "updated": 3,
    "skipped": 2,
    "errors": []
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### `GET /api/admin/clients/status`
Get current client sync status and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalClients": 26,
    "clientsWithEmail": 24,
    "clientsWithPageInfo": 26,
    "lastUpdated": "2024-01-15T10:25:00.000Z",
    "recentUpdates": [
      {
        "name": "Client Name",
        "slug": "client-name",
        "lastUpdated": "2024-01-15T10:25:00.000Z",
        "hasEmail": true
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Webhook Endpoints

#### `POST /api/webhooks/notion`
Receive Notion webhooks for real-time updates.

**Headers Required:**
- `x-notion-signature`: Webhook signature
- `x-notion-timestamp`: Webhook timestamp

#### `GET /api/webhooks/notion/health`
Check webhook endpoint health and configuration.

## Monitoring and Logs

### Sync Status Monitoring

Check sync status via the admin API:

```bash
# Get overall sync status
curl http://localhost:3000/api/admin/sync/status

# Get client-specific status
curl http://localhost:3000/api/admin/clients/status

# Get webhook health
curl http://localhost:3000/api/webhooks/notion/health
```

### Log Monitoring

Monitor sync activity in the logs:

```bash
# Watch sync logs
tail -f packages/backend/logs/combined.log | grep -E "(sync|client)"

# Watch for errors
tail -f packages/backend/logs/error.log
```

### Key Log Messages

**Successful Sync:**
```
INFO: Client sync completed successfully: { total: 5, created: 0, updated: 3, skipped: 2, errors: [] }
```

**Webhook Processing:**
```
INFO: Received Notion webhook: { type: "page.updated", pageId: "abc123", timestamp: "..." }
INFO: Webhook processed successfully: { message: "Client updated: Client Name" }
```

**Errors:**
```
ERROR: Client sync failed: { error: "Rate limit exceeded", duration: 5000 }
```

## Configuration Options

### Sync Schedule Customization

You can modify the sync schedule in `src/services/syncScheduler.ts`:

```typescript
// Client sync (every 2 hours during business hours)
const clientSync = cron.schedule('0 */2 9-18 * * 1-5', async () => {
  await this.performClientSync();
}, {
  scheduled: false,
  timezone: 'America/New_York', // Change timezone as needed
});
```

### Rate Limiting

The system includes built-in rate limiting to avoid hitting Notion API limits:

- 500ms delay between client syncs
- Automatic retry logic for failed requests
- Graceful handling of rate limit errors

## Troubleshooting

### Common Issues

#### 1. Sync Not Running
**Symptoms:** No sync logs appearing
**Solutions:**
- Check if the server is running
- Verify environment variables are set
- Check timezone configuration

#### 2. Webhook Not Working
**Symptoms:** Changes in Notion not reflected immediately
**Solutions:**
- Verify webhook endpoint is accessible
- Check webhook secret configuration
- Ensure Notion integration has proper permissions

#### 3. Database Errors
**Symptoms:** Sync fails with database errors
**Solutions:**
- Verify Supabase credentials
- Check database schema is up to date
- Ensure proper permissions on clients table

#### 4. Rate Limiting
**Symptoms:** Sync fails with rate limit errors
**Solutions:**
- Increase delays between syncs
- Reduce sync frequency
- Check Notion API usage limits

### Debug Commands

```bash
# Test manual sync
curl -X POST http://localhost:3000/api/admin/clients/sync \
  -H "Content-Type: application/json" \
  -d '{"type": "incremental", "hoursBack": 1}'

# Check webhook endpoint
curl http://localhost:3000/api/webhooks/notion/health

# View recent sync activity
curl http://localhost:3000/api/admin/clients/status
```

## Performance Considerations

### Sync Efficiency

- **Incremental syncs** only process changed clients
- **Rate limiting** prevents API quota exhaustion
- **Background processing** doesn't block other operations
- **Error handling** ensures failed syncs don't affect others

### Database Impact

- **Upsert operations** prevent duplicate clients
- **Indexed queries** for efficient lookups
- **Batch processing** for multiple clients
- **Connection pooling** for database efficiency

## Security

### Webhook Security

- **Signature verification** prevents unauthorized requests
- **Timestamp validation** prevents replay attacks
- **Error logging** for security monitoring
- **Rate limiting** prevents abuse

### API Security

- **Authentication** required for admin endpoints
- **Input validation** prevents injection attacks
- **Error sanitization** prevents information leakage
- **Logging** for audit trails

## Next Steps

After setting up automatic sync:

1. **Monitor the logs** to ensure syncs are working
2. **Test webhook functionality** by making changes in Notion
3. **Set up alerts** for sync failures
4. **Customize sync schedule** based on your needs
5. **Add additional monitoring** as needed

The automatic sync system will keep your client data up-to-date with minimal manual intervention! 