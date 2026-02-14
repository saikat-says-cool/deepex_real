// ============================================================
// LongCat API Client
// Handles streaming and non-streaming calls to LongCat AI
// Uses OpenAI-compatible endpoint format
// Docs: https://api.longcat.chat
// ============================================================

import { longcatRotator } from './key-rotation.ts';

const LONGCAT_BASE_URL = 'https://api.longcat.chat/openai/v1';

interface LongCatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface LongCatRequest {
    model: string;
    messages: LongCatMessage[];
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stream?: boolean;
    // Thinking model specific
    enable_thinking?: boolean;
    thinking_budget?: number;
}

interface LongCatChoice {
    delta?: { role?: string; content?: string };
    message?: { role: string; content: string };
    finish_reason?: string | null;
}

interface LongCatStreamChunk {
    id: string;
    object: string;
    choices: LongCatChoice[];
}

interface LongCatResponse {
    id: string;
    object: string;
    choices: Array<{
        index: number;
        message: { role: string; content: string };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// ── Models ───────────────────────────────────────────────────
export const MODELS = {
    /** Ultra-fast lightweight — Cortex classification, tagline gen, chat title gen, confidence gates */
    FLASH_LITE: 'LongCat-Flash-Lite',
    /** Standard chat — Deep Mode (decomposition, solver, critic, refiner), Instant mode, Meta-critic */
    FLASH_CHAT: 'LongCat-Flash-Chat',
    /** Original thinking model — available as fallback */
    FLASH_THINKING_V1: 'LongCat-Flash-Thinking',
    /** Latest thinking model — Ultra-Deep solvers, skeptic, verifier, synthesizer */
    FLASH_THINKING: 'LongCat-Flash-Thinking-2601',
} as const;

/**
 * Make a non-streaming call to LongCat.
 * Returns the full response content.
 */
export async function longcatComplete(
    messages: LongCatMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        /** Enable thinking mode (only for LongCat-Flash-Thinking models) */
        enableThinking?: boolean;
        /** Max tokens for thinking content (min 1024, default 1024) */
        thinkingBudget?: number;
    } = {}
): Promise<{ content: string }> {
    const apiKey = longcatRotator.getNextKey();
    const isThinkingModel = (options.model || MODELS.FLASH_CHAT) === MODELS.FLASH_THINKING;

    const body: LongCatRequest = {
        model: options.model || MODELS.FLASH_CHAT,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
    };

    if (options.topP !== undefined) {
        body.top_p = options.topP;
    }

    // Add thinking parameters for thinking model
    if (isThinkingModel || options.enableThinking) {
        body.enable_thinking = true;
        body.thinking_budget = options.thinkingBudget ?? 4096;
        // Ensure max_tokens > thinking_budget as per docs
        if ((body.max_tokens ?? 4096) <= body.thinking_budget) {
            body.max_tokens = body.thinking_budget + 4096;
        }
    }

    try {
        const response = await fetch(`${LONGCAT_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) {
                longcatRotator.reportError(apiKey, 60000);
                // Retry with a different key
                return longcatComplete(messages, options);
            }
            throw new Error(`LongCat API error ${response.status}: ${errorText}`);
        }

        longcatRotator.reportSuccess(apiKey);
        const data: LongCatResponse = await response.json();

        return {
            content: data.choices[0]?.message?.content || '',
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes('LongCat API error')) {
            throw error;
        }
        longcatRotator.reportError(apiKey, 30000);
        throw error;
    }
}

/**
 * Make a streaming call to LongCat.
 * Yields content chunks as they arrive via SSE.
 */
export async function* longcatStream(
    messages: LongCatMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        enableThinking?: boolean;
        thinkingBudget?: number;
    } = {}
): AsyncGenerator<{ content: string; done: boolean }> {
    const apiKey = longcatRotator.getNextKey();
    const isThinkingModel = (options.model || MODELS.FLASH_CHAT) === MODELS.FLASH_THINKING;

    const body: LongCatRequest = {
        model: options.model || MODELS.FLASH_CHAT,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
    };

    if (options.topP !== undefined) {
        body.top_p = options.topP;
    }

    // Add thinking parameters for thinking model
    if (isThinkingModel || options.enableThinking) {
        body.enable_thinking = true;
        body.thinking_budget = options.thinkingBudget ?? 4096;
        if ((body.max_tokens ?? 4096) <= body.thinking_budget) {
            body.max_tokens = body.thinking_budget + 4096;
        }
    }

    try {
        const response = await fetch(`${LONGCAT_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) {
                longcatRotator.reportError(apiKey, 60000);
                // Retry with different key
                yield* longcatStream(messages, options);
                return;
            }
            throw new Error(`LongCat API error ${response.status}: ${errorText}`);
        }

        longcatRotator.reportSuccess(apiKey);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue; // Just check 'data:'

                const data = trimmed.replace(/^data:\s*/, ''); // Remove 'data:' and optional spaces

                if (data === '[DONE]') {
                    yield { content: '', done: true };
                    return;
                }

                try {
                    const chunk: LongCatStreamChunk = JSON.parse(data);
                    const delta = chunk.choices[0]?.delta;
                    const finishReason = chunk.choices[0]?.finish_reason;

                    if (delta?.content) {
                        yield { content: delta.content, done: false };
                    }
                    if (finishReason === 'stop') {
                        yield { content: '', done: true };
                        return;
                    }
                } catch (e) {
                    // Skip malformed chunks but maybe log them
                    // console.error('JSON Parse error', e, data);
                    continue;
                }
            }
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('LongCat API error')) {
            throw error;
        }
        longcatRotator.reportError(apiKey, 30000);
        throw error;
    }
}
