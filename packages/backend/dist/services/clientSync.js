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
     */
    async getExistingClient(notionPageId) {
        try {
            // First try to find by exact Notion page ID match
            let { data, error } = await supabase
                .from('clients')
                .select('*')
                .eq('settings->notion_page_id', notionPageId)
                .single();
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                logger_1.logger.error('Error fetching existing client by notion_page_id:', { error, notionPageId });
                return null;
            }
            if (data) {
                logger_1.logger.info('Found existing client by notion_page_id:', { clientId: data.id, notionPageId });
                return data;
            }
            // If not found, try to find by slug (fallback for existing clients)
            // This handles the case where clients were uploaded before webhook setup
            logger_1.logger.info('Client not found by notion_page_id, trying to find by slug...', { notionPageId });
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
                        logger_1.logger.error('Error fetching existing client by slug:', { error: slugError, slug });
                        return null;
                    }
                    if (slugData) {
                        logger_1.logger.info('Found existing client by slug, updating notion_page_id:', {
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
        }
        catch (error) {
            logger_1.logger.error('Error in getExistingClient:', { error, notionPageId });
            return null;
        }
    }
    /**
     * Sync a single client from Notion
     */
    async syncClient(notionPageId) {
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
                    logger_1.logger.error('Error updating client:', { error, clientId: existingClient.id });
                    return { success: false, action: 'skipped', error: error.message };
                }
                result = { success: true, action: 'updated', client: data };
                logger_1.logger.info('Client updated:', { name, notionPageId, clientId: existingClient.id });
            }
            else {
                // Check if client with same slug already exists (fallback check)
                const { data: existingBySlug, error: slugError } = await supabase
                    .from('clients')
                    .select('*')
                    .eq('slug', slug)
                    .single();
                if (slugError && slugError.code !== 'PGRST116') {
                    logger_1.logger.error('Error checking for existing client by slug:', { error: slugError, slug });
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
                        logger_1.logger.error('Error updating existing client by slug:', { error, clientId: existingBySlug.id });
                        return { success: false, action: 'skipped', error: error.message };
                    }
                    result = { success: true, action: 'updated', client: data };
                    logger_1.logger.info('Client updated (found by slug):', { name, notionPageId, clientId: existingBySlug.id });
                }
                else {
                    // Create new client
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
                        logger_1.logger.error('Error creating client:', { error, name, notionPageId });
                        return { success: false, action: 'skipped', error: error.message };
                    }
                    result = { success: true, action: 'created', client: data };
                    logger_1.logger.info('Client created:', { name, notionPageId, clientId: data.id });
                }
            }
            return result;
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
            // Extract page ID and database ID based on webhook type
            if (type === 'page.deleted') {
                pageId = entity?.id;
                databaseId = data?.parent?.id;
            }
            else if (type === 'page.updated' || type === 'page.created') {
                pageId = page?.id;
                databaseId = page?.parent?.database_id;
            }
            else if (type === 'page.content_updated') {
                pageId = entity?.id;
                databaseId = data?.parent?.id;
            }
            if (!pageId) {
                return { success: false, message: 'Invalid webhook: no page ID found' };
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
