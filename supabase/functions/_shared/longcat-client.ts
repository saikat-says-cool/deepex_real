// ============================================================
// LongCat API Client — ULTRA RESILIENT
// Hardened against: timeouts, rate limits, connection resets,
// DNS failures, 5xx errors, empty responses, network drops
// ============================================================

import { longcatRotator } from './key-rotation.ts';

const LONGCAT_BASE_URL = 'https://api.longcat.chat/openai/v1';

// ── Retry Configuration ─────────────────────────────────────
const MAX_RETRIES = 5;
// Exponential backoff with jitter: ~1s, ~2s, ~4s, ~8s, ~12s
const BASE_DELAYS = [1000, 2000, 4000, 8000, 12000];

/** Add ±30% jitter to a delay to prevent thundering herd */
function jitter(ms: number): number {
    const variance = ms * 0.3;
    return ms + (Math.random() * variance * 2 - variance);
}

/** Per-request timeout (45s). Prevents hanging connections from eating up
 *  the Edge Function's 60s budget. */
const REQUEST_TIMEOUT_MS = 45_000;

/** Create an AbortSignal that fires after `ms` milliseconds */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ── Types ────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────

/** Check if an error is retriable (network, timeout, connection reset, etc.) */
function isRetriableError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === 'AbortError') return true; // our timeout
    if (!(err instanceof Error)) return true; // unknown => retry
    const msg = err.message.toLowerCase();
    // Non-retriable: only explicit API errors we already parsed
    if (msg.startsWith('longcat api error 4') && !msg.includes('429')) return false; // 4xx except 429
    return true;
}

/** Build the request body from messages + options */
function buildBody(
    messages: LongCatMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        enableThinking?: boolean;
        thinkingBudget?: number;
    },
    stream: boolean
): LongCatRequest {
    const model = options.model || MODELS.FLASH_CHAT;
    const isThinkingModel = model === MODELS.FLASH_THINKING || model === MODELS.FLASH_THINKING_V1;

    const body: LongCatRequest = {
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream,
    };

    if (options.topP !== undefined) {
        body.top_p = options.topP;
    }

    if (isThinkingModel || options.enableThinking) {
        body.enable_thinking = true;
        body.thinking_budget = options.thinkingBudget ?? 4096;
        if ((body.max_tokens ?? 4096) <= body.thinking_budget) {
            body.max_tokens = body.thinking_budget + 4096;
        }
    }

    return body;
}

// ══════════════════════════════════════════════════════════════
// NON-STREAMING (longcatComplete)
// ══════════════════════════════════════════════════════════════

