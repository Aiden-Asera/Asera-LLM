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
  lastEditedTime: string;
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

export class ClientSyncService {
  private static instance: ClientSyncService;
  private readonly databaseId = '20f9a8ee-e622-805e-a2ec-d18f3d424818';
  private syncInProgress = false;

  public static getInstance(): ClientSyncService {
    if (!ClientSyncService.instance) {
      ClientSyncService.instance = new ClientSyncService();
    }
    return ClientSyncService.instance;
  }

  /**
   * Extract client name from Notion page properties
   */
  private extractClientName(properties: Record<string, any>): string {
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'title' && (value as any).title) {
        return (value as any).title.map((text: any) => text.plain_text || '').join('');
      }
    }
    
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
  private extractContactEmail(properties: Record<string, any>): string {
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'email' && (value as any).email) {
        return (value as any).email;
      }
    }
    
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'rich_text' && (value as any).rich_text) {
        const text = (value as any).rich_text.map((text: any) => text.plain_text || '').join('');
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) return emailMatch[0];
      }
    }
    
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
  private extractProductsServices(properties: Record<string, any>): string {
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'multi_select' && (value as any).multi_select) {
        return (value as any).multi_select.map((item: any) => item.name).join(', ');
      }
    }
    
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'select' && (value as any).select) {
        return (value as any).select.name;
      }
    }
    
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
  private async extractPageContent(pageId: string): Promise<string> {
    try {
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
      });

      let content = '';
      for (const block of blocks.results) {
        content += this.blockToText(block as any) + '\n';
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
  private blockToText(block: any): string {
    if (!block.type) return '';

    const type = block.type;
    const blockData = block[type];

    if (!blockData) return '';

    switch (type) {
      case 'paragraph':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'bulleted_list_item':
      case 'numbered_list_item':
        return this.richTextToPlainText(blockData.rich_text || []);
      
      case 'code':
        return blockData.rich_text ? this.richTextToPlainText(blockData.rich_text) : '';
      
      case 'quote':
        return `"${this.richTextToPlainText(blockData.rich_text || [])}"`;
      
      default:
        return '';
    }
  }

  /**
   * Convert Notion rich text to plain text
   */
  private richTextToPlainText(richText: any[]): string {
    return richText.map(text => text.plain_text || '').join('');
  }

  /**
   * Generate a slug from client name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .replace(/^-|-$/g, '');
  }

  /**
   * Get existing client from Supabase by Notion page ID
   */
  private async getExistingClient(notionPageId: string): Promise<any> {
    try {
      // First try to find by exact Notion page ID match
      let { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('settings->notion_page_id', notionPageId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error fetching existing client by notion_page_id:', { error, notionPageId });
        return null;
      }

      if (data) {
        logger.info('Found existing client by notion_page_id:', { clientId: data.id, notionPageId });
        return data;
      }

      // If not found, try to find by slug (fallback for existing clients)
      // This handles the case where clients were uploaded before webhook setup
      logger.info('Client not found by notion_page_id, trying to find by slug...', { notionPageId });
      
      // Get the page from Notion to extract the name
      const page = await notion.pages.retrieve({ page_id: notionPageId });
      if (page.object === 'page' && 'properties' in page) {
        const name = this.extractClientName(page.properties);
        if (name && name !== 'Unknown Client') {
          const slug = this.generateSlug(name);
          
          // Try to find by slug
          const { data: slugData, error: slugError } = await supabase
            .from('clients')
            .select('*')
            .eq('slug', slug)
            .single();

          if (slugError && slugError.code !== 'PGRST116') {
            logger.error('Error fetching existing client by slug:', { error: slugError, slug });
            return null;
          }

          if (slugData) {
            logger.info('Found existing client by slug, updating notion_page_id:', { 
              clientId: slugData.id, 
              slug, 
              notionPageId 
            });
            
            // Update the client with the Notion page ID for future lookups
            await supabase
              .from('clients')
              .update({
                settings: {
                  ...slugData.settings,
                  notion_page_id: notionPageId,
                  last_synced_at: new Date().toISOString(),
                }
              })
              .eq('id', slugData.id);
            
            return slugData;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error in getExistingClient:', { error, notionPageId });
      return null;
    }
  }

  /**
   * Sync a single client from Notion
   */
  async syncClient(notionPageId: string): Promise<{
    success: boolean;
    action: 'created' | 'updated' | 'skipped';
    client?: any;
    error?: string;
  }> {
    try {
      // Get the page from Notion
      const page = await notion.pages.retrieve({ page_id: notionPageId });
      
      if (page.object !== 'page' || !('properties' in page)) {
        return { success: false, action: 'skipped', error: 'Invalid page object' };
      }

      const name = this.extractClientName(page.properties);
      if (!name || name === 'Unknown Client') {
        return { success: false, action: 'skipped', error: 'Could not extract client name' };
      }

      const contactEmail = this.extractContactEmail(page.properties);
      const productsServices = this.extractProductsServices(page.properties);
      const clientPageInfo = await this.extractPageContent(notionPageId);
      const slug = this.generateSlug(name);

      // Check if client already exists
      const existingClient = await this.getExistingClient(notionPageId);
      
      const clientData = {
        name,
        slug,
        contact_email: contactEmail,
        products_services: productsServices,
        client_page_info: clientPageInfo,
        settings: {
          notion_page_id: notionPageId,
          notion_properties: page.properties,
          last_synced_at: new Date().toISOString(),
          last_edited_time: page.last_edited_time,
        },
        updated_at: new Date().toISOString(),
      };

      let result;
      if (existingClient) {
        // Update existing client
        const { data, error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', existingClient.id)
          .select()
          .single();

        if (error) {
          logger.error('Error updating client:', { error, clientId: existingClient.id });
          return { success: false, action: 'skipped', error: error.message };
        }

        result = { success: true, action: 'updated' as const, client: data };
        logger.info('Client updated:', { name, notionPageId, clientId: existingClient.id });
      } else {
        // Check if client with same slug already exists (fallback check)
        const { data: existingBySlug, error: slugError } = await supabase
          .from('clients')
          .select('*')
          .eq('slug', slug)
          .single();

        if (slugError && slugError.code !== 'PGRST116') {
          logger.error('Error checking for existing client by slug:', { error: slugError, slug });
          return { success: false, action: 'skipped', error: slugError.message };
        }

        if (existingBySlug) {
          // Update existing client with Notion page ID
          const { data, error } = await supabase
            .from('clients')
            .update({
              ...clientData,
              settings: {
                ...clientData.settings,
                notion_page_id: notionPageId,
                last_synced_at: new Date().toISOString(),
              }
            })
            .eq('id', existingBySlug.id)
            .select()
            .single();

          if (error) {
            logger.error('Error updating existing client by slug:', { error, clientId: existingBySlug.id });
            return { success: false, action: 'skipped', error: error.message };
          }

          result = { success: true, action: 'updated' as const, client: data };
          logger.info('Client updated (found by slug):', { name, notionPageId, clientId: existingBySlug.id });
        } else {
          // Create new client
          const { data, error } = await supabase
            .from('clients')
            .insert({
              ...clientData,
              id: uuidv4(),
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) {
            logger.error('Error creating client:', { error, name, notionPageId });
            return { success: false, action: 'skipped', error: error.message };
          }

          result = { success: true, action: 'created' as const, client: data };
          logger.info('Client created:', { name, notionPageId, clientId: data.id });
        }
      }

      return result;
    } catch (error) {
      logger.error('Error syncing client:', { error, notionPageId });
      return { success: false, action: 'skipped', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Sync all clients from Notion database
   */
  async syncAllClients(): Promise<{
    success: boolean;
    stats: {
      total: number;
      created: number;
      updated: number;
      skipped: number;
      errors: string[];
    };
  }> {
    if (this.syncInProgress) {
      return { success: false, stats: { total: 0, created: 0, updated: 0, skipped: 0, errors: ['Sync already in progress'] } };
    }

    this.syncInProgress = true;
    const stats = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    try {
      logger.info('Starting full client sync from Notion...');

      const response = await notion.databases.query({
        database_id: this.databaseId,
        page_size: 100,
      });

      stats.total = response.results.length;
      logger.info(`Found ${stats.total} clients in Notion database`);

      for (const page of response.results) {
        if (page.object === 'page' && 'properties' in page) {
          const result = await this.syncClient(page.id);
          
          if (result.success) {
            if (result.action === 'created') stats.created++;
            else if (result.action === 'updated') stats.updated++;
            else stats.skipped++;
          } else {
            stats.skipped++;
            if (result.error) stats.errors.push(result.error);
          }

          // Small delay to avoid rate limiting
          await this.delay(500);
        }
      }

      logger.info('Client sync completed:', stats);
      return { success: true, stats };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      stats.errors.push(errorMsg);
      logger.error('Client sync failed:', { error });
      return { success: false, stats };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync only updated clients since a specific date
   */
  async syncUpdatedClients(sinceDate: Date): Promise<{
    success: boolean;
    stats: {
      total: number;
      created: number;
      updated: number;
      skipped: number;
      errors: string[];
    };
  }> {
    if (this.syncInProgress) {
      return { success: false, stats: { total: 0, created: 0, updated: 0, skipped: 0, errors: ['Sync already in progress'] } };
    }

    this.syncInProgress = true;
    const stats = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    try {
      logger.info('Starting incremental client sync from Notion...', { sinceDate });

      // Query for updated clients using last_edited_time filter
      const filter = {
        timestamp: 'last_edited_time' as const,
        last_edited_time: {
          after: sinceDate.toISOString(),
        },
      };

      const response = await notion.databases.query({
        database_id: this.databaseId,
        filter,
        page_size: 100,
      });

      stats.total = response.results.length;
      logger.info(`Found ${stats.total} updated clients in Notion database`);

      // First, sync all updated/new clients
      for (const page of response.results) {
        if (page.object === 'page' && 'properties' in page) {
          const result = await this.syncClient(page.id);
          
          if (result.success) {
            if (result.action === 'created') stats.created++;
            else if (result.action === 'updated') stats.updated++;
            else stats.skipped++;
          } else {
            stats.errors.push(result.error || 'Unknown sync error');
          }
        }
      }

      // Next, check for deletions by comparing existing clients with current Notion pages
      await this.checkForDeletedClients(stats);

      logger.info('Incremental client sync completed:', {
        total: stats.total,
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        errors: stats.errors.length,
      });

      return { success: true, stats };

    } catch (error) {
      logger.error('Error in incremental client sync:', { error });
      stats.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return { success: false, stats };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Check for clients that have been deleted from Notion
   */
  private async checkForDeletedClients(stats: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  }): Promise<void> {
    try {
      // Get all current clients from Supabase that have notion_page_id in settings
      const { data: existingClients, error } = await supabase
        .from('clients')
        .select('id, name, settings')
        .not('settings->notion_page_id', 'is', null);

      if (error) {
        logger.error('Error fetching existing clients for deletion check:', { error });
        stats.errors.push(`Deletion check failed: ${error.message}`);
        return;
      }

      if (!existingClients || existingClients.length === 0) {
        logger.info('No clients with Notion page IDs found for deletion check');
        return;
      }

      logger.info(`Checking ${existingClients.length} clients for deletions from Notion`);

      // Check each client to see if it still exists in Notion
      for (const client of existingClients) {
        const notionPageId = client.settings?.notion_page_id;
        if (!notionPageId) continue;

        try {
          // Try to retrieve the page from Notion
          await notion.pages.retrieve({ page_id: notionPageId });
          // If we get here, page still exists - no action needed
        } catch (notionError: any) {
          // If page is not found (404), it was deleted
          if (notionError?.status === 404 || notionError?.code === 'object_not_found') {
            logger.info(`Notion page deleted, removing client: ${client.name}`, {
              clientId: client.id,
              notionPageId: notionPageId
            });

            // Delete the client from Supabase
            const { error: deleteError } = await supabase
              .from('clients')
              .delete()
              .eq('id', client.id);

            if (deleteError) {
              logger.error('Error deleting client:', { error: deleteError, clientId: client.id });
              stats.errors.push(`Failed to delete client ${client.name}: ${deleteError.message}`);
            } else {
              logger.info(`Successfully deleted client: ${client.name}`, { clientId: client.id });
              // You might want to add a 'deleted' counter to stats in the future
            }
          } else {
            // Some other error (rate limit, network, etc.)
            logger.warn('Error checking Notion page, skipping deletion check:', {
              error: notionError,
              clientId: client.id,
              notionPageId: notionPageId
            });
          }
        }

        // Small delay to avoid rate limiting
        await this.delay(200);
      }

    } catch (error) {
      logger.error('Error in deletion check:', { error });
      stats.errors.push(`Deletion check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a client from Supabase when deleted in Notion
   */
  async deleteClient(notionPageId: string): Promise<{
    success: boolean;
    clientName?: string;
    error?: string;
  }> {
    try {
      logger.info('Attempting to delete client:', { notionPageId });

      // Try to find the client by Notion page ID first
      let existingClient = await this.getExistingClient(notionPageId);
      
      if (!existingClient) {
        // If not found by Notion page ID, try to get the page from Notion to extract the name
        // This handles the case where the client exists but the Notion page ID wasn't stored properly
        try {
          const page = await notion.pages.retrieve({ page_id: notionPageId });
          if (page.object === 'page' && 'properties' in page) {
            const name = this.extractClientName(page.properties);
            if (name && name !== 'Unknown Client') {
              const slug = this.generateSlug(name);
              
              // Try to find by slug
              const { data: slugData, error: slugError } = await supabase
                .from('clients')
                .select('*')
                .eq('slug', slug)
                .single();

              if (!slugError && slugData) {
                existingClient = slugData;
                logger.info('Found client by slug for deletion:', { clientId: slugData.id, name, slug });
              }
            }
          }
        } catch (notionError) {
          logger.info('Could not retrieve page from Notion, client may have been deleted:', { notionPageId, notionError });
        }
      }
      
      if (!existingClient) {
        logger.info('Client not found for deletion, may have been already deleted:', { notionPageId });
        return { success: true, clientName: 'Unknown' };
      }

      const clientName = existingClient.name;
      const clientId = existingClient.id;

      // Delete the client from Supabase
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) {
        logger.error('Error deleting client from database:', { error, clientId, clientName });
        return { success: false, error: error.message };
      }

      logger.info('Client deleted successfully:', { clientId, clientName, notionPageId });
      return { success: true, clientName };
    } catch (error) {
      logger.error('Error in deleteClient:', { error, notionPageId });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Handle Notion webhook for real-time updates
   */
  async handleWebhook(webhookData: any): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      logger.info('Processing Notion webhook:', { webhookData });

      const { type, entity, page, data } = webhookData;
      let pageId: string | undefined;
      let databaseId: string | undefined;

      // Extract page ID and database ID based on webhook type
      if (type === 'page.deleted') {
        pageId = entity?.id;
        databaseId = data?.parent?.id;
      } else if (type === 'page.updated' || type === 'page.created') {
        pageId = page?.id;
        databaseId = page?.parent?.database_id;
      } else if (type === 'page.properties_updated') {
        pageId = entity?.id;
        databaseId = data?.parent?.id;
      } else if (type === 'page.content_updated') {
        pageId = entity?.id;
        databaseId = data?.parent?.id;
      }

      if (!pageId) {
        return { success: false, message: 'Invalid webhook: no page ID found' };
      }

      // Validate that this webhook is from the clients database
      if (databaseId && databaseId !== this.databaseId) {
        logger.info('Webhook ignored: not from clients database', { 
          receivedDatabaseId: databaseId, 
          expectedDatabaseId: this.databaseId,
          pageId,
          type 
        });
        return { 
          success: true, 
          message: `Webhook ignored: page not from clients database (${databaseId})` 
        };
      }

      // If we don't have the database ID in the webhook, we need to verify it by fetching the page
      if (!databaseId) {
        try {
          const pageInfo = await notion.pages.retrieve({ page_id: pageId });
          if (pageInfo.object === 'page' && 'parent' in pageInfo && pageInfo.parent && typeof pageInfo.parent === 'object') {
            const parent = pageInfo.parent as any;
            if (parent.type === 'database_id') {
              databaseId = parent.database_id;
            }
          }
        } catch (error) {
          logger.warn('Could not verify page database, proceeding with caution:', { error, pageId });
        }
      }

      // Handle different webhook types
      switch (type) {
        case 'page.updated':
        case 'page.content_updated':
        case 'page.properties_updated':
          const result = await this.syncClient(pageId);
          if (result.success) {
            const action = result.action === 'created' ? 'created' : 'updated';
            return {
              success: true,
              message: `Client ${action}: ${result.client?.name || 'Unknown'}`
            };
          } else {
            return { success: false, message: result.error || 'Failed to sync client' };
          }

        case 'page.created':
          const createResult = await this.syncClient(pageId);
          if (createResult.success) {
            return {
              success: true,
              message: `Client created: ${createResult.client?.name || 'Unknown'}`
            };
          } else {
            return { success: false, message: createResult.error || 'Failed to create client' };
          }

        case 'page.deleted':
          const deleteResult = await this.deleteClient(pageId);
          if (deleteResult.success) {
            return {
              success: true,
              message: `Client deleted: ${deleteResult.clientName || 'Unknown'}`
            };
          } else {
            return { success: false, message: deleteResult.error || 'Failed to delete client' };
          }

        default:
          return { success: true, message: 'Webhook processed (no action needed)' };
      }
    } catch (error) {
      logger.error('Error processing webhook:', { error, webhookData });
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const clientSyncService = ClientSyncService.getInstance(); 