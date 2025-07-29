import { Client } from '@notionhq/client';
import { logger } from '../utils/logger';
import { ClientDatabase } from '../utils/database';
import { ragService } from './rag';
import { v4 as uuidv4 } from 'uuid';

if (!process.env.NOTION_API_KEY) {
  logger.warn('NOTION_API_KEY not found - Notion sync will be disabled');
}

const notion = process.env.NOTION_API_KEY 
  ? new Client({ auth: process.env.NOTION_API_KEY })
  : null;

export interface NotionPage {
  id: string;
  title: string;
  content: string;
  lastEditedTime: string;
  properties: Record<string, any>;
  databaseId: string;
}

export interface ClientMapping {
  clientId: string;
  clientName: string;
  notionKeywords: string[]; // Keywords to identify this client in Notion
}

export class NotionService {
  private static instance: NotionService;
  private clientMappings: ClientMapping[] = [];

  public static getInstance(): NotionService {
    if (!NotionService.instance) {
      NotionService.instance = new NotionService();
    }
    return NotionService.instance;
  }

  private constructor() {
    // Initialize client mappings (you can configure these)
    this.clientMappings = [
      {
        clientId: 'htt-client-id',
        clientName: 'HTT',
        notionKeywords: ['HTT', 'Health Tech', 'HealthTech']
      },
      // Add more clients here
    ];
  }

  /**
   * Determine which client this content belongs to based on keywords
   */
  private determineClient(title: string, content: string, properties: any): string {
    const searchText = `${title} ${content} ${JSON.stringify(properties)}`.toLowerCase();
    
    for (const mapping of this.clientMappings) {
      for (const keyword of mapping.notionKeywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          logger.info('Content assigned to client:', { 
            keyword, 
            clientName: mapping.clientName,
            title: title.substring(0, 50) 
          });
          return mapping.clientId;
        }
      }
    }
    
    // Default to Asera master bucket
    logger.info('Content assigned to Asera master bucket:', { 
      title: title.substring(0, 50) 
    });
    return 'asera-master';
  }

  /**
   * Convert Notion blocks to plain text
   */
  private async extractTextFromBlocks(pageId: string): Promise<string> {
    if (!notion) return '';

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
      logger.error('Error extracting text from blocks:', { error, pageId });
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

    // Handle different block types
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
   * Get title from page properties
   */
  private getPageTitle(properties: any): string {
    // Look for title property (usually 'Name' or 'Title')
    for (const [key, value] of Object.entries(properties)) {
      if ((value as any).type === 'title' && (value as any).title) {
        return this.richTextToPlainText((value as any).title);
      }
    }
    return 'Untitled';
  }

  /**
   * Sync pages from a specific Notion database
   */
  async syncNotionDatabase(
    databaseId: string,
    sourceType: 'notion_meeting_notes' | 'notion_client_page' | 'notion_website_outline'
  ): Promise<void> {
    if (!notion) {
      logger.warn('Notion sync attempted but API key not configured');
      return;
    }

    try {
      logger.info('Starting Notion database sync:', { databaseId, sourceType });

      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: 100,
      });

      for (const page of response.results) {
        if (page.object !== 'page') continue;

        try {
          await this.syncNotionPage(page as any, sourceType);
        } catch (error) {
          logger.error('Error syncing individual page:', { 
            error, 
            pageId: page.id,
            sourceType 
          });
        }
      }

      logger.info('Notion database sync completed:', { 
        databaseId, 
        sourceType,
        pagesProcessed: response.results.length 
      });

    } catch (error) {
      logger.error('Error syncing Notion database:', { 
        error, 
        databaseId, 
        sourceType 
      });
      throw error;
    }
  }

  /**
   * Sync a single Notion page
   */
  private async syncNotionPage(
    page: any,
    sourceType: 'notion_meeting_notes' | 'notion_client_page' | 'notion_website_outline'
  ): Promise<void> {
    const title = this.getPageTitle(page.properties);
    const content = await this.extractTextFromBlocks(page.id);
    
    if (!content.trim()) {
      logger.debug('Skipping empty page:', { pageId: page.id, title });
      return;
    }

    // Determine which client this belongs to
    const clientId = this.determineClient(title, content, page.properties);
    
    // Store in appropriate client database
    const clientDb = new ClientDatabase(clientId);
    
    // Generate proper UUID for document ID
    const documentId = uuidv4();
    
    // Use RAG service to process and chunk the document
    await ragService.processDocument(clientDb, {
      id: documentId,
      title,
      content,
      source: sourceType,
      sourceId: page.id,
      metadata: {
        notionUrl: page.url,
        lastEditedTime: page.last_edited_time,
        properties: page.properties,
        databaseId: page.parent.database_id,
        syncedAt: new Date().toISOString(),
        originalNotionId: page.id, // Keep original Notion ID for reference
      },
    });

    logger.info('Notion page synced:', {
      pageId: page.id,
      title: title.substring(0, 50),
      clientId,
      sourceType,
      contentLength: content.length,
    });
  }

  /**
   * Check for pages that have been updated since last sync
   */
  async syncUpdatedPages(
    databaseId: string,
    sourceType: 'notion_meeting_notes' | 'notion_client_page' | 'notion_website_outline',
    sinceDate?: Date
  ): Promise<void> {
    if (!notion) return;

    try {
      const filter = sinceDate ? {
        timestamp: 'last_edited_time' as const,
        last_edited_time: {
          after: sinceDate.toISOString(),
        },
      } : undefined;

      const response = await notion.databases.query({
        database_id: databaseId,
        filter,
        page_size: 100,
      });

      logger.info('Checking for updated pages:', {
        databaseId,
        sourceType,
        sinceDate: sinceDate?.toISOString(),
        foundPages: response.results.length,
      });

      for (const page of response.results) {
        if (page.object === 'page') {
          await this.syncNotionPage(page as any, sourceType);
        }
      }

    } catch (error) {
      logger.error('Error checking for updated pages:', {
        error,
        databaseId,
        sourceType,
      });
    }
  }

  /**
   * Sync all configured Notion databases
   */
  async syncAllDatabases(): Promise<void> {
    // These would be configured in your environment or database
    const databases = [
      {
        id: process.env.NOTION_MEETING_NOTES_DB_ID,
        type: 'notion_meeting_notes' as const,
      },
      {
        id: process.env.NOTION_CLIENT_PAGES_DB_ID,
        type: 'notion_client_page' as const,
      },
      {
        id: process.env.NOTION_WEBSITE_OUTLINES_DB_ID,
        type: 'notion_website_outline' as const,
      },
    ];

    for (const db of databases) {
      if (db.id) {
        try {
          await this.syncNotionDatabase(db.id, db.type);
        } catch (error) {
          logger.error('Failed to sync database:', { 
            error, 
            databaseId: db.id, 
            type: db.type 
          });
        }
      } else {
        logger.warn('Database ID not configured:', { type: db.type });
      }
    }
  }

  /**
   * Add a new client mapping
   */
  addClientMapping(mapping: ClientMapping): void {
    this.clientMappings.push(mapping);
    logger.info('Client mapping added:', { clientName: mapping.clientName });
  }
}

export const notionService = NotionService.getInstance(); 