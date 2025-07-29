import * as cron from 'node-cron';
import { notionService } from './notion';
import { clientSyncService } from './clientSync';
import { logger } from '../utils/logger';

export interface SyncStats {
  lastFullSync: Date | null;
  lastIncrementalSync: Date | null;
  totalSyncs: number;
  failedSyncs: number;
  documentsProcessed: number;
  errors: string[];
}

export class SyncScheduler {
  private tasks: cron.ScheduledTask[] = [];
  private stats: SyncStats = {
    lastFullSync: null,
    lastIncrementalSync: null,
    totalSyncs: 0,
    failedSyncs: 0,
    documentsProcessed: 0,
    errors: [],
  };

  // Configuration for your Notion databases
  private readonly notionDatabases = [
    {
      id: process.env.NOTION_MEETING_NOTES_DB_ID || '',
      type: 'notion_meeting_notes' as const,
      name: 'Meeting Notes',
    },
    {
      id: process.env.NOTION_CLIENT_PAGES_DB_ID || '',
      type: 'notion_client_page' as const,
      name: 'Client Pages',
    },
    {
      id: process.env.NOTION_WEBSITE_OUTLINE_DB_ID || '',
      type: 'notion_website_outline' as const,
      name: 'Website Outline',
    },
  ];

  // Client database configuration
  private readonly clientDatabaseId = '20f9a8eee622805ea2ecd18f3d424818';

  start(): void {
    logger.info('Starting enhanced sync scheduler with smart scheduling...');

    // Business hours incremental sync (every 30 minutes, Mon-Fri, 9 AM - 6 PM)
    const businessHoursSync = cron.schedule('*/30 9-18 * * 1-5', async () => {
      await this.performIncrementalSync();
    }, {
      scheduled: false,
      timezone: 'America/New_York', // Adjust to your timezone
    });

    // Client sync (every 2 hours during business hours)
    const clientSync = cron.schedule('0 */2 9-18 * * 1-5', async () => {
      await this.performClientSync();
    }, {
      scheduled: false,
      timezone: 'America/New_York',
    });

    // Evening sync (6 PM, Mon-Fri) - more thorough
    const eveningSync = cron.schedule('0 18 * * 1-5', async () => {
      await this.performIncrementalSync(2); // Last 2 hours
    }, {
      scheduled: false,
      timezone: 'America/New_York',
    });

    // Daily full sync (2 AM every day)
    const dailyFullSync = cron.schedule('0 2 * * *', async () => {
      await this.performFullSync();
    }, {
      scheduled: false,
      timezone: 'America/New_York',
    });

    // Weekly cleanup (Sunday 3 AM)
    const weeklyCleanup = cron.schedule('0 3 * * 0', async () => {
      await this.performWeeklyMaintenance();
    }, {
      scheduled: false,
      timezone: 'America/New_York',
    });

    // Start all tasks
    businessHoursSync.start();
    clientSync.start();
    eveningSync.start();
    dailyFullSync.start();
    weeklyCleanup.start();

    this.tasks.push(businessHoursSync, clientSync, eveningSync, dailyFullSync, weeklyCleanup);
    
          logger.info('Enhanced sync scheduler started with multiple sync strategies:', {
        businessHoursSync: 'Every 30min, Mon-Fri 9AM-6PM',
        clientSync: 'Every 2hrs, Mon-Fri 9AM-6PM',
        eveningSync: 'Daily 6PM Mon-Fri',
        dailyFullSync: 'Daily 2AM',
        weeklyCleanup: 'Sunday 3AM',
        timezone: 'America/New_York',
        databasesConfigured: this.notionDatabases.filter(db => db.id).length,
      });

    // Perform initial sync if no recent sync exists
    if (!this.stats.lastFullSync) {
      setTimeout(() => {
        this.performIncrementalSync().catch(error => {
          logger.error('Initial sync failed:', { error });
        });
      }, 5000); // Wait 5 seconds after startup
    }
  }

