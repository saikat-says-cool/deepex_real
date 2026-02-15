// ============================================================
// DeepEx API Key Rotation
// Smart rotation to prevent rate limiting
// Used ONLY in Supabase Edge Functions (Deno)
// ============================================================

interface KeyState {
    key: string;
    lastUsed: number;
    errorCount: number;
    isRateLimited: boolean;
    rateLimitedUntil: number;
}

/**
 * Smart key rotator with rate-limit awareness.
 * Tracks usage timestamps and errors to distribute load evenly.
 */
export class KeyRotator {
    private keys: KeyState[];
    private currentIndex: number;

    constructor(apiKeys: string[]) {
        this.keys = apiKeys.map((key) => ({
            key,
            lastUsed: 0,
            errorCount: 0,
            isRateLimited: false,
            rateLimitedUntil: 0,
        }));
        this.currentIndex = 0;
    }

    /**
     * Get the next available key using round-robin with rate-limit skipping.
     * If all keys are rate-limited, returns the one with the soonest recovery.
     */
    getNextKey(): string {
        const now = Date.now();
        const totalKeys = this.keys.length;

        // First pass: try round-robin, skipping rate-limited keys
        for (let i = 0; i < totalKeys; i++) {
            const idx = (this.currentIndex + i) % totalKeys;
            const keyState = this.keys[idx];

            // Check if rate limit has expired
            if (keyState.isRateLimited && now >= keyState.rateLimitedUntil) {
                keyState.isRateLimited = false;
                keyState.errorCount = 0;
            }

            if (!keyState.isRateLimited) {
                this.currentIndex = (idx + 1) % totalKeys;
                keyState.lastUsed = now;
                return keyState.key;
            }
        }

        // All keys are rate-limited — return the one that recovers soonest
        const soonest = this.keys.reduce((prev, curr) =>
            curr.rateLimitedUntil < prev.rateLimitedUntil ? curr : prev
        );
        soonest.lastUsed = now;
        return soonest.key;
    }

    /**
     * Report that a key hit a rate limit or error.
     * Marks it as unavailable for a cooldown period.
     */
    reportError(key: string, cooldownMs: number = 15000): void {
        const keyState = this.keys.find((k) => k.key === key);
        if (keyState) {
            keyState.errorCount++;
            keyState.isRateLimited = true;
            keyState.rateLimitedUntil = Date.now() + cooldownMs;
        }
    }

    /**
     * Report successful use of a key. Resets error count.
     */
    reportSuccess(key: string): void {
        const keyState = this.keys.find((k) => k.key === key);
        if (keyState) {
            keyState.errorCount = 0;
            keyState.isRateLimited = false;
        }
    }

    /**
     * Get count of currently available (non-rate-limited) keys.
     */
    getAvailableCount(): number {
        const now = Date.now();
        return this.keys.filter(
            (k) => !k.isRateLimited || now >= k.rateLimitedUntil
        ).length;
    }
}

// ── LongCat API Keys (Dynamically loaded from Secrets) ──────
const env = Deno.env.toObject();

const LONGCAT_KEYS = Object.keys(env)
    .filter(k => k.startsWith('LONGCAT_API_KEY_'))
    .sort((a, b) => {
        const numA = parseInt(a.split('_').pop() || '0');
        const numB = parseInt(b.split('_').pop() || '0');
        return numA - numB;
    })
    .map(k => env[k]);

// Fallback to one if none found (to avoid empty array errors)
if (LONGCAT_KEYS.length === 0) {
    const defaultKey = Deno.env.get('LONGCAT_API_KEY');
    if (defaultKey) LONGCAT_KEYS.push(defaultKey);
}

// ── LangSearch API Keys (Dynamically loaded from Secrets) ────
const LANGSEARCH_KEYS = Object.keys(env)
    .filter(k => k.startsWith('LANGSEARCH_API_KEY_'))
    .sort((a, b) => {
        const numA = parseInt(a.split('_').pop() || '0');
        const numB = parseInt(b.split('_').pop() || '0');
        return numA - numB;
    })
    .map(k => env[k]);

if (LANGSEARCH_KEYS.length === 0) {
    const defaultKey = Deno.env.get('LANGSEARCH_API_KEY');
    if (defaultKey) LANGSEARCH_KEYS.push(defaultKey);
}

// ── Gemini API Keys (Dynamically loaded from Secrets) ────────
const GEMINI_KEYS = Object.keys(env)
    .filter(k => k.startsWith('GEMINI_API_KEY_'))
    .sort((a, b) => {
        const numA = parseInt(a.split('_').pop() || '0');
        const numB = parseInt(b.split('_').pop() || '0');
        return numA - numB;
    })
    .map(k => env[k]);

if (GEMINI_KEYS.length === 0) {
    const defaultKey = Deno.env.get('GEMINI_API_KEY');
    if (defaultKey) GEMINI_KEYS.push(defaultKey);
}

// ── Singleton Instances ──────────────────────────────────────
export const longcatRotator = new KeyRotator(LONGCAT_KEYS);
export const langsearchRotator = new KeyRotator(LANGSEARCH_KEYS);
export const geminiRotator = new KeyRotator(GEMINI_KEYS);
