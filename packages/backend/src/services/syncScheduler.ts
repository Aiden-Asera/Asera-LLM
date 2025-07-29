import cron from 'node-cron';
import { notionService } from './notion';
import { ragService } from './rag';
import { logger } from '../utils/logger';

export class SyncScheduler {
  private static instance: SyncScheduler;
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  public static getInstance(): SyncScheduler {
    if (!SyncScheduler.instance) {
      SyncScheduler.instance = new SyncScheduler();
    }
    return SyncScheduler.instance;
  }

  private constructor() {}

  /**
   * Start all scheduled sync tasks
   */
  start(): void {
    logger.info('Starting sync scheduler...');

    // Daily sync at 2 AM
    this.scheduleDailySync();

    // Hourly check for urgent updates (optional)
    this.scheduleHourlyCheck();

    logger.info('Sync scheduler started successfully');
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    logger.info('Stopping sync scheduler...');
    
    this.tasks.forEach((task, name) => {
      task.stop();
      logger.info('Stopped task:', { taskName: name });
    });
    
    this.tasks.clear();
    logger.info('Sync scheduler stopped');
  }

  /**
   * Schedule daily comprehensive sync
   */
  private scheduleDailySync(): void {
    const task = cron.schedule('0 2 * * *', async () => {
      logger.info('Starting daily comprehensive sync...');
      
      try {
        await this.runComprehensiveSync();
        logger.info('Daily comprehensive sync completed successfully');
      } catch (error) {
        logger.error('Daily comprehensive sync failed:', { error });
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York' // Adjust to your timezone
    });

    this.tasks.set('daily-sync', task);
    task.start();
    
    logger.info('Daily sync scheduled for 2:00 AM EST');
  }

  /**
   * Schedule hourly check for recent updates
   */
  private scheduleHourlyCheck(): void {
    const task = cron.schedule('0 * * * *', async () => {
      logger.info('Starting hourly update check...');
      
      try {
        await this.runIncrementalSync();
        logger.info('Hourly update check completed');
      } catch (error) {
        logger.error('Hourly update check failed:', { error });
      }
    }, {
      scheduled: false
    });

    this.tasks.set('hourly-check', task);
    task.start();
    
    logger.info('Hourly update check scheduled');
  }

  /**
   * Run comprehensive sync of all data sources
   */
  async runComprehensiveSync(): Promise<void> {
    const startTime = Date.now();
    logger.info('=== COMPREHENSIVE SYNC STARTED ===');

    try {
      // Sync all Notion databases
      await notionService.syncAllDatabases();

      // TODO: Add Slack sync when implemented
      // await slackService.syncAllChannels();

      logger.info('=== COMPREHENSIVE SYNC COMPLETED ===', {
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('=== COMPREHENSIVE SYNC FAILED ===', {
        error,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Run incremental sync for recent updates only
   */
  async runIncrementalSync(): Promise<void> {
    const startTime = Date.now();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    logger.info('=== INCREMENTAL SYNC STARTED ===', {
      sinceDate: oneHourAgo.toISOString()
    });

    try {
      // Check for updated Notion pages in the last hour
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
            await notionService.syncUpdatedPages(db.id, db.type, oneHourAgo);
          } catch (error) {
            logger.error('Failed to sync updated pages:', { 
              error, 
              databaseId: db.id,
              type: db.type 
            });
          }
        }
      }

      logger.info('=== INCREMENTAL SYNC COMPLETED ===', {
        duration: Date.now() - startTime
      });

    } catch (error) {
      logger.error('=== INCREMENTAL SYNC FAILED ===', {
        error,
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Manually trigger a sync (for testing or admin use)
   */
  async triggerManualSync(type: 'comprehensive' | 'incremental' = 'comprehensive'): Promise<void> {
    logger.info('Manual sync triggered:', { type });

    try {
      if (type === 'comprehensive') {
        await this.runComprehensiveSync();
      } else {
        await this.runIncrementalSync();
      }
      
      logger.info('Manual sync completed successfully:', { type });
    } catch (error) {
      logger.error('Manual sync failed:', { error, type });
      throw error;
    }
  }

  /**
   * Get sync status and statistics
   */
  getSyncStatus(): {
    isRunning: boolean;
    scheduledTasks: string[];
    lastRun?: Date;
    nextRun?: Date;
  } {
    const taskNames = Array.from(this.tasks.keys());
    const dailyTask = this.tasks.get('daily-sync');
    
    return {
      isRunning: this.tasks.size > 0,
      scheduledTasks: taskNames,
      lastRun: undefined, // Would track this with a database
      nextRun: dailyTask ? new Date() : undefined, // Simplified for now
    };
  }

  /**
   * Schedule a one-time sync for a specific time
   */
  scheduleOneTimeSync(
    scheduledTime: Date,
    type: 'comprehensive' | 'incremental' = 'comprehensive'
  ): void {
    const taskName = `one-time-${Date.now()}`;
    
    const cronExpression = this.dateToCronExpression(scheduledTime);
    
    const task = cron.schedule(cronExpression, async () => {
      logger.info('One-time sync triggered:', { type, scheduledTime });
      
      try {
        if (type === 'comprehensive') {
          await this.runComprehensiveSync();
        } else {
          await this.runIncrementalSync();
        }
        
        // Remove the task after execution
        this.tasks.delete(taskName);
        task.stop();
        
      } catch (error) {
        logger.error('One-time sync failed:', { error, type });
      }
    }, {
      scheduled: false
    });

    this.tasks.set(taskName, task);
    task.start();
    
    logger.info('One-time sync scheduled:', { 
      taskName, 
      type, 
      scheduledTime: scheduledTime.toISOString() 
    });
  }

  /**
   * Convert a Date to cron expression
   */
  private dateToCronExpression(date: Date): string {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    
    return `${minute} ${hour} ${day} ${month} *`;
  }
}

export const syncScheduler = SyncScheduler.getInstance(); 