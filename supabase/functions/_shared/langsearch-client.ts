// ============================================================
// LangSearch Web Search Client
// Provides web grounding via LangSearch API
// Docs: https://api.langsearch.com
// ============================================================

import { langsearchRotator } from './key-rotation.ts';
import type { Source } from './types.ts';

const LANGSEARCH_URL = 'https://api.langsearch.com/v1/web-search';

// ── LangSearch API Types ─────────────────────────────────────
interface LangSearchWebPage {
    id: string;
    name: string;       // Page title
    url: string;
    displayUrl: string;
    snippet: string;    // Brief snippet
    summary?: string;   // Full summary (only when summary=true)
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

// Freshness values per docs
type Freshness = 'noLimit' | 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear';

/**
 * Perform a web search using LangSearch.
 * Returns structured sources and raw results.
 */
export async function webSearch(
    query: string,
    options: {
        count?: number;
        freshness?: Freshness;
        /** Request full summaries (longer text) */
        summary?: boolean;
    } = {}
): Promise<{ sources: Source[]; rawResults: LangSearchWebPage[] }> {
    const apiKey = langsearchRotator.getNextKey();

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
        });

        if (!response.ok) {
            if (response.status === 429) {
                langsearchRotator.reportError(apiKey, 60000);
                // Retry with different key
                return webSearch(query, options);
            }
            const errorText = await response.text();
            throw new Error(`LangSearch error ${response.status}: ${errorText}`);
        }

        langsearchRotator.reportSuccess(apiKey);
        const data: LangSearchResponse = await response.json();

        // Check response code from API
        if (data.code !== 200) {
            throw new Error(`LangSearch API returned code ${data.code}: ${data.msg}`);
        }

        const results = data.data?.webPages?.value || [];

        const sources: Source[] = results.map((r) => ({
            title: r.name,
            url: r.url,
            snippet: r.snippet,
        }));

        return { sources, rawResults: results };
    } catch (error) {
        if (error instanceof Error && error.message.includes('LangSearch error')) {
            throw error;
        }
        langsearchRotator.reportError(apiKey, 30000);
        throw error;
    }
}

/**
 * Build a search context string from LangSearch results.
 * This gets injected into reasoning prompts for grounding.
 */
export function buildSearchContext(results: LangSearchWebPage[]): string {
    if (results.length === 0) return '';

    const entries = results.map((r, i) => {
        // Prefer summary over snippet when available
        const text = r.summary || r.snippet || '';

        return [
            `[Source ${i + 1}] ${r.name}`,
            `URL: ${r.url}`,
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
 * Used by the Cortex when needs_web_search is ambiguous.
 */
export function shouldSearch(query: string, domain: string): boolean {
    const searchIndicators = [
        // Temporal queries
        /\b(latest|recent|current|today|news|update|now|2024|2025|2026)\b/i,
        // Factual lookups
        /\b(who is|what is|when did|where is|how much|price of|cost of)\b/i,
        // Verification
        /\b(is it true|fact check|verify|confirm|source)\b/i,
        // Specific entities
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
