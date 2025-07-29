import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';

if (!process.env.CLAUDE_API_KEY) {
  throw new Error('CLAUDE_API_KEY environment variable is required');
}

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  tokenCount: number;
  model: string;
}

export class ClaudeService {
  private static instance: ClaudeService;

  public static getInstance(): ClaudeService {
    if (!ClaudeService.instance) {
      ClaudeService.instance = new ClaudeService();
    }
    return ClaudeService.instance;
  }

  private constructor() {}

  /**
   * Generate chat completion using Claude
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<ChatResponse> {
    try {
      const {
        model = 'claude-3-haiku-20240307', // Using Haiku for faster/cheaper responses
        maxTokens = 1000,
        temperature = 0.7,
      } = options;

      logger.info('Sending request to Claude', {
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

      logger.info('Claude response received', {
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
    } catch (error) {
      logger.error('Error generating chat completion:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        messageCount: messages.length,
        model: options.model 
      });
      throw error;
    }
  }
}

export const claudeService = ClaudeService.getInstance(); 