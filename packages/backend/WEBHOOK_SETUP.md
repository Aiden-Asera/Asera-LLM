# Notion Webhook Setup Guide

This guide will walk you through setting up real-time webhooks so that changes in your Notion client database are immediately reflected in your Supabase database.

## 🎯 What We're Building

- **Real-time sync** between Notion and Supabase
- **Automatic updates** when clients are modified
- **Secure webhook handling** with signature verification
- **Comprehensive logging** for monitoring

## 📋 Prerequisites

1. ✅ Notion API key
2. ✅ Supabase credentials configured
3. ✅ Backend server running
4. ✅ Public URL for your webhook endpoint

## 🚀 Step-by-Step Setup

### Step 1: Verify Your Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Find your integration (or create one if needed)
3. Make sure it has these capabilities:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content

### Step 2: Share Your Database

1. Go to your client database: [https://www.notion.so/20f9a8eee622805ea2ecd18f3d424818](https://www.notion.so/20f9a8eee622805ea2ecd18f3d424818)
2. Click **"Share"** in the top right
3. Click **"Invite"**
4. Search for your integration name
5. Select it and give it **"Can edit"** permissions
6. Click **"Invite"**

### Step 3: Make Your Webhook Publicly Accessible

#### Option A: Development with ngrok

```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/

# Start your backend
cd packages/backend
npm run dev

# In another terminal, expose your local server
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

#### Option B: Production Deployment

Deploy to a cloud service:

**Railway:**
```bash
npm install -g @railway/cli
railway login
railway up
```

**Heroku:**
```bash
heroku create your-app-name
git push herooku main
```

**Vercel:**
```bash
npm install -g vercel
vercel --prod
```

### Step 4: Create the Webhook in Notion

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click on your integration
3. Scroll to **"Webhooks"** section
4. Click **"Add webhook"**
5. Fill in the details:

   **Webhook URL:**
   ```
   https://your-domain.com/api/webhooks/notion
   ```
   
   **Events:**
   - ✅ `page.updated`
   - ✅ `page.created`
   
   **Database:**
   - Select your client database

6. Click **"Submit"**
7. **Copy the webhook secret** (you'll need this!)

### Step 5: Configure Environment Variables

Add to your `.env` file:

```bash
# Add this line to your .env file
NOTION_WEBHOOK_SECRET=your_webhook_secret_here
```

### Step 6: Test the Setup

#### Test 1: Check Webhook Health

```bash
curl http://localhost:3000/api/webhooks/notion/health
```

Expected response:
```json
{
  "success": true,
  "message": "Notion webhook endpoint is healthy",
  "config": {
    "hasWebhookSecret": true,
    "hasNotionApiKey": true,
    "hasSupabaseConfig": true
  }
}
```

#### Test 2: Run Webhook Tests

```bash
cd packages/backend
npm run test-webhook
```

#### Test 3: Test Real Webhook

1. Make a change in your Notion client database
2. Check the logs:
   ```bash
   tail -f packages/backend/logs/combined.log | grep webhook
   ```

You should see logs like:
```
INFO: Received Notion webhook: { type: "page.updated", pageId: "abc123", timestamp: "..." }
INFO: Webhook processed successfully: { message: "Client updated: Client Name" }
```

## 🔧 Troubleshooting

### Issue 1: Webhook Not Receiving Requests

**Symptoms:**
- No webhook logs appearing
- Changes in Notion not reflected

**Solutions:**
1. **Check webhook URL:**
   ```bash
   curl -X POST https://your-domain.com/api/webhooks/notion \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

2. **Verify ngrok is running:**
   ```bash
   # Check ngrok status
   curl http://localhost:4040/api/tunnels
   ```

3. **Check Notion webhook status:**
   - Go to your integration settings
   - Check if webhook shows as "Active"

### Issue 2: Signature Verification Failing

**Symptoms:**
- 401 errors in logs
- "Invalid signature" messages

**Solutions:**
1. **Verify webhook secret:**
   ```bash
   # Check if secret is set
   echo $NOTION_WEBHOOK_SECRET
   ```

2. **Test signature verification:**
   ```bash
   npm run test-webhook
   ```

### Issue 3: Database Errors

**Symptoms:**
- 500 errors in logs
- "Database connection error" messages

**Solutions:**
1. **Check Supabase credentials:**
   ```bash
   curl http://localhost:3000/api/webhooks/notion/health
   ```

2. **Verify database schema:**
   ```sql
   -- Run this in Supabase SQL editor
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'clients';
   ```

## 📊 Monitoring Your Webhooks

### Check Webhook Status

```bash
# Get webhook health
curl http://localhost:3000/api/webhooks/notion/health

# Get client sync status
curl http://localhost:3000/api/admin/clients/status

# Get overall sync status
curl http://localhost:3000/api/admin/sync/status
```

### Monitor Logs

```bash
# Watch webhook activity
tail -f packages/backend/logs/combined.log | grep -E "(webhook|client)"

# Watch for errors
tail -f packages/backend/logs/error.log
```

### Key Log Messages to Look For

**Successful webhook:**
```
INFO: Received Notion webhook: { type: "page.updated", pageId: "abc123" }
INFO: Webhook processed successfully: { message: "Client updated: Client Name" }
```

**Error webhook:**
```
ERROR: Error processing webhook: { error: "Database connection failed" }
WARN: Invalid webhook signature, rejecting request
```

## 🎉 Success Indicators

Your webhook is working correctly when:

1. ✅ **Health check passes:**
   ```bash
   curl http://localhost:3000/api/webhooks/notion/health
   ```

2. ✅ **Changes in Notion appear in logs within seconds**

3. ✅ **Supabase database updates automatically**

4. ✅ **No signature verification errors**

5. ✅ **Client sync status shows recent activity**

## 🔄 Testing the Full Flow

1. **Make a change in Notion:**
   - Edit a client name
   - Add an email address
   - Update products/services

2. **Check the logs:**
   ```bash
   tail -f packages/backend/logs/combined.log
   ```

3. **Verify in Supabase:**
   ```bash
   curl http://localhost:3000/api/admin/clients/status
   ```

4. **Check the database directly:**
   - Go to your Supabase dashboard
   - Check the `clients` table
   - Verify the changes are there

## 🚨 Security Considerations

1. **Keep your webhook secret secure**
2. **Use HTTPS in production**
3. **Monitor for unusual webhook activity**
4. **Rotate webhook secrets periodically**

## 📞 Need Help?

If you're having issues:

1. **Check the logs first:**
   ```bash
   tail -f packages/backend/logs/combined.log
   ```

2. **Run the health checks:**
   ```bash
   curl http://localhost:3000/api/webhooks/notion/health
   ```

3. **Test manually:**
   ```bash
   npm run test-webhook
   ```

4. **Verify your setup:**
   - Notion integration permissions
   - Database sharing
   - Environment variables
   - Public URL accessibility

Your webhook should now be working for real-time updates! 🎉 