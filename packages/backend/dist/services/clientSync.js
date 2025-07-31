"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientSyncService = exports.ClientSyncService = void 0;
const client_1 = require("@notionhq/client");
const supabase_js_1 = require("@supabase/supabase-js");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
// Initialize Notion client
const notion = new client_1.Client({
    auth: process.env.NOTION_API_KEY
});
// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
class ClientSyncService {
    constructor() {
        this.databaseId = '20f9a8ee-e622-805e-a2ec-d18f3d424818';
        this.syncInProgress = false;
    }
    static getInstance() {
        if (!ClientSyncService.instance) {
            ClientSyncService.instance = new ClientSyncService();
        }
        return ClientSyncService.instance;
    }
    /**
     * Extract client name from Notion page properties
     */
    extractClientName(properties) {
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'title' && value.title) {
                return value.title.map((text) => text.plain_text || '').join('');
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'rich_text' && value.rich_text) {
                const text = value.rich_text.map((text) => text.plain_text || '').join('');
                if (text.trim())
                    return text.trim();
            }
        }
        return 'Unknown Client';
    }
    /**
     * Extract contact email from Notion page properties
     */
    extractContactEmail(properties) {
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'email' && value.email) {
                return value.email;
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'rich_text' && value.rich_text) {
                const text = value.rich_text.map((text) => text.plain_text || '').join('');
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch)
                    return emailMatch[0];
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'url' && value.url) {
                const url = value.url;
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
    extractProductsServices(properties) {
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'multi_select' && value.multi_select) {
                return value.multi_select.map((item) => item.name).join(', ');
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'select' && value.select) {
                return value.select.name;
            }
        }
        for (const [key, value] of Object.entries(properties)) {
            if (value.type === 'rich_text' && value.rich_text) {
                const text = value.rich_text.map((text) => text.plain_text || '').join('');
                if (text.trim())
                    return text.trim();
            }
        }
        return '';
    }
    /**
     * Extract content from a Notion page
     */
    async extractPageContent(pageId) {
        try {
            const blocks = await notion.blocks.children.list({
                block_id: pageId,
                page_size: 100,
            });
            let content = '';
            for (const block of blocks.results) {
                content += this.blockToText(block) + '\n';
            }
            return content.trim();
        }
        catch (error) {
            logger_1.logger.error('Error extracting page content:', { error, pageId });
            return '';
        }
    }
    /**
     * Convert a Notion block to text
     */
    blockToText(block) {
        if (!block.type)
            return '';
        const type = block.type;
        const blockData = block[type];
        if (!blockData)
            return '';
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
    richTextToPlainText(richText) {
        return richText.map(text => text.plain_text || '').join('');
    }
    /**
     * Generate a slug from client name
     */
    generateSlug(name) {
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
     * CRITICAL: Only uses JSON field since notion_page_id column doesn't exist in schema
     */
    async getExistingClient(notionPageId) {
        try {
            logger_1.logger.info('Looking up client by notion_page_id:', { notionPageId });
            // Search in JSON settings field (the ONLY place this data exists)
            // Use ->> for text extraction instead of -> for JSON extraction
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('settings->>notion_page_id', notionPageId)
                .order('created_at', { ascending: true }); // Get oldest first
            if (!error && data && data.length > 0) {
                // If multiple clients have the same notion_page_id (duplicates), use the oldest one
                const primaryClient = data[0];
                if (data.length > 1) {
                    logger_1.logger.warn('Multiple clients found with same notion_page_id - using oldest:', {
                        notionPageId,
                        totalFound: data.length,
                        primaryClientId: primaryClient.id,
                        primaryClientName: primaryClient.name,
                        duplicateIds: data.slice(1).map(c => ({ id: c.id, name: c.name }))
                    });
                }
                else {
                    logger_1.logger.info('Found existing client by JSON notion_page_id:', {
                        clientId: primaryClient.id,
                        notionPageId
                    });
                }
                return primaryClient;
            }
            logger_1.logger.info('No existing client found for notion_page_id:', { notionPageId });
            return null;
        }
        catch (error) {
            logger_1.logger.error('Error fetching existing client:', { error, notionPageId });
            return null;
        }
    }
    /**
     * Calculate similarity between two names (0-1 scale)
     */
    calculateNameSimilarity(name1, name2) {
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
        const n1 = normalize(name1);
        const n2 = normalize(name2);
        if (n1 === n2)
            return 1;
        if (n1.includes(n2) || n2.includes(n1))
            return 0.9;
        // Simple Levenshtein-like similarity
        const longer = n1.length > n2.length ? n1 : n2;
        const shorter = n1.length > n2.length ? n2 : n1;
        if (longer.length === 0)
            return 1;
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }
    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }
        return matrix[str2.length][str1.length];
    }
    /**
     * Find ANY existing client that matches this Notion data - comprehensive search
     */
    async findAnyMatchingClient(notionPageId, name, contactEmail) {
        logger_1.logger.info('Comprehensive client search:', { notionPageId, name, contactEmail });
        // 1. Primary: Check by notion_page_id
        let existingClient = await this.getExistingClient(notionPageId);
        if (existingClient) {
            logger_1.logger.info('Found client by notion_page_id:', { clientId: existingClient.id, name: existingClient.name });
            return existingClient;
        }
        // 2. Secondary: Check by exact name match
        const { data: exactNameMatch, error: nameError } = await supabase
            .from('clients')
            .select('*')
            .eq('name', name)
            .single();
        if (!nameError && exactNameMatch) {
            logger_1.logger.info('Found client by exact name match:', { clientId: exactNameMatch.id, name: exactNameMatch.name });
            return exactNameMatch;
        }
        // 3. Tertiary: Check by contact email if available
        if (contactEmail) {
            const { data: emailMatch, error: emailError } = await supabase
                .from('clients')
                .select('*')
                .eq('contact_email', contactEmail)
                .single();
            if (!emailError && emailMatch) {
                logger_1.logger.info('Found client by contact email:', { clientId: emailMatch.id, email: contactEmail });
                return emailMatch;
            }
        }
        // 4. Quaternary: Fuzzy name matching for similar names
        if (name.length > 3) {
            const nameWords = name.toLowerCase().split(' ').filter(word => word.length > 2);
            if (nameWords.length > 0) {
                const { data: similarClients, error: similarError } = await supabase
                    .from('clients')
                    .select('*')
                    .or(nameWords.map(word => `name.ilike.%${word}%`).join(','));
                if (!similarError && similarClients && similarClients.length > 0) {
                    // Find the best match by comparing name similarity
                    const bestMatch = similarClients.reduce((best, current) => {
                        const currentSimilarity = this.calculateNameSimilarity(name, current.name);
                        const bestSimilarity = best ? this.calculateNameSimilarity(name, best.name) : 0;
                        return currentSimilarity > bestSimilarity ? current : best;
                    });
                    // High similarity threshold to prevent false matches
                    if (this.calculateNameSimilarity(name, bestMatch.name) > 0.8) {
                        logger_1.logger.info('Found client by fuzzy name match:', {
                            clientId: bestMatch.id,
                            originalName: bestMatch.name,
                            newName: name,
                            similarity: this.calculateNameSimilarity(name, bestMatch.name)
                        });
                        return bestMatch;
                    }
                }
            }
        }
        // 5. Last resort: Check for clients with same slug pattern
        const potentialSlug = this.generateSlug(name);
        const { data: slugMatches, error: slugError } = await supabase
            .from('clients')
            .select('*')
            .like('slug', `${potentialSlug}%`);
        if (!slugError && slugMatches && slugMatches.length > 0) {
            // Look for exact slug match or base slug (without numbers)
            const exactSlugMatch = slugMatches.find(client => client.slug === potentialSlug);
            if (exactSlugMatch) {
                logger_1.logger.info('Found client by exact slug match:', { clientId: exactSlugMatch.id, slug: exactSlugMatch.slug });
                return exactSlugMatch;
            }
            // Look for base slug match (original without numbers)
            const baseSlugMatch = slugMatches.find(client => client.slug === potentialSlug && !client.slug.match(/-\d+$/));
            if (baseSlugMatch) {
                logger_1.logger.info('Found client by base slug match:', { clientId: baseSlugMatch.id, slug: baseSlugMatch.slug });
                return baseSlugMatch;
            }
        }
        logger_1.logger.info('No existing client found for:', { notionPageId, name, contactEmail });
        return null;
    }
    /**
     * Sync a single client from Notion - AGGRESSIVE duplicate prevention
     */
    async syncClient(notionPageId) {
        try {
            logger_1.logger.info('Starting client sync:', { notionPageId });
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
            // COMPREHENSIVE search for ANY existing client that matches
            const existingClient = await this.findAnyMatchingClient(notionPageId, name, contactEmail);
            // NEVER change the slug if client exists - slug is immutable!
            const slug = existingClient ? existingClient.slug : this.generateSlug(name);
            const clientData = {
                name,
                slug, // This will NEVER change for existing clients
                contact_email: contactEmail,
                products_services: productsServices,
                client_page_info: clientPageInfo,
                settings: {
                    notion_page_id: notionPageId, // Store in JSON settings (the only place it can be stored)
                    notion_properties: page.properties,
                    last_synced_at: new Date().toISOString(),
                    last_edited_time: page.last_edited_time,
                },
                updated_at: new Date().toISOString(),
            };
            if (existingClient) {
                // ALWAYS update existing client - never create new
                logger_1.logger.info('Updating existing client:', {
                    clientId: existingClient.id,
                    originalName: existingClient.name,
                    newName: name,
                    originalSlug: existingClient.slug,
                    keptSlug: slug,
                    notionPageId
                });
                const { data, error } = await supabase
                    .from('clients')
                    .update(clientData)
                    .eq('id', existingClient.id)
                    .select()
                    .single();
                if (error) {
                    logger_1.logger.error('Error updating existing client:', { error, clientId: existingClient.id });
                    return { success: false, action: 'skipped', error: error.message };
                }
                return { success: true, action: 'updated', client: data };
            }
            else {
                // Only create if absolutely no match found
                logger_1.logger.info('Creating new client (no matches found):', { name, slug, notionPageId });
                const { data, error } = await supabase
                    .from('clients')
                    .insert({
                    ...clientData,
                    id: (0, uuid_1.v4)(),
                    created_at: new Date().toISOString(),
                })
                    .select()
                    .single();
                if (error) {
                    logger_1.logger.error('Error creating new client:', { error, name, notionPageId });
                    return { success: false, action: 'skipped', error: error.message };
                }
                return { success: true, action: 'created', client: data };
            }
        }
        catch (error) {
            logger_1.logger.error('Error syncing client:', { error, notionPageId });
            return { success: false, action: 'skipped', error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    /**
     * Sync all clients from Notion database
     */
    async syncAllClients() {
        if (this.syncInProgress) {
            return { success: false, stats: { total: 0, created: 0, updated: 0, skipped: 0, errors: ['Sync already in progress'] } };
        }
        this.syncInProgress = true;
        const stats = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
        try {
            logger_1.logger.info('Starting full client sync from Notion...');
            const response = await notion.databases.query({
                database_id: this.databaseId,
                page_size: 100,
            });
            stats.total = response.results.length;
            logger_1.logger.info(`Found ${stats.total} clients in Notion database`);
            for (const page of response.results) {
                if (page.object === 'page' && 'properties' in page) {
                    const result = await this.syncClient(page.id);
                    if (result.success) {
                        if (result.action === 'created')
                            stats.created++;
                        else if (result.action === 'updated')
                            stats.updated++;
                        else
                            stats.skipped++;
                    }
                    else {
                        stats.skipped++;
                        if (result.error)
                            stats.errors.push(result.error);
                    }
                    // Small delay to avoid rate limiting
                    await this.delay(500);
                }
            }
            logger_1.logger.info('Client sync completed:', stats);
            return { success: true, stats };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            stats.errors.push(errorMsg);
            logger_1.logger.error('Client sync failed:', { error });
            return { success: false, stats };
        }
        finally {
            this.syncInProgress = false;
        }
    }
    /**
     * Sync only updated clients since a specific date
     */
    async syncUpdatedClients(sinceDate) {
        if (this.syncInProgress) {
            return { success: false, stats: { total: 0, created: 0, updated: 0, skipped: 0, errors: ['Sync already in progress'] } };
        }
        this.syncInProgress = true;
        const stats = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
        try {
            logger_1.logger.info('Starting incremental client sync from Notion...', { sinceDate });
            // Query for updated clients using last_edited_time filter
            const filter = {
                timestamp: 'last_edited_time',
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
            logger_1.logger.info(`Found ${stats.total} updated clients in Notion database`);
            // First, sync all updated/new clients
            for (const page of response.results) {
                if (page.object === 'page' && 'properties' in page) {
                    const result = await this.syncClient(page.id);
                    if (result.success) {
                        if (result.action === 'created')
                            stats.created++;
                        else if (result.action === 'updated')
                            stats.updated++;
                        else
                            stats.skipped++;
                    }
                    else {
                        stats.errors.push(result.error || 'Unknown sync error');
                    }
                }
            }
            // Next, check for deletions by comparing existing clients with current Notion pages
            await this.checkForDeletedClients(stats);
            logger_1.logger.info('Incremental client sync completed:', {
                total: stats.total,
                created: stats.created,
                updated: stats.updated,
                skipped: stats.skipped,
                errors: stats.errors.length,
            });
            return { success: true, stats };
        }
        catch (error) {
            logger_1.logger.error('Error in incremental client sync:', { error });
            stats.errors.push(error instanceof Error ? error.message : 'Unknown error');
            return { success: false, stats };
        }
        finally {
            this.syncInProgress = false;
        }
    }
    /**
     * Check for clients that have been deleted from Notion
     */
    async checkForDeletedClients(stats) {
        try {
            // Get all current clients from Supabase that have notion_page_id in settings
            const { data: existingClients, error } = await supabase
                .from('clients')
                .select('id, name, settings')
                .not('settings->notion_page_id', 'is', null);
            if (error) {
                logger_1.logger.error('Error fetching existing clients for deletion check:', { error });
                stats.errors.push(`Deletion check failed: ${error.message}`);
                return;
            }
            if (!existingClients || existingClients.length === 0) {
                logger_1.logger.info('No clients with Notion page IDs found for deletion check');
                return;
            }
            logger_1.logger.info(`Checking ${existingClients.length} clients for deletions from Notion`);
            // Check each client to see if it still exists in Notion
            for (const client of existingClients) {
                const notionPageId = client.settings?.notion_page_id;
                if (!notionPageId)
                    continue;
                try {
                    // Try to retrieve the page from Notion
                    await notion.pages.retrieve({ page_id: notionPageId });
                    // If we get here, page still exists - no action needed
                }
                catch (notionError) {
                    // If page is not found (404), it was deleted
                    if (notionError?.status === 404 || notionError?.code === 'object_not_found') {
                        logger_1.logger.info(`Notion page deleted, removing client: ${client.name}`, {
                            clientId: client.id,
                            notionPageId: notionPageId
                        });
                        // Delete the client from Supabase
                        const { error: deleteError } = await supabase
                            .from('clients')
                            .delete()
                            .eq('id', client.id);
                        if (deleteError) {
                            logger_1.logger.error('Error deleting client:', { error: deleteError, clientId: client.id });
                            stats.errors.push(`Failed to delete client ${client.name}: ${deleteError.message}`);
                        }
                        else {
                            logger_1.logger.info(`Successfully deleted client: ${client.name}`, { clientId: client.id });
                            // You might want to add a 'deleted' counter to stats in the future
                        }
                    }
                    else {
                        // Some other error (rate limit, network, etc.)
                        logger_1.logger.warn('Error checking Notion page, skipping deletion check:', {
                            error: notionError,
                            clientId: client.id,
                            notionPageId: notionPageId
                        });
                    }
                }
                // Small delay to avoid rate limiting
                await this.delay(200);
            }
        }
        catch (error) {
            logger_1.logger.error('Error in deletion check:', { error });
            stats.errors.push(`Deletion check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Delete a client from Supabase when deleted in Notion
     */
    async deleteClient(notionPageId) {
        try {
            logger_1.logger.info('Attempting to delete client:', { notionPageId });
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
                                logger_1.logger.info('Found client by slug for deletion:', { clientId: slugData.id, name, slug });
                            }
                        }
                    }
                }
                catch (notionError) {
                    logger_1.logger.info('Could not retrieve page from Notion, client may have been deleted:', { notionPageId, notionError });
                }
            }
            if (!existingClient) {
                logger_1.logger.info('Client not found for deletion, may have been already deleted:', { notionPageId });
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
                logger_1.logger.error('Error deleting client from database:', { error, clientId, clientName });
                return { success: false, error: error.message };
            }
            logger_1.logger.info('Client deleted successfully:', { clientId, clientName, notionPageId });
            return { success: true, clientName };
        }
        catch (error) {
            logger_1.logger.error('Error in deleteClient:', { error, notionPageId });
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    /**
     * Handle Notion webhook for real-time updates
     */
    async handleWebhook(webhookData) {
        try {
            logger_1.logger.info('Processing Notion webhook:', { webhookData });
            const { type, entity, page, data } = webhookData;
            let pageId;
            let databaseId;
            // Handle ping webhooks (Notion's health check)
            if (type === 'ping') {
                logger_1.logger.info('Received ping webhook from Notion');
                return { success: true, message: 'Ping received and acknowledged' };
            }
            // Extract page ID and database ID based on webhook type
            if (type === 'page.deleted') {
                pageId = entity?.id;
                databaseId = data?.parent?.id;
            }
            else if (type === 'page.updated' || type === 'page.created') {
                pageId = page?.id;
                databaseId = page?.parent?.database_id;
            }
            else if (type === 'page.properties_updated') {
                pageId = entity?.id;
                databaseId = data?.parent?.id;
            }
            else if (type === 'page.content_updated') {
                pageId = entity?.id;
                databaseId = data?.parent?.id;
            }
            // Enhanced debugging for property updates specifically
            if (type === 'page.properties_updated') {
                logger_1.logger.info('Property update webhook received:', {
                    type,
                    pageId,
                    databaseId,
                    hasUpdatedProperties: !!(data?.updated_properties),
                    updatedPropertiesCount: data?.updated_properties?.length || 0,
                    updatedProperties: data?.updated_properties,
                    entityId: entity?.id,
                    parentType: data?.parent?.type,
                    parentId: data?.parent?.id
                });
            }
            // Log successful page ID extraction for all webhook types
            logger_1.logger.info('Webhook page ID extracted successfully:', {
                type,
                pageId,
                databaseId,
                extractionMethod: type === 'page.properties_updated' || type === 'page.content_updated' || type === 'page.deleted' ? 'entity.id' : 'page.id'
            });
            if (!pageId) {
                logger_1.logger.error('Webhook page ID extraction failed:', {
                    type,
                    hasEntity: !!entity,
                    hasPage: !!page,
                    hasData: !!data,
                    entityId: entity?.id,
                    pageId: page?.id,
                    webhookStructure: {
                        entityType: entity?.type,
                        dataKeys: data ? Object.keys(data) : [],
                        parentType: data?.parent?.type
                    }
                });
                return { success: false, message: `Invalid webhook: no page ID found for type ${type}` };
            }
            // Validate that this webhook is from the clients database
            if (databaseId && databaseId !== this.databaseId) {
                logger_1.logger.info('Webhook ignored: not from clients database', {
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
                        const parent = pageInfo.parent;
                        if (parent.type === 'database_id') {
                            databaseId = parent.database_id;
                        }
                    }
                }
                catch (error) {
                    logger_1.logger.warn('Could not verify page database, proceeding with caution:', { error, pageId });
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
                    }
                    else {
                        return { success: false, message: result.error || 'Failed to sync client' };
                    }
                case 'page.created':
                    const createResult = await this.syncClient(pageId);
                    if (createResult.success) {
                        return {
                            success: true,
                            message: `Client created: ${createResult.client?.name || 'Unknown'}`
                        };
                    }
                    else {
                        return { success: false, message: createResult.error || 'Failed to create client' };
                    }
                case 'page.deleted':
                    const deleteResult = await this.deleteClient(pageId);
                    if (deleteResult.success) {
                        return {
                            success: true,
                            message: `Client deleted: ${deleteResult.clientName || 'Unknown'}`
                        };
                    }
                    else {
                        return { success: false, message: deleteResult.error || 'Failed to delete client' };
                    }
                default:
                    return { success: true, message: 'Webhook processed (no action needed)' };
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing webhook:', { error, webhookData });
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
    /**
     * Simple delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ClientSyncService = ClientSyncService;
exports.clientSyncService = ClientSyncService.getInstance();
