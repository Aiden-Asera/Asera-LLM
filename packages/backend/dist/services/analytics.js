"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsService = exports.AnalyticsService = void 0;
const logger_1 = require("../utils/logger");
class AnalyticsService {
    static getInstance() {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }
    constructor() {
        this.searchHistory = [];
        this.MAX_HISTORY = 1000; // Keep last 1000 searches in memory
    }
    /**
     * Track a search query
     */
    async trackSearch(analytics) {
        try {
            logger_1.logger.info('Tracking search analytics:', {
                query: analytics.query.substring(0, 50) + '...',
                resultsFound: analytics.resultsFound,
                responseTime: analytics.responseTime,
                clientId: analytics.clientId,
                embeddingUsed: analytics.embeddingUsed,
            });
            // Add to in-memory history
            this.searchHistory.push(analytics);
            // Keep only recent searches
            if (this.searchHistory.length > this.MAX_HISTORY) {
                this.searchHistory.shift();
            }
            // TODO: In production, you'd want to store this in a dedicated analytics table
            // For now, we'll keep it in memory and provide real-time insights
        }
        catch (error) {
            logger_1.logger.error('Error tracking search:', { error });
        }
    }
    /**
     * Get popular search queries
     */
    async getPopularQueries(clientId, limit = 10) {
        try {
            // Filter by client and group by query
            const clientSearches = this.searchHistory.filter(s => s.clientId === clientId);
            if (clientSearches.length === 0) {
                // Return some default popular queries if no history
                return [
                    { query: 'What is Asera?', count: 1, avgResponseTime: 500, avgResultsFound: 3, lastUsed: new Date() },
                    { query: 'Asera team members', count: 1, avgResponseTime: 450, avgResultsFound: 2, lastUsed: new Date() },
                    { query: 'business goals', count: 1, avgResponseTime: 600, avgResultsFound: 4, lastUsed: new Date() },
                ];
            }
            // Group searches by normalized query
            const queryStats = new Map();
            clientSearches.forEach(search => {
                const normalizedQuery = this.normalizeQuery(search.query);
                if (queryStats.has(normalizedQuery)) {
                    const stats = queryStats.get(normalizedQuery);
                    stats.count += 1;
                    stats.avgResponseTime = (stats.avgResponseTime + search.responseTime) / 2;
                    stats.avgResultsFound = (stats.avgResultsFound + search.resultsFound) / 2;
                    if (search.timestamp > stats.lastUsed) {
                        stats.lastUsed = search.timestamp;
                    }
                }
                else {
                    queryStats.set(normalizedQuery, {
                        query: search.query, // Keep original formatting
                        count: 1,
                        avgResponseTime: search.responseTime,
                        avgResultsFound: search.resultsFound,
                        lastUsed: search.timestamp,
                    });
                }
            });
            // Sort by popularity (count) and return top results
            return Array.from(queryStats.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        }
        catch (error) {
            logger_1.logger.error('Error getting popular queries:', { error });
            return [];
        }
    }
    /**
     * Get search performance metrics
     */
    async getSearchMetrics(clientId) {
        try {
            const clientSearches = this.searchHistory.filter(s => s.clientId === clientId);
            if (clientSearches.length === 0) {
                return {
                    totalSearches: 0,
                    avgResponseTime: 0,
                    avgResultsPerQuery: 0,
                    successRate: 0,
                    recentSearches: [],
                    topPerformingQueries: [],
                };
            }
            const totalSearches = clientSearches.length;
            const avgResponseTime = clientSearches.reduce((sum, s) => sum + s.responseTime, 0) / totalSearches;
            const avgResultsPerQuery = clientSearches.reduce((sum, s) => sum + s.resultsFound, 0) / totalSearches;
            const successfulSearches = clientSearches.filter(s => s.resultsFound > 0).length;
            const successRate = (successfulSearches / totalSearches) * 100;
            // Get recent searches (last 10)
            const recentSearches = clientSearches
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, 10);
            // Get top performing queries (those with good results and fast response)
            const popularQueries = await this.getPopularQueries(clientId, 20);
            const topPerformingQueries = popularQueries
                .filter(q => q.avgResultsFound > 0)
                .sort((a, b) => (b.avgResultsFound / b.avgResponseTime) - (a.avgResultsFound / a.avgResponseTime))
                .slice(0, 5);
            return {
                totalSearches,
                avgResponseTime: Math.round(avgResponseTime),
                avgResultsPerQuery: Math.round(avgResultsPerQuery * 10) / 10,
                successRate: Math.round(successRate * 10) / 10,
                recentSearches,
                topPerformingQueries,
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting search metrics:', { error });
            throw error;
        }
    }
    /**
     * Get trending queries (queries with increasing frequency)
     */
    async getTrendingQueries(clientId, limit = 5) {
        try {
            const clientSearches = this.searchHistory.filter(s => s.clientId === clientId);
            // Get queries from last 24 hours vs previous 24 hours
            const now = new Date();
            const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const previous24h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
            const recent = clientSearches.filter(s => s.timestamp >= last24h);
            const previous = clientSearches.filter(s => s.timestamp >= previous24h && s.timestamp < last24h);
            // Count query frequency
            const recentCounts = this.countQueries(recent);
            const previousCounts = this.countQueries(previous);
            // Calculate trending score
            const trending = [];
            recentCounts.forEach((count, query) => {
                const previousCount = previousCounts.get(query) || 0;
                const trendScore = count - previousCount;
                if (trendScore > 0) { // Only include increasing queries
                    const recentSearches = recent.filter(s => this.normalizeQuery(s.query) === query);
                    const avgResponseTime = recentSearches.reduce((sum, s) => sum + s.responseTime, 0) / recentSearches.length;
                    const avgResultsFound = recentSearches.reduce((sum, s) => sum + s.resultsFound, 0) / recentSearches.length;
                    trending.push({
                        query: recentSearches[0].query,
                        count,
                        avgResponseTime,
                        avgResultsFound,
                        lastUsed: new Date(Math.max(...recentSearches.map(s => s.timestamp.getTime()))),
                        trendScore,
                    });
                }
            });
            return trending
                .sort((a, b) => b.trendScore - a.trendScore)
                .slice(0, limit);
        }
        catch (error) {
            logger_1.logger.error('Error getting trending queries:', { error });
            return [];
        }
    }
    /**
     * Normalize query for grouping similar searches
     */
    normalizeQuery(query) {
        return query
            .toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' '); // Normalize whitespace
    }
    /**
     * Count query occurrences
     */
    countQueries(searches) {
        const counts = new Map();
        searches.forEach(search => {
            const normalized = this.normalizeQuery(search.query);
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
        return counts;
    }
    /**
     * Clear old analytics data (useful for maintenance)
     */
    clearOldData(olderThanDays = 30) {
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        this.searchHistory = this.searchHistory.filter(s => s.timestamp >= cutoff);
        logger_1.logger.info('Cleared old analytics data:', {
            cutoffDate: cutoff,
            remainingEntries: this.searchHistory.length,
        });
    }
}
exports.AnalyticsService = AnalyticsService;
exports.analyticsService = AnalyticsService.getInstance();
