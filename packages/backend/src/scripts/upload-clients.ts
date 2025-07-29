import { Client } from '@notionhq/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Initialize Notion client
const notion = new Client({ 
  auth: process.env.NOTION_API_KEY 
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

interface NotionClient {
  id: string;
  name: string;
  properties: Record<string, any>;
  contactEmail?: string;
  productsServices?: string;
  clientPageInfo?: string;
}

interface ClientToUpload {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  productsServices: string;
  clientPageInfo: string;
  settings: Record<string, any>;
}

/**
 * Extract client name from Notion page properties
 */
function extractClientName(properties: Record<string, any>): string {
  // Look for title property (usually 'Name' or 'Title')
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'title' && (value as any).title) {
      return (value as any).title.map((text: any) => text.plain_text || '').join('');
    }
  }
  
  // Fallback: look for any property that might contain the name
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'rich_text' && (value as any).rich_text) {
      const text = (value as any).rich_text.map((text: any) => text.plain_text || '').join('');
      if (text.trim()) return text.trim();
    }
  }
  
  return 'Unknown Client';
}

/**
 * Extract contact email from Notion page properties
 */
function extractContactEmail(properties: Record<string, any>): string {
  // Look for email property
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'email' && (value as any).email) {
      return (value as any).email;
    }
  }
  
  // Look for rich text that might contain email
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'rich_text' && (value as any).rich_text) {
      const text = (value as any).rich_text.map((text: any) => text.plain_text || '').join('');
      // Check if text contains email pattern
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) return emailMatch[0];
    }
  }
  
  // Look for URL property that might be email
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'url' && (value as any).url) {
      const url = (value as any).url;
      if (url.startsWith('mailto:')) {
        return url.replace('mailto:', '');
      }
    }
  }
  
  return '';
}

/**
 * Extract products/services from Notion page properties
 */
function extractProductsServices(properties: Record<string, any>): string {
  // Look for multi-select property
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'multi_select' && (value as any).multi_select) {
      return (value as any).multi_select.map((item: any) => item.name).join(', ');
    }
  }
  
  // Look for select property
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'select' && (value as any).select) {
      return (value as any).select.name;
    }
  }
  
  // Look for rich text that might contain products/services
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'rich_text' && (value as any).rich_text) {
      const text = (value as any).rich_text.map((text: any) => text.plain_text || '').join('');
      if (text.trim()) return text.trim();
    }
  }
  
  return '';
}

/**
 * Extract content from a Notion page
 */
async function extractPageContent(pageId: string): Promise<string> {
  try {
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });

    let content = '';
    for (const block of blocks.results) {
      content += blockToText(block as any) + '\n';
    }

    return content.trim();
  } catch (error) {
    logger.error('Error extracting page content:', { error, pageId });
    return '';
  }
}

/**
 * Convert a Notion block to text
 */
function blockToText(block: any): string {
  if (!block.type) return '';

  const type = block.type;
  const blockData = block[type];

  if (!blockData) return '';

  // Handle different block types
  switch (type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'bulleted_list_item':
    case 'numbered_list_item':
      return richTextToPlainText(blockData.rich_text || []);
    
    case 'code':
      return blockData.rich_text ? richTextToPlainText(blockData.rich_text) : '';
    
    case 'quote':
      return `"${richTextToPlainText(blockData.rich_text || [])}"`;
    
    default:
      return '';
  }
}

/**
 * Convert Notion rich text to plain text
 */
function richTextToPlainText(richText: any[]): string {
  return richText.map(text => text.plain_text || '').join('');
}

/**
 * Generate a slug from client name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim()
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Fetch all clients from the Notion database
 */
