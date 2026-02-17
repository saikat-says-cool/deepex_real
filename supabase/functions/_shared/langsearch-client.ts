// ============================================================
// LangSearch Web Search Client — ULTRA RESILIENT
// Hardened against: timeouts, rate limits, connection resets,
// DNS failures, 5xx errors, network drops
// Returns graceful empty results instead of throwing on failure
// ============================================================

import { langsearchRotator } from './key-rotation.ts';
import type { Source } from './types.ts';

const LANGSEARCH_URL = 'https://api.langsearch.com/v1/web-search';

// ── Retry Configuration ─────────────────────────────────────
const MAX_RETRIES = 4;
const BASE_DELAYS = [1000, 2000, 4000, 8000];
const REQUEST_TIMEOUT_MS = 20_000; // 20s per search request

/** Add ±30% jitter */
function jitter(ms: number): number {
    const variance = ms * 0.3;
    return ms + (Math.random() * variance * 2 - variance);
}

/** Create an AbortSignal that fires after `ms` milliseconds */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ── LangSearch API Types ─────────────────────────────────────
interface LangSearchWebPage {
    id: string;
    name: string;
    url: string;
    displayUrl: string;
    snippet: string;
    summary?: string;
    datePublished: string | null;
    dateLastCrawled: string | null;
}

interface LangSearchResponse {
    code: number;
    log_id: string;
    msg: string | null;
    data: {
        _type: 'SearchResponse';
        queryContext: {
            originalQuery: string;
        };
        webPages: {
            webSearchUrl: string;
            totalEstimatedMatches: number | null;
            value: LangSearchWebPage[];
            someResultsRemoved: boolean;
        };
    };
}

type Freshness = 'noLimit' | 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear';

/** Graceful empty result — used when search fails non-critically */
const EMPTY_RESULT: { sources: Source[]; rawResults: LangSearchWebPage[] } = {
    sources: [],
    rawResults: [],
};

/**
 * Perform a web search using LangSearch with hardcore retry logic.
 * NEVER throws — returns empty results on catastrophic failure.
 * This ensures reasoning can continue even without web grounding.
 */
export async function webSearch(
    query: string,
    options: {
        count?: number;
        freshness?: Freshness;
        summary?: boolean;
    } = {},
    retryCount = 0
): Promise<{ sources: Source[]; rawResults: LangSearchWebPage[] }> {
    const apiKey = langsearchRotator.getNextKey();
    const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(LANGSEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query,
                count: options.count ?? 5,
                freshness: options.freshness ?? 'noLimit',
                summary: options.summary ?? true,
            }),
            signal: timeout.signal,
        });

        timeout.clear();

        if (!response.ok) {
            // 429: Infinite retry with key rotation
            if (response.status === 429) {
                console.warn(`[LangSearch] Rate limit (429). Rotating key...`);
                langsearchRotator.reportError(apiKey, 60000);
                await new Promise(r => setTimeout(r, jitter(1000)));
                return webSearch(query, options, retryCount); // Don't increment
            }

            // 5xx: Retry with backoff
            if ([500, 502, 503, 504].includes(response.status) && retryCount < MAX_RETRIES) {
                const delay = jitter(BASE_DELAYS[retryCount]);
                console.warn(`[LangSearch] ${response.status}. Retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms...`);
                langsearchRotator.reportError(apiKey, 30000);
                await new Promise(r => setTimeout(r, delay));
                return webSearch(query, options, retryCount + 1);
            }

            const errorText = await response.text().catch(() => '');
            console.error(`[LangSearch] Fatal error ${response.status}: ${errorText.slice(0, 200)}`);
            // Don't throw — return empty so reasoning can continue without web context
            return EMPTY_RESULT;
        }

        langsearchRotator.reportSuccess(apiKey);
        const data: LangSearchResponse = await response.json();

        if (data.code !== 200) {
            console.error(`[LangSearch] API code ${data.code}: ${data.msg}`);
            // Still don't throw — graceful degradation
            return EMPTY_RESULT;
        }

        const results = data.data?.webPages?.value || [];

        const sources: Source[] = results.map((r) => ({
            title: r.name,
            url: r.url,
            snippet: r.snippet,
        }));

        return { sources, rawResults: results };
    } catch (error) {
        timeout.clear();

        // All errors are retriable for search
        if (retryCount < MAX_RETRIES) {
            const delay = jitter(BASE_DELAYS[retryCount]);
            const errMsg = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
            console.warn(`[LangSearch] Error: ${errMsg}. Retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms...`);
            langsearchRotator.reportError(apiKey, 30000);
            await new Promise(r => setTimeout(r, delay));
            return webSearch(query, options, retryCount + 1);
        }

        // Exhausted retries — return empty, DON'T throw
        console.error(`[LangSearch] All retries exhausted. Continuing without search results.`);
        langsearchRotator.reportError(apiKey, 30000);
        return EMPTY_RESULT;
    }
}

/**
 * Build a search context string from LangSearch results.
 * This gets injected into reasoning prompts for grounding.
 */
export function buildSearchContext(results: LangSearchWebPage[]): string {
    if (results.length === 0) return '';

    const entries = results.map((r, i) => {
        const text = r.summary || r.snippet || '';
        return [
            `[Source ${i + 1}] ${r.name}`,
            `Source: ${r.displayUrl}`,
            `Published: ${r.datePublished || 'Unknown'}`,
            `Content: ${text}`,
            '',
        ].join('\n');
    });

    return [
        '====== WEB SEARCH RESULTS ======',
        '',
        ...entries,
        '====== END SEARCH RESULTS ======',
    ].join('\n');
}

/**
 * Determine whether a search is needed based on query characteristics.
 */
export function shouldSearch(query: string, domain: string): boolean {
    const searchIndicators = [
        /\b(latest|recent|current|today|news|update|now|2024|2025|2026)\b/i,
        /\b(who is|what is|when did|where is|how much|price of|cost of)\b/i,
        /\b(is it true|fact check|verify|confirm|source)\b/i,
        /\b(company|stock|weather|score|result|election)\b/i,
    ];

    const noSearchDomains = [
        'mathematics',
        'logic',
        'philosophy',
        'creative_writing',
        'coding',
        'abstract_reasoning',
    ];

    if (noSearchDomains.includes(domain)) return false;
    return searchIndicators.some((pattern) => pattern.test(query));
}