  /**
   * Perform incremental sync (only recent changes)
   */
  private async performIncrementalSync(hoursBack: number = 1): Promise<void> {
    const syncStartTime = Date.now();
    
    try {
      logger.info('Starting incremental sync...', { hoursBack });
      
      const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      let totalDocuments = 0;
      const errors: string[] = [];

      for (const database of this.notionDatabases) {
        if (!database.id) {
          logger.warn(`Skipping ${database.name} - no database ID configured`);
          continue;
        }

        try {
          logger.info(`Syncing ${database.name} (${database.type})...`, {
            databaseId: database.id,
            since: sinceDate.toISOString(),
          });

          await notionService.syncUpdatedPages(database.id, database.type, sinceDate);
          totalDocuments++; // This would be actual document count in a real implementation
          
          logger.info(`Successfully synced ${database.name}`);
        } catch (dbError) {
          const errorMsg = `Failed to sync ${database.name}: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`;
          errors.push(errorMsg);
          logger.error(errorMsg, { 
            databaseId: database.id, 
            type: database.type,
            error: dbError 
          });
        }
      }

      // Update stats
      this.stats.lastIncrementalSync = new Date();
      this.stats.totalSyncs++;
      this.stats.documentsProcessed += totalDocuments;
      
      if (errors.length > 0) {
        this.stats.failedSyncs++;
        this.stats.errors.push(...errors.slice(0, 5)); // Keep last 5 errors
        this.stats.errors = this.stats.errors.slice(-10); // Keep only last 10 errors total
      }

      const syncDuration = Date.now() - syncStartTime;
      
      logger.info('Incremental sync completed', {
        duration: syncDuration,
        documentsProcessed: totalDocuments,
        errors: errors.length,
        successRate: `${((this.stats.totalSyncs - this.stats.failedSyncs) / this.stats.totalSyncs * 100).toFixed(1)}%`,
      });

    } catch (error) {
      this.stats.failedSyncs++;
      this.stats.errors.push(`Incremental sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      logger.error('Incremental sync failed:', { 
        error, 
        duration: Date.now() - syncStartTime 
      });
    }
  }

  /**
   * Perform full sync (all documents)
   */
  private async performFullSync(): Promise<void> {
    const syncStartTime = Date.now();
    
    try {
      logger.info('Starting full sync of all databases...');
      
      let totalDocuments = 0;
      const errors: string[] = [];

      for (const database of this.notionDatabases) {
        if (!database.id) {
          logger.warn(`Skipping ${database.name} - no database ID configured`);
          continue;
        }

        try {
          logger.info(`Full sync of ${database.name} (${database.type})...`, {
            databaseId: database.id,
          });

          await notionService.syncNotionDatabase(database.id, database.type);
          totalDocuments++; // This would be actual document count in a real implementation
          
          logger.info(`Successfully completed full sync of ${database.name}`);
          
          // Small delay between databases to avoid rate limiting
          await this.delay(2000);
          
        } catch (dbError) {
          const errorMsg = `Failed to sync ${database.name}: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`;
          errors.push(errorMsg);
          logger.error(errorMsg, { 
            databaseId: database.id, 
            type: database.type,
            error: dbError 
          });
        }
      }

      // Update stats
      this.stats.lastFullSync = new Date();
      this.stats.totalSyncs++;
      this.stats.documentsProcessed += totalDocuments;
      
      if (errors.length > 0) {
        this.stats.failedSyncs++;
        this.stats.errors.push(...errors.slice(0, 5));
        this.stats.errors = this.stats.errors.slice(-10);
      }

      const syncDuration = Date.now() - syncStartTime;
      
      logger.info('Full sync completed', {
        duration: syncDuration,
        documentsProcessed: totalDocuments,
        errors: errors.length,
        totalSyncs: this.stats.totalSyncs,
        successRate: `${((this.stats.totalSyncs - this.stats.failedSyncs) / this.stats.totalSyncs * 100).toFixed(1)}%`,
      });

    } catch (error) {
      this.stats.failedSyncs++;
      this.stats.errors.push(`Full sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      logger.error('Full sync failed:', { 
        error, 
        duration: Date.now() - syncStartTime 
      });
    }
  }

  /**
   * Perform client synchronization
   */
  private async performClientSync(): Promise<void> {
    const syncStartTime = Date.now();
    
    try {
      logger.info('Starting client sync...');
      
      // Sync updated clients (last 2 hours)
      const sinceDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = await clientSyncService.syncUpdatedClients(sinceDate);
      
      if (result.success) {
        logger.info('Client sync completed successfully:', result.stats);
      } else {
        logger.error('Client sync failed:', result.stats);
        this.stats.failedSyncs++;
      }

      const syncDuration = Date.now() - syncStartTime;
      logger.info('Client sync completed', {
        duration: syncDuration,
        stats: result.stats,
      });

    } catch (error) {
      this.stats.failedSyncs++;
      logger.error('Client sync failed:', { 
        error, 
        duration: Date.now() - syncStartTime 
      });
    }
  }

  /**
   * Perform weekly maintenance tasks
   */
  private async performWeeklyMaintenance(): Promise<void> {
    try {
      logger.info('Starting weekly maintenance...');

      // Clear old error logs
      this.stats.errors = this.stats.errors.slice(-5);

      // Log weekly stats
      logger.info('Weekly sync statistics:', {
        totalSyncs: this.stats.totalSyncs,
        failedSyncs: this.stats.failedSyncs,
        successRate: this.stats.totalSyncs > 0 
          ? `${((this.stats.totalSyncs - this.stats.failedSyncs) / this.stats.totalSyncs * 100).toFixed(1)}%`
          : '0%',
        documentsProcessed: this.stats.documentsProcessed,
        lastFullSync: this.stats.lastFullSync?.toISOString(),
        lastIncrementalSync: this.stats.lastIncrementalSync?.toISOString(),
      });

      // TODO: Add cleanup tasks like:
      // - Remove old document versions
      // - Optimize embeddings storage
      // - Cleanup analytics data
      
      logger.info('Weekly maintenance completed');
      
    } catch (error) {
      logger.error('Weekly maintenance failed:', { error });
    }
  }

  /**
   * Manual sync trigger
   */
  async triggerManualSync(type: 'incremental' | 'full' = 'incremental'): Promise<{
    success: boolean;
    message: string;
    stats: SyncStats;
  }> {
    try {
      logger.info('Manual sync triggered:', { type });
      
      if (type === 'full') {
        await this.performFullSync();
      } else {
        await this.performIncrementalSync();
      }

      return {
        success: true,
        message: `${type} sync completed successfully`,
        stats: this.getStats(),
      };
    } catch (error) {
      logger.error('Manual sync failed:', { error, type });
      return {
        success: false,
        message: `${type} sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: this.getStats(),
      };
    }
  }

  /**
   * Get current sync statistics
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Check if sync is healthy
   */
  isHealthy(): boolean {
    const now = new Date();
    const lastSync = this.stats.lastIncrementalSync || this.stats.lastFullSync;
    
    if (!lastSync) {
      return false; // No sync has ever run
    }

    // Consider unhealthy if no sync in last 2 hours during business hours
    const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
    const isBusinessHours = now.getHours() >= 9 && now.getHours() <= 18;
    
    if (isBusinessHours && hoursSinceLastSync > 2) {
      return false;
    }

    // Consider unhealthy if more than 25% of syncs are failing
    const failureRate = this.stats.totalSyncs > 0 
      ? (this.stats.failedSyncs / this.stats.totalSyncs) 
      : 0;
    
    return failureRate < 0.25;
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    logger.info('Enhanced sync scheduler stopped');
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const syncScheduler = new SyncScheduler(); 