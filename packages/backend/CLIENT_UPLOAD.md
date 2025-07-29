# Client Upload from Notion

This document explains how to upload client accounts from your Notion database to Supabase.

## Overview

The system can automatically fetch all client accounts from your Notion database and upload them to the Supabase `clients` table. This creates the foundation for multi-tenant functionality in your Asera LLM system.

## Prerequisites

1. **Notion API Key**: Make sure you have a valid Notion API key set in your environment variables
2. **Supabase Credentials**: Ensure your Supabase URL and service key are configured
3. **Database Schema**: The Supabase database should have the `clients` table created (see `database/schema.sql`)

## Database Setup

If you have an existing database, run the migration to add the new columns:

```sql
-- Run this in your Supabase SQL editor
\i database/migration_add_client_columns.sql
```

Or manually add the columns:

```sql
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS products_services TEXT,
ADD COLUMN IF NOT EXISTS client_page_info TEXT;
```

## Environment Variables

Make sure these are set in your `.env` file:

```bash
NOTION_API_KEY=your_notion_api_key_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_KEY=your_supabase_service_key_here
```

## How to Upload Clients

### Option 1: Using the Script (Recommended)

Run the upload script directly:

```bash
cd packages/backend
npm run upload-clients
```

This will:
1. Fetch all clients from your Notion database
2. Generate unique slugs for each client
3. Upload them to Supabase
4. Display a list of all uploaded clients

### Option 2: Using the API Endpoint

Make a POST request to the admin endpoint:

```bash
curl -X POST http://localhost:3000/api/admin/clients/upload-from-notion
```

This triggers the upload in the background and returns immediately.

## What Gets Uploaded

For each client in your Notion database, the system creates a record with:

- **ID**: A new UUID generated for Supabase
- **Name**: The client name extracted from Notion
- **Slug**: A URL-friendly version of the client name
- **Contact Email**: Email address extracted from Notion properties
- **Products/Services**: Products or services information from Notion
- **Client Page Info**: Full content extracted from the client's Notion page
- **Settings**: JSON object containing:
  - `notion_page_id`: Original Notion page ID
  - `notion_properties`: All Notion properties
  - `created_from_notion`: Flag indicating source
  - `created_at`: Timestamp

## Expected Results

You should see output like:

```
Uploaded Clients:
1. Client Name 1 (client-name-1)
   Email: client1@example.com
   Products/Services: AI Consulting, Web Development
   Page Info: This client specializes in artificial intelligence solutions...

2. Client Name 2 (client-name-2)
   Email: client2@example.com
   Products/Services: Marketing, Branding
   Page Info: A marketing agency focused on digital transformation...

...
26. Client Name 26 (client-name-26)
   Email: client26@example.com
   Products/Services: Legal Services
   Page Info: Law firm specializing in technology law...
```

## Troubleshooting

### Common Issues

1. **"No clients found"**: 
   - Check that your Notion API key has access to the database
   - Verify the database ID is correct
   - Ensure the database contains pages with title properties

2. **"Database connection error"**:
   - Verify Supabase credentials are correct
   - Check that the `clients` table exists in your database

3. **"Permission denied"**:
   - Ensure your Notion API key has read access to the database
   - Check that your Supabase service key has write permissions

### Logs

Check the application logs for detailed information about the upload process:

```bash
tail -f packages/backend/logs/combined.log
```

## After Upload

Once clients are uploaded, you can:

1. **View all clients** in your Supabase dashboard
2. **Use client IDs** in your application for multi-tenant functionality
3. **Set up client-specific configurations** using the `settings` JSON field
4. **Create users** for each client using the client IDs

## Database Schema

The uploaded clients will be stored in the `clients` table with this structure:

```sql
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    contact_email VARCHAR(255),
    products_services TEXT,
    client_page_info TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Next Steps

After uploading clients, consider:

1. Creating admin users for each client
2. Setting up client-specific Notion integrations
3. Configuring Slack channels for each client
4. Testing the multi-tenant functionality 