#!/bin/bash

# Notion Webhook Setup Script
# This script helps you set up webhooks for real-time client sync

echo "🚀 Setting up Notion Webhooks for Real-Time Client Sync"
echo "======================================================"
echo ""

# Check if required tools are installed
echo "📋 Checking prerequisites..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed. Please install it first:"
    echo "   brew install ngrok  # macOS"
    echo "   # or download from https://ngrok.com/"
    exit 1
else
    echo "✅ ngrok is installed"
fi

# Check if environment variables are set
echo ""
echo "🔧 Checking environment variables..."

if [ -z "$NOTION_API_KEY" ]; then
    echo "❌ NOTION_API_KEY is not set"
    echo "   Please add it to your .env file"
    exit 1
else
    echo "✅ NOTION_API_KEY is set"
fi

if [ -z "$SUPABASE_URL" ]; then
    echo "❌ SUPABASE_URL is not set"
    echo "   Please add it to your .env file"
    exit 1
else
    echo "✅ SUPABASE_URL is set"
fi

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_KEY is not set"
    echo "   Please add it to your .env file"
    exit 1
else
    echo "✅ SUPABASE_SERVICE_KEY is set"
fi

echo ""
echo "🎯 Setup Instructions:"
echo "====================="
echo ""
echo "1. 📝 Start your backend server:"
echo "   cd packages/backend"
echo "   npm run dev"
echo ""
echo "2. 🌐 Expose your local server with ngrok:"
echo "   ngrok http 3000"
echo ""
echo "3. 🔗 Copy the HTTPS URL from ngrok (e.g., https://abc123.ngrok.io)"
echo ""
echo "4. 🔧 Create webhook in Notion:"
echo "   - Go to https://www.notion.so/my-integrations"
echo "   - Click on your integration"
echo "   - Scroll to 'Webhooks' section"
echo "   - Click 'Add webhook'"
echo "   - Webhook URL: https://your-ngrok-url.ngrok.io/api/webhooks/notion"
echo "   - Events: page.updated, page.created"
echo "   - Database: Select your client database"
echo "   - Copy the webhook secret"
echo ""
echo "5. 🔐 Add webhook secret to .env:"
echo "   NOTION_WEBHOOK_SECRET=your_webhook_secret_here"
echo ""
echo "6. ✅ Test the setup:"
echo "   npm run test-webhook"
echo ""
echo "7. 🔍 Monitor webhooks:"
echo "   tail -f logs/combined.log | grep webhook"
echo ""

echo "📚 For detailed instructions, see: WEBHOOK_SETUP.md"
echo ""
echo "🎉 Happy syncing!" 