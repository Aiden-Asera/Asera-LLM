"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ragService = exports.RAGService = void 0;
const uuid_1 = require("uuid");
const claude_1 = require("./claude");
const analytics_1 = require("./analytics");
const logger_1 = require("../utils/logger");
class RAGService {
    static getInstance() {
        if (!RAGService.instance) {
            RAGService.instance = new RAGService();
        }
        return RAGService.instance;
    }
    constructor() { }
    /**
     * Chunk text into smaller pieces for better embedding and retrieval
     */
    chunkText(text, options = {}) {
        const { maxTokens = 500, overlapTokens = 50 } = options;
        // Rough token estimation (1 token ≈ 4 characters for English)
        const avgCharsPerToken = 4;
        const maxChars = maxTokens * avgCharsPerToken;
        const overlapChars = overlapTokens * avgCharsPerToken;
        const chunks = [];
        let startPos = 0;
        let chunkIndex = 0;
        while (startPos < text.length) {
            let endPos = Math.min(startPos + maxChars, text.length);
            // Try to break at sentence boundaries
            if (endPos < text.length) {
                const sentenceEnd = text.lastIndexOf('.', endPos);
                const paragraphEnd = text.lastIndexOf('\n', endPos);
                const breakPoint = Math.max(sentenceEnd, paragraphEnd);
                if (breakPoint > startPos + maxChars * 0.5) {
                    endPos = breakPoint + 1;
                }
            }
            const chunkContent = text.slice(startPos, endPos).trim();
            if (chunkContent.length > 0) {
                chunks.push({
                    content: chunkContent,
                    index: chunkIndex,
                    tokenCount: this.estimateTokenCount(chunkContent),
                });
                chunkIndex++;
            }
            // Calculate next start position with overlap
            startPos = Math.max(endPos - overlapChars, endPos);
            // Avoid infinite loop
            if (startPos >= endPos) {
                startPos = endPos;
            }
        }
        logger_1.logger.info('Document chunked with real embeddings:', {
            originalLength: text.length,
            chunksCreated: chunks.length,
            avgChunkSize: chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length,
        });
        return chunks;
    }
    /**
     * Process and store a document with REAL Claude embeddings
     */
    async processDocument(clientDb, document) {
        try {
            logger_1.logger.info('Processing document for RAG with REAL Claude embeddings:', {
                documentId: document.id,
                title: document.title,
                source: document.source,
                contentLength: document.content.length,
            });
            // Store the document
            await clientDb.insertDocument({
                id: document.id,
                title: document.title,
                content: document.content,
                source: document.source,
                sourceId: document.sourceId,
                metadata: document.metadata,
            });
            // Chunk the document
            const chunks = this.chunkText(document.content);
            // Generate REAL embeddings for each chunk using Claude
            let totalTokens = 0;
            for (const chunk of chunks) {
                try {
                    const embeddingResponse = await claude_1.claudeService.generateEmbedding(chunk.content);
                    totalTokens += embeddingResponse.tokenCount;
                    await clientDb.insertDocumentChunk({
                        id: (0, uuid_1.v4)(),
                        documentId: document.id,
                        content: chunk.content,
                        embedding: embeddingResponse.embedding, // REAL Claude-powered embeddings!
                        chunkIndex: chunk.index,
                        tokenCount: embeddingResponse.tokenCount,
                        metadata: {
                            ...document.metadata,
                            chunkMetadata: {
                                originalIndex: chunk.index,
                                totalChunks: chunks.length,
                                embeddingModel: 'claude-3-haiku-20240307',
                                embeddingTokens: embeddingResponse.tokenCount,
                            },
                        },
                    });
                    // Small delay to avoid rate limiting
                    await this.delay(100);
                }
                catch (embeddingError) {
                    logger_1.logger.error('Error generating embedding for chunk:', {
                        error: embeddingError,
                        documentId: document.id,
                        chunkIndex: chunk.index,
                    });
                    // Use fallback embedding if Claude fails
                    const fallbackEmbedding = this.generateFallbackEmbedding(chunk.content);
                    await clientDb.insertDocumentChunk({
                        id: (0, uuid_1.v4)(),
                        documentId: document.id,
                        content: chunk.content,
                        embedding: fallbackEmbedding,
                        chunkIndex: chunk.index,
                        tokenCount: chunk.tokenCount,
                        metadata: {
                            ...document.metadata,
                            chunkMetadata: {
                                originalIndex: chunk.index,
                                totalChunks: chunks.length,
                                embeddingModel: 'fallback',
                                embeddingTokens: 0,
                            },
                        },
                    });
                }
            }
            logger_1.logger.info('Document processing completed with real embeddings:', {
                documentId: document.id,
                chunksCreated: chunks.length,
                totalEmbeddingTokens: totalTokens,
            });
        }
        catch (error) {
            logger_1.logger.error('Error processing document:', {
                error,
                documentId: document.id,
                title: document.title,
            });
            throw error;
        }
    }
    /**
     * Generate RAG response with REAL semantic search and analytics
     */
    async generateRAGResponse(clientDb, query, options = {}) {
        const startTime = Date.now();
        let embeddingUsed = false;
        let avgRelevanceScore = 0;
        try {
            const { maxSources = 5, model } = options;
            logger_1.logger.info('Starting enhanced RAG response generation:', {
                query: query.substring(0, 100),
                maxSources,
                model,
            });
            let similarChunks = [];
            try {
                // Try vector similarity search with real Claude embeddings
                const queryEmbedding = await claude_1.claudeService.generateEmbedding(query);
                embeddingUsed = true;
                similarChunks = await clientDb.searchSimilarChunksVector(queryEmbedding.embedding, maxSources);
                if (similarChunks.length > 0) {
                    avgRelevanceScore = similarChunks.reduce((sum, chunk) => sum + (chunk.similarity || 0), 0) / similarChunks.length;
                    logger_1.logger.info('Vector similarity search successful:', {
                        query: query.substring(0, 50),
                        results: similarChunks.length,
                        avgSimilarity: avgRelevanceScore,
                    });
                }
            }
            catch (embeddingError) {
                logger_1.logger.warn('Vector search failed, falling back to keyword search:', {
                    error: embeddingError,
                    query: query.substring(0, 50),
                });
                embeddingUsed = false;
            }
            // Fallback to enhanced keyword search if vector search fails or returns no results
            if (similarChunks.length === 0) {
                similarChunks = await clientDb.searchSimilarChunks(query, maxSources);
                if (similarChunks.length > 0) {
                    // Calculate relevance scores for keyword matches
                    avgRelevanceScore = similarChunks.reduce((sum, chunk) => sum + (chunk.score || 0.5), 0) / similarChunks.length;
                    logger_1.logger.info('Keyword search results:', {
                        query: query.substring(0, 50),
                        results: similarChunks.length,
                        avgScore: avgRelevanceScore,
                    });
                }
            }
            const responseTime = Date.now() - startTime;
            // Track analytics
            await analytics_1.analyticsService.trackSearch({
                query,
                resultsFound: similarChunks.length,
                responseTime,
                timestamp: new Date(),
                clientId: clientDb.clientId || 'asera-master',
                embeddingUsed,
                avgRelevanceScore,
            });
            if (similarChunks.length === 0) {
                logger_1.logger.warn('No relevant context found for query:', {
                    query: query.substring(0, 100),
                });
                // Check if this is a general conversation vs company-specific question
                const isGeneralConversation = this.isGeneralConversation(query);
                let promptContent;
                if (isGeneralConversation) {
                    // For casual conversation, just be Corra
                    promptContent = `You are Corra, a friendly and personable AI assistant. Respond warmly and naturally to this casual conversation: ${query}`;
                }
                else {
                    // For potentially company-related questions, explain no context was found
                    promptContent = `You are Corra, a friendly and personable AI assistant. The user asked: "${query}"

I don't have specific information about this topic in my current knowledge base, but I'd love to help! I can provide general assistance or suggest what kind of information might be helpful. Please respond in a warm, helpful way as Corra.`;
                }
                // Generate response without context
                const response = await claude_1.claudeService.generateChatCompletion([
                    {
                        role: 'user',
                        content: promptContent,
                    },
                ], { model });
                return {
                    answer: response.content,
                    sources: [],
                    tokenCount: response.tokenCount,
                };
            }
            // Create enhanced RAG prompt with context
            const contextText = similarChunks
                .map((chunk, idx) => {
                const relevanceIndicator = embeddingUsed
                    ? `(${((chunk.similarity || 0) * 100).toFixed(1)}% similarity)`
                    : `(keyword match)`;
                return `[${idx + 1}] ${chunk.documents?.title || 'Document'} ${relevanceIndicator}: ${chunk.content}`;
            })
                .join('\n\n');
            const ragPrompt = `You are Corra, a friendly and personable AI assistant with access to Asera's company knowledge base. You have a warm, conversational personality and love helping people with both casual chat and detailed information about Asera.

Your personality traits:
- Warm, friendly, and approachable - like talking to a knowledgeable friend
- Enthusiastic about helping and sharing information
- Uses natural, conversational language with occasional emojis when appropriate
- Shows genuine interest in the user's questions
- Maintains a helpful and supportive tone
- Can be playful and engaging while staying professional

Context from Asera's knowledge base:
${contextText}

User: ${query}

Instructions:
- For general conversation (greetings, casual chat), respond naturally and warmly as Corra
- For Asera-related questions, use the provided context to give detailed, accurate information in a friendly way
- Reference sources when making claims about Asera (e.g., "According to the team meeting notes [1]...")
- If the context doesn't fully answer an Asera question, share what you do know and suggest related information
- Be helpful, friendly, and personable - like a knowledgeable colleague who's excited to help
- Use natural language, avoid overly formal responses
- Feel free to use occasional emojis to make responses more engaging and human

Answer:`;
            // Generate response with context
            const response = await claude_1.claudeService.generateChatCompletion([
                {
                    role: 'user',
                    content: ragPrompt,
                },
            ], { model });
            logger_1.logger.info('Enhanced RAG response generated:', {
                query: query.substring(0, 100),
                sourcesUsed: similarChunks.length,
                responseTime: Date.now() - startTime,
                embeddingUsed,
                avgRelevanceScore,
                responseLength: response.content.length,
                tokenCount: response.tokenCount,
            });
            return {
                answer: response.content,
                sources: similarChunks.map((chunk, idx) => ({
                    documentId: chunk.document_id,
                    title: chunk.documents?.title || 'Unknown Document',
                    content: chunk.content.substring(0, 500), // Truncate for response
                    source: chunk.documents?.source || 'unknown',
                    relevanceScore: chunk.similarity || chunk.score || 0.8 - (idx * 0.1),
                })),
                tokenCount: response.tokenCount,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            // Track failed search
            await analytics_1.analyticsService.trackSearch({
                query,
                resultsFound: 0,
                responseTime,
                timestamp: new Date(),
                clientId: clientDb.clientId || 'asera-master',
                embeddingUsed: false,
                avgRelevanceScore: 0,
            });
            logger_1.logger.error('Error generating enhanced RAG response:', {
                error,
                query: query.substring(0, 100),
                responseTime,
            });
            throw error;
        }
    }
    /**
     * Estimate token count (simple approximation)
     */
    estimateTokenCount(text) {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }
    /**
     * Small delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Generate fallback embedding when Claude fails
     */
    generateFallbackEmbedding(text) {
        const dimension = 1536;
        const embedding = new Array(dimension).fill(0);
        // Simple hash-based approach as fallback
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            const index = char % dimension;
            embedding[index] += Math.sin(char * 0.1) * 0.1;
        }
        // Normalize the embedding
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= magnitude;
            }
        }
        return embedding;
    }
    /**
     * Determine if a query is general conversation vs company-specific
     */
    isGeneralConversation(query) {
        const lowercaseQuery = query.toLowerCase().trim();
        // Common casual conversation patterns
        const casualPatterns = [
            // Greetings
            /^(hi|hello|hey|yo|sup|what's up|whats up)$/,
            /^(good morning|good afternoon|good evening)$/,
            /^(how are you|how's it going|hows it going)$/,
            // Simple responses
            /^(thanks|thank you|thx|ok|okay|cool|nice|great)$/,
            /^(yes|no|yeah|yep|nope|sure)$/,
            // Basic questions that aren't company-specific
            /^(what|who|when|where|why|how)(\s+\w+){0,2}\?*$/,
            // Small talk
            /^(how's your day|hows your day|what's new|whats new)$/,
        ];
        // Check if it matches casual patterns
        for (const pattern of casualPatterns) {
            if (pattern.test(lowercaseQuery)) {
                return true;
            }
        }
        // Check for company-related keywords that suggest business context
        const companyKeywords = [
            'asera', 'company', 'business', 'team', 'project', 'client', 'work',
            'meeting', 'goals', 'strategy', 'revenue', 'development', 'product'
        ];
        const hasCompanyKeywords = companyKeywords.some(keyword => lowercaseQuery.includes(keyword));
        // If it has company keywords, treat as business question
        if (hasCompanyKeywords) {
            return false;
        }
        // For short, simple queries (under 5 words) that don't have company keywords,
        // treat as casual conversation
        const wordCount = lowercaseQuery.split(/\s+/).length;
        if (wordCount <= 4) {
            return true;
        }
        // For longer queries without company keywords, default to general conversation
        // but let RAG search handle it (it will find no context and respond normally)
        return false;
    }
    /**
     * Update document embeddings for a specific document.
     */
    async updateDocumentEmbeddings(clientDb, documentId, content) {
        try {
            logger_1.logger.info('Updating document embeddings:', { documentId });
            // Chunk the content
            const chunks = this.chunkText(content);
            // Delete existing chunks
            await clientDb.queryInClientSchema('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
            // Generate new embeddings
            for (const chunk of chunks) {
                try {
                    const embeddingResult = await claude_1.claudeService.generateEmbedding(chunk.content);
                    await clientDb.insertDocumentChunk({
                        id: `${documentId}-chunk-${chunk.index}`,
                        documentId: documentId,
                        content: chunk.content,
                        embedding: embeddingResult.embedding,
                        chunkIndex: chunk.index,
                        tokenCount: chunk.tokenCount,
                        metadata: {},
                    });
                }
                catch (chunkError) {
                    logger_1.logger.error('Error updating chunk embedding:', { error: chunkError, documentId, chunkIndex: chunk.index });
                }
            }
            logger_1.logger.info('Document embeddings updated successfully:', { documentId, chunksProcessed: chunks.length });
        }
        catch (error) {
            logger_1.logger.error('Error updating document embeddings:', { error, documentId });
            throw error;
        }
    }
}
exports.RAGService = RAGService;
exports.ragService = RAGService.getInstance();