async function fetchClientsFromNotion(databaseId: string): Promise<NotionClient[]> {
  try {
    logger.info('Fetching clients from Notion database:', { databaseId });
    
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
    });

    const clients: NotionClient[] = [];
    
    for (const page of response.results) {
      if (page.object === 'page' && 'properties' in page) {
        const name = extractClientName(page.properties);
        if (name && name !== 'Unknown Client') {
          const contactEmail = extractContactEmail(page.properties);
          const productsServices = extractProductsServices(page.properties);
          
          // Extract content from the client page
          const clientPageInfo = await extractPageContent(page.id);
          
          clients.push({
            id: page.id,
            name,
            properties: page.properties,
            contactEmail,
            productsServices,
            clientPageInfo,
          });
        }
      }
    }

    logger.info('Fetched clients from Notion:', { count: clients.length });
    return clients;
  } catch (error) {
    logger.error('Error fetching clients from Notion:', { error, databaseId });
    throw error;
  }
}

/**
 * Upload clients to Supabase
 */
async function uploadClientsToSupabase(clients: ClientToUpload[]): Promise<void> {
  try {
    logger.info('Uploading clients to Supabase:', { count: clients.length });
    
    for (const client of clients) {
      const { error } = await supabase
        .from('clients')
        .upsert({
          id: client.id,
          name: client.name,
          slug: client.slug,
          contact_email: client.contactEmail,
          products_services: client.productsServices,
          client_page_info: client.clientPageInfo,
          settings: client.settings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) {
        logger.error('Error uploading client:', { error, client: client.name });
        throw error;
      }

      logger.info('Uploaded client:', { 
        name: client.name, 
        slug: client.slug,
        hasEmail: !!client.contactEmail,
        hasProducts: !!client.productsServices,
        hasPageInfo: !!client.clientPageInfo
      });
    }

    logger.info('Successfully uploaded all clients to Supabase');
  } catch (error) {
    logger.error('Error uploading clients to Supabase:', { error });
    throw error;
  }
}

/**
 * Main function to sync clients from Notion to Supabase
 */
async function syncClientsFromNotion(): Promise<void> {
  try {
    // The database ID from your Notion URL
    const databaseId = '20f9a8eee622805ea2ecd18f3d424818';
    
    logger.info('Starting client sync from Notion to Supabase');
    
    // Fetch clients from Notion
    const notionClients = await fetchClientsFromNotion(databaseId);
    
    if (notionClients.length === 0) {
      logger.warn('No clients found in Notion database');
      return;
    }
    
    // Transform to Supabase format
    const clientsToUpload: ClientToUpload[] = notionClients.map(client => {
      const slug = generateSlug(client.name);
      
      return {
        id: uuidv4(), // Generate new UUID for Supabase
        name: client.name,
        slug,
        contactEmail: client.contactEmail || '',
        productsServices: client.productsServices || '',
        clientPageInfo: client.clientPageInfo || '',
        settings: {
          notion_page_id: client.id,
          notion_properties: client.properties,
          created_from_notion: true,
          created_at: new Date().toISOString(),
        },
      };
    });
    
    // Upload to Supabase
    await uploadClientsToSupabase(clientsToUpload);
    
    logger.info('Client sync completed successfully', { 
      totalClients: clientsToUpload.length 
    });
    
    // Log all uploaded clients with additional info
    console.log('\nUploaded Clients:');
    clientsToUpload.forEach((client, index) => {
      console.log(`${index + 1}. ${client.name} (${client.slug})`);
      if (client.contactEmail) {
        console.log(`   Email: ${client.contactEmail}`);
      }
      if (client.productsServices) {
        console.log(`   Products/Services: ${client.productsServices}`);
      }
      if (client.clientPageInfo) {
        console.log(`   Page Info: ${client.clientPageInfo.substring(0, 100)}...`);
      }
      console.log('');
    });
    
  } catch (error) {
    logger.error('Client sync failed:', { error });
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  syncClientsFromNotion()
    .then(() => {
      console.log('Client sync completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Client sync failed:', error);
      process.exit(1);
    });
}

export { syncClientsFromNotion }; 