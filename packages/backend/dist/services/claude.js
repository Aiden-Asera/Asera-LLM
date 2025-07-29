"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeService = exports.ClaudeService = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const logger_1 = require("../utils/logger");
if (!process.env.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY environment variable is required');
}
const anthropic = new sdk_1.default({
    apiKey: process.env.CLAUDE_API_KEY,
});
class ClaudeService {
    static getInstance() {
        if (!ClaudeService.instance) {
            ClaudeService.instance = new ClaudeService();
        }
        return ClaudeService.instance;
    }
    constructor() { }
    /**
     * Generate chat completion using Claude
     */
    async generateChatCompletion(messages, options = {}) {
        try {
            const { model = 'claude-3-haiku-20240307', // Using Haiku for faster/cheaper responses
            maxTokens = 1000, temperature = 0.7, } = options;
            logger_1.logger.info('Sending request to Claude', {
                model,
                messageCount: messages.length,
                maxTokens
            });
            const response = await anthropic.messages.create({
                model,
                max_tokens: maxTokens,
                temperature,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type from Claude');
            }
            logger_1.logger.info('Claude response received', {
                model,
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                finishReason: response.stop_reason,
            });
            return {
                content: content.text,
                tokenCount: response.usage.input_tokens + response.usage.output_tokens,
                model,
            };
        }
        catch (error) {
            logger_1.logger.error('Error generating chat completion:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                messageCount: messages.length,
                model: options.model
            });
            throw error;
        }
    }
    /**
     * Generate embeddings using Claude (via text analysis)
     * Since Claude doesn't have direct embeddings API, we'll use a hybrid approach
     */
    async generateEmbedding(text) {
        try {
            logger_1.logger.info('Generating embedding via Claude analysis', {
                textLength: text.length
            });
            // Use Claude to analyze and create semantic features
            const analysisPrompt = `Analyze the following text and extract its key semantic features, concepts, and topics. Provide a structured analysis that captures the meaning:

Text: "${text}"

Provide analysis in this format:
- Main topics: [list key topics]
- Key concepts: [list important concepts] 
- Context: [describe the context/domain]
- Sentiment: [positive/negative/neutral]
- Keywords: [important keywords]
- Summary: [brief summary]`;
            const response = await anthropic.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 300,
                messages: [{ role: 'user', content: analysisPrompt }],
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type from Claude');
            }
            // Convert Claude's analysis into a numerical embedding
            const embedding = this.textToEmbedding(text, content.text);
            logger_1.logger.info('Claude embedding generated', {
                textLength: text.length,
                tokenCount: response.usage.input_tokens + response.usage.output_tokens,
                embeddingDimension: embedding.length
            });
            return {
                embedding,
                tokenCount: response.usage.input_tokens + response.usage.output_tokens,
            };
        }
        catch (error) {
            logger_1.logger.error('Error generating Claude embedding:', { error });
            throw error;
        }
    }
    /**
     * Convert text and Claude analysis into numerical embedding
     */
    textToEmbedding(originalText, analysis) {
        const dimension = 1536; // Standard embedding dimension
        const embedding = new Array(dimension).fill(0);
        // Combine original text and Claude's analysis for richer embedding
        const combinedText = (originalText + ' ' + analysis).toLowerCase();
        // Create a more sophisticated embedding based on:
        // 1. Character frequency patterns
        // 2. Word patterns from Claude analysis
        // 3. Semantic markers
        // Process character patterns
        for (let i = 0; i < combinedText.length; i++) {
            const char = combinedText.charCodeAt(i);
            const index = char % dimension;
            embedding[index] += Math.sin(char * 0.1) * 0.1;
        }
        // Process word patterns from analysis
        const words = combinedText.split(/\s+/);
        words.forEach((word, wordIndex) => {
            const wordHash = this.simpleHash(word);
            const index = wordHash % dimension;
            embedding[index] += Math.cos(wordIndex * 0.1) * 0.2;
        });
        // Add semantic markers based on analysis content
        const semanticMarkers = [
            'main topics', 'key concepts', 'context', 'sentiment', 'keywords', 'summary',
            'asera', 'team', 'development', 'business', 'client', 'project', 'meeting'
        ];
        semanticMarkers.forEach((marker, markerIndex) => {
            if (combinedText.includes(marker)) {
                const index = (markerIndex * 47) % dimension; // Prime number for distribution
                embedding[index] += 0.5;
            }
        });
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
     * Simple hash function for words
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
    /**
     * Calculate cosine similarity between embeddings
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same dimension');
        }
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }
        return dotProduct / (magnitudeA * magnitudeB);
    }
}
exports.ClaudeService = ClaudeService;
exports.claudeService = ClaudeService.getInstance();