export async function longcatComplete(
    messages: LongCatMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        enableThinking?: boolean;
        thinkingBudget?: number;
    } = {},
    retryCount = 0
): Promise<{ content: string }> {
    let attempts = 0;
    const TOTAL_MAX_ATTEMPTS = 10; // Total attempts including rotations

    while (attempts < TOTAL_MAX_ATTEMPTS) {
        const apiKey = longcatRotator.getNextKey();
        const body = buildBody(messages, options, false);
        const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(`${LONGCAT_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: timeout.signal,
            });

            timeout.clear();

            if (!response.ok) {
                // 429: Rotate key and retry IMMEDIATELY without counting as a "failed" retry
                if (response.status === 429) {
                    console.warn(`[LongCat] 429 on key ${apiKey.slice(0, 8)}... rotating...`);
                    longcatRotator.reportError(apiKey, 15000);
                    // Don't increment attempts for 429 rotations, unless we've cycled many times
                    attempts = Math.max(attempts, 2);
                    continue;
                }

                // 5xx: Retry with backoff
                const is5xx = [500, 502, 503, 504].includes(response.status);
                if (is5xx && attempts < TOTAL_MAX_ATTEMPTS - 1) {
                    const delay = jitter(BASE_DELAYS[Math.min(attempts, BASE_DELAYS.length - 1)]);
                    console.warn(`[LongCat] ${response.status}. Retry ${attempts + 1}/${TOTAL_MAX_ATTEMPTS} in ${Math.round(delay)}ms...`);
                    longcatRotator.reportError(apiKey, 30000);
                    await new Promise(r => setTimeout(r, delay));
                    attempts++;
                    continue;
                }

                const errorText = await response.text().catch(() => '');
                throw new Error(`LongCat API ${response.status}: ${errorText.slice(0, 200)}`);
            }

            longcatRotator.reportSuccess(apiKey);
            const data: LongCatResponse = await response.json();
            const content = data.choices[0]?.message?.content || '';

            // Handle empty response
            if (!content && attempts < 3) {
                console.warn(`[LongCat] Empty response. Rotating...`);
                longcatRotator.reportError(apiKey, 10000);
                attempts++;
                continue;
            }

            return { content };

        } catch (error) {
            timeout.clear();
            if (isRetriableError(error) && attempts < TOTAL_MAX_ATTEMPTS - 1) {
                const delay = jitter(BASE_DELAYS[Math.min(attempts, BASE_DELAYS.length - 1)]);
                console.warn(`[LongCat] ${error instanceof Error ? error.message.slice(0, 100) : 'Error'}. Retry ${attempts + 1}...`);
                longcatRotator.reportError(apiKey, 15000);
                await new Promise(r => setTimeout(r, delay));
                attempts++;
                continue;
            }
            throw error;
        }
    }
    throw new Error('LongCat failed after maximum rotation attempts.');
}

// ══════════════════════════════════════════════════════════════
// STREAMING (longcatStream)
// ══════════════════════════════════════════════════════════════

export async function* longcatStream(
    messages: LongCatMessage[],
    options: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        enableThinking?: boolean;
        thinkingBudget?: number;
    } = {},
    retryCount = 0
): AsyncGenerator<{ content: string; done: boolean }> {
    let attempts = 0;
    const TOTAL_MAX_ATTEMPTS = 10;

    while (attempts < TOTAL_MAX_ATTEMPTS) {
        const apiKey = longcatRotator.getNextKey();
        const body = buildBody(messages, options, true);
        const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);
        let totalYielded = 0;

        try {
            const response = await fetch(`${LONGCAT_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: timeout.signal,
            });

            if (!response.ok) {
                timeout.clear();
                if (response.status === 429) {
                    console.warn(`[LongCat] 429 on stream... rotating...`);
                    longcatRotator.reportError(apiKey, 15000);
                    attempts = Math.max(attempts, 2);
                    continue;
                }
                if (attempts < TOTAL_MAX_ATTEMPTS - 1) {
                    const delay = jitter(1000);
                    await new Promise(r => setTimeout(r, delay));
                    attempts++;
                    continue;
                }
                const errorText = await response.text().catch(() => '');
                throw new Error(`LongCat stream API ${response.status}: ${errorText.slice(0, 100)}`);
            }

            longcatRotator.reportSuccess(apiKey);
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No stream reader');

            const decoder = new TextDecoder();
            let buffer = '';
            let lastChunkTime = Date.now();

            // Internal watchdog for this stream instance
            const watchDog = setInterval(() => {
                if (Date.now() - lastChunkTime > 30_000) {
                    console.warn('[LongCat] Stream stalled. Aborting...');
                    reader.cancel('Stalled').catch(() => { });
                }
            }, 10000);

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    lastChunkTime = Date.now();
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data:')) continue;
                        const dataStr = trimmed.replace(/^data:\s*/, '');

                        if (dataStr === '[DONE]') {
                            yield { content: '', done: true };
                            return; // Success!
                        }

                        try {
                            const chunk: LongCatStreamChunk = JSON.parse(dataStr);
                            const content = chunk.choices[0]?.delta?.content;
                            if (content) {
                                totalYielded += content.length;
                                yield { content, done: false };
                            }
                            if (chunk.choices[0]?.finish_reason === 'stop') {
                                yield { content: '', done: true };
                                return;
                            }
                        } catch { continue; }
                    }
                }
            } finally {
                clearInterval(watchDog);
                timeout.clear();
                try { reader.releaseLock(); } catch { /* ignore */ }
            }

            if (totalYielded > 0) {
                return; // Normal completion
            }

            // If we got here with zero content, it's effectively a failure
            console.warn('[LongCat] Stream empty. Rotating...');
            attempts++;
            continue;

        } catch (error) {
            timeout.clear();
            if (attempts < TOTAL_MAX_ATTEMPTS - 1) {
                console.warn(`[LongCat] Stream failed: ${error instanceof Error ? error.message.slice(0, 100) : error}. Rotating...`);
                longcatRotator.reportError(apiKey, 15000);
                attempts++;
                continue;
            }
            throw error;
        }
    }
}
