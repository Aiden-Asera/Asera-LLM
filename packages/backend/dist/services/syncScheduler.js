"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncScheduler = exports.SyncScheduler = void 0;
const cron = __importStar(require("node-cron"));
const notion_1 = require("./notion");
const clientSync_1 = require("./clientSync");
const logger_1 = require("../utils/logger");
class SyncScheduler {
    constructor() {
        this.tasks = [];
        this.stats = {
            lastFullSync: null,
            lastIncrementalSync: null,
            totalSyncs: 0,
            failedSyncs: 0,
            documentsProcessed: 0,
            errors: [],
        };
        // Configuration for your Notion databases
        this.notionDatabases = [
            {
                id: process.env.NOTION_MEETING_NOTES_DB_ID || '',
                type: 'notion_meeting_notes',
                name: 'Meeting Notes',
            },
            {
                id: process.env.NOTION_CLIENT_PAGES_DB_ID || '',
                type: 'notion_client_page',
                name: 'Client Pages',
            },
            {
                id: process.env.NOTION_WEBSITE_OUTLINE_DB_ID || '',
                type: 'notion_website_outline',
                name: 'Website Outline',
            },
        ];
        // Client database configuration
        this.clientDatabaseId = '20f9a8eee622805ea2ecd18f3d424818';
    }
    start() {
        logger_1.logger.info('Starting enhanced sync scheduler with smart scheduling...');
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
        logger_1.logger.info('Enhanced sync scheduler started with multiple sync strategies:', {
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
                    logger_1.logger.error('Initial sync failed:', { error });
                });
            }, 5000); // Wait 5 seconds after startup
        }
    }
    /**
     * Perform incremental sync (only recent changes)
     */
    async performIncrementalSync(hoursBack = 1) {
        const syncStartTime = Date.now();
        try {
            logger_1.logger.info('Starting incremental sync...', { hoursBack });
            const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
            let totalDocuments = 0;
            const errors = [];
            for (const database of this.notionDatabases) {
                if (!database.id) {
                    logger_1.logger.warn(`Skipping ${database.name} - no database ID configured`);
                    continue;
                }
                try {
                    logger_1.logger.info(`Syncing ${database.name} (${database.type})...`, {
                        databaseId: database.id,
                        since: sinceDate.toISOString(),
                    });
                    await notion_1.notionService.syncUpdatedPages(database.id, database.type, sinceDate);
                    totalDocuments++; // This would be actual document count in a real implementation
                    logger_1.logger.info(`Successfully synced ${database.name}`);
                }
                catch (dbError) {
                    const errorMsg = `Failed to sync ${database.name}: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    logger_1.logger.error(errorMsg, {
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
            logger_1.logger.info('Incremental sync completed', {
                duration: syncDuration,
                documentsProcessed: totalDocuments,
                errors: errors.length,
                successRate: `${((this.stats.totalSyncs - this.stats.failedSyncs) / this.stats.totalSyncs * 100).toFixed(1)}%`,
            });
        }
        catch (error) {
            this.stats.failedSyncs++;
            this.stats.errors.push(`Incremental sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            logger_1.logger.error('Incremental sync failed:', {
                error,
                duration: Date.now() - syncStartTime
            });
        }
    }
    /**
     * Perform full sync (all documents)
     */
    async performFullSync() {
        const syncStartTime = Date.now();
        try {
            logger_1.logger.info('Starting full sync of all databases...');
            let totalDocuments = 0;
            const errors = [];
            for (const database of this.notionDatabases) {
                if (!database.id) {
                    logger_1.logger.warn(`Skipping ${database.name} - no database ID configured`);
                    continue;
                }
                try {
                    logger_1.logger.info(`Full sync of ${database.name} (${database.type})...`, {
                        databaseId: database.id,
                    });
                    await notion_1.notionService.syncNotionDatabase(database.id, database.type);
                    totalDocuments++; // This would be actual document count in a real implementation
                    logger_1.logger.info(`Successfully completed full sync of ${database.name}`);
                    // Small delay between databases to avoid rate limiting
                    await this.delay(2000);
                }
                catch (dbError) {
                    const errorMsg = `Failed to sync ${database.name}: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    logger_1.logger.error(errorMsg, {
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
            logger_1.logger.info('Full sync completed', {
                duration: syncDuration,
                documentsProcessed: totalDocuments,
                errors: errors.length,
                totalSyncs: this.stats.totalSyncs,
                successRate: `${((this.stats.totalSyncs - this.stats.failedSyncs) / this.stats.totalSyncs * 100).toFixed(1)}%`,
            });
        }
        catch (error) {
            this.stats.failedSyncs++;
            this.stats.errors.push(`Full sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            logger_1.logger.error('Full sync failed:', {
                error,
                duration: Date.now() - syncStartTime
            });
        }
    }
    /**
     * Perform client synchronization
     */
    async performClientSync() {
        const syncStartTime = Date.now();
        try {
            logger_1.logger.info('Starting client sync...');
            // Sync updated clients (last 2 hours)
            const sinceDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const result = await clientSync_1.clientSyncService.syncUpdatedClients(sinceDate);
            if (result.success) {
                logger_1.logger.info('Client sync completed successfully:', result.stats);
            }
            else {
                logger_1.logger.error('Client sync failed:', result.stats);
                this.stats.failedSyncs++;
            }
            const syncDuration = Date.now() - syncStartTime;
            logger_1.logger.info('Client sync completed', {
                duration: syncDuration,
                stats: result.stats,
            });
        }
        catch (error) {
            this.stats.failedSyncs++;
            logger_1.logger.error('Client sync failed:', {
                error,
                duration: Date.now() - syncStartTime
            });
        }
    }
    /**
     * Perform weekly maintenance tasks
     */
    async performWeeklyMaintenance() {
        try {
            logger_1.logger.info('Starting weekly maintenance...');
            // Clear old error logs
            this.stats.errors = this.stats.errors.slice(-5);
            // Log weekly stats
            logger_1.logger.info('Weekly sync statistics:', {
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
            logger_1.logger.info('Weekly maintenance completed');
        }
        catch (error) {
            logger_1.logger.error('Weekly maintenance failed:', { error });
        }
    }
    /**
     * Manual sync trigger
     */
    async triggerManualSync(type = 'incremental') {
        try {
            logger_1.logger.info('Manual sync triggered:', { type });
            if (type === 'full') {
                await this.performFullSync();
            }
            else {
                await this.performIncrementalSync();
            }
            return {
                success: true,
                message: `${type} sync completed successfully`,
                stats: this.getStats(),
            };
        }
        catch (error) {
            logger_1.logger.error('Manual sync failed:', { error, type });
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
    getStats() {
        return { ...this.stats };
    }
    /**
     * Check if sync is healthy
     */
    isHealthy() {
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
    stop() {
        this.tasks.forEach(task => task.stop());
        this.tasks = [];
        logger_1.logger.info('Enhanced sync scheduler stopped');
    }
    /**
     * Simple delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.SyncScheduler = SyncScheduler;
exports.syncScheduler = new SyncScheduler();
