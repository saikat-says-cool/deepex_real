// ============================================================
// Cloudflare Workers AI Client
// Powers DeepEx Visual Intelligence:
//   - Image Understanding (Gemma 3 12B multimodal)
//   - Image Generation (Flux 1 Schnell)
// Uses key rotation across multiple accounts
// ============================================================

interface CloudflareAccount {
    accountId: string;
    apiKey: string;
    lastUsed: number;
    errorCount: number;
    isRateLimited: boolean;
    rateLimitedUntil: number;
}

// ── Models ───────────────────────────────────────────────────
export const CF_MODELS = {
    /** Gemma 3 12B — Multimodal vision + text understanding */
    VISION: '@cf/google/gemma-3-12b-it',
    /** Flux 1 Schnell — Ultra-fast text-to-image generation */
    IMAGE_GEN: '@cf/black-forest-labs/flux-1-schnell',
    /** Llama 3.2 11B Vision — Image understanding (requires license) */
    LLAMA_VISION: '@cf/meta/llama-3.2-11b-vision-instruct',
} as const;

const CF_BASE_URL = 'https://api.cloudflare.com/client/v4/accounts';

// ── Account Rotator ──────────────────────────────────────────
class CloudflareAccountRotator {
    private accounts: CloudflareAccount[];
    private currentIndex: number;

    constructor() {
        this.accounts = [];
        this.currentIndex = 0;
        this.loadAccounts();
    }

    private loadAccounts(): void {
        const env = Deno.env.toObject();

        // Look for CF_ACCOUNT_ID_N and CF_API_KEY_N pairs
        let i = 1;
        while (true) {
            const accountId = env[`CF_ACCOUNT_ID_${i}`];
            const apiKey = env[`CF_API_KEY_${i}`];
            if (!accountId || !apiKey) break;

            this.accounts.push({
                accountId,
                apiKey,
                lastUsed: 0,
                errorCount: 0,
                isRateLimited: false,
                rateLimitedUntil: 0,
            });
            i++;
        }

        // Fallback to single account
        if (this.accounts.length === 0) {
            const accountId = env['CF_ACCOUNT_ID'];
            const apiKey = env['CF_API_KEY'];
            if (accountId && apiKey) {
                this.accounts.push({
                    accountId,
                    apiKey,
                    lastUsed: 0,
                    errorCount: 0,
                    isRateLimited: false,
                    rateLimitedUntil: 0,
                });
            }
        }

        console.log(`[CF-AI] Loaded ${this.accounts.length} Cloudflare account(s)`);
    }

    getNextAccount(): CloudflareAccount {
        if (this.accounts.length === 0) {
            throw new Error('[CF-AI] No Cloudflare accounts configured');
        }

        const now = Date.now();
        const total = this.accounts.length;

        // Round-robin, skipping rate-limited accounts
        for (let i = 0; i < total; i++) {
            const idx = (this.currentIndex + i) % total;
            const acc = this.accounts[idx];

            if (acc.isRateLimited && now >= acc.rateLimitedUntil) {
                acc.isRateLimited = false;
                acc.errorCount = 0;
            }

            if (!acc.isRateLimited) {
                this.currentIndex = (idx + 1) % total;
                acc.lastUsed = now;
                return acc;
            }
        }

        // All rate-limited — return soonest recovery
        const soonest = this.accounts.reduce((prev, curr) =>
            curr.rateLimitedUntil < prev.rateLimitedUntil ? curr : prev
        );
        soonest.lastUsed = now;
        return soonest;
    }

    reportError(accountId: string, cooldownMs = 60000): void {
        const acc = this.accounts.find(a => a.accountId === accountId);
        if (acc) {
            acc.errorCount++;
            acc.isRateLimited = true;
            acc.rateLimitedUntil = Date.now() + cooldownMs;
        }
    }

    reportSuccess(accountId: string): void {
        const acc = this.accounts.find(a => a.accountId === accountId);
        if (acc) {
            acc.errorCount = 0;
            acc.isRateLimited = false;
        }
    }
}

// ── Singleton ────────────────────────────────────────────────
const cfRotator = new CloudflareAccountRotator();

// ── Deep Vision Prompt Builder ───────────────────────────────

function buildVisionPrompt(userQuery?: string): string {
    const basePrompt = `You are an expert visual analyst with extraordinary perceptual ability and domain expertise across art, science, technology, design, medicine, engineering, nature, and culture. Your task is to produce the most comprehensive, deeply detailed, and insightful analysis of this image that is humanly possible.

ANALYSIS FRAMEWORK — Address EVERY applicable dimension:

1. **CORE SUBJECT**: What is the primary focus? Describe with surgical precision — exact shapes, forms, proportions, and spatial positioning. If it's a person, describe their appearance, clothing, posture, expression, and emotional state. If it's an object, describe its material, condition, brand, model, or type.

2. **TEXT & TYPOGRAPHY**: Transcribe ALL visible text exactly as written. Note font styles, sizes, colors, hierarchy, languages, and placement. Include watermarks, labels, signs, captions, code, equations, or handwriting.

3. **COMPOSITION & SPATIAL LAYOUT**: How are elements arranged? Describe foreground, midground, background. Note rule-of-thirds alignment, leading lines, symmetry/asymmetry, framing, depth of field, and visual weight distribution.

4. **COLOR PALETTE & LIGHTING**: Describe the exact color scheme — dominant colors, accent colors, gradients, contrasts. Analyze lighting direction, quality (harsh/soft/diffused), shadows, highlights, reflections, and overall mood created by the lighting.

5. **FINE DETAILS & TEXTURES**: Zoom into the micro-level — surface textures (rough, smooth, metallic, organic), patterns (repeating, random, fractal), imperfections, wear marks, reflections, or fine print.

6. **DATA & INFORMATION**: If the image contains charts, graphs, tables, diagrams, maps, dashboards, code, mathematical formulas, or technical specifications — extract and interpret ALL data points, trends, and relationships.

7. **CONTEXT & SETTING**: Where and when was this likely taken/created? Indoor/outdoor? Time of day? Season? Geographic or cultural indicators? Professional or casual setting?

8. **STYLE & MEDIUM**: Is this a photograph, illustration, screenshot, render, painting, diagram, meme, or mixed media? What artistic style? What tools or software might have been used?

9. **EMOTIONAL TONE & NARRATIVE**: What story does this image tell? What mood or atmosphere does it convey? What might have happened just before or after this moment?

10. **TECHNICAL QUALITY**: Image resolution, focus quality, noise/grain, compression artifacts, aspect ratio, and any post-processing visible (filters, cropping, editing).

11. **RELATIONSHIPS & CONNECTIONS**: How do different elements in the image relate to each other? Are there visual hierarchies, groupings, contrasts, or juxtapositions?

12. **IMPLICIT MEANING**: What is NOT shown but implied? What assumptions can be made? What is the likely purpose of this image?`;

    if (userQuery && userQuery.trim()) {
        return `${basePrompt}

═══ USER'S SPECIFIC QUESTION ═══
The user has submitted this image alongside the following message:
"${userQuery}"

CRITICAL: While you must analyze ALL dimensions above, give EXTRA DEPTH and PRECISION to aspects that are directly relevant to the user's question. Extract every detail that could help answer their query. If their question asks about something specific in the image, make that the centerpiece of your analysis while still covering everything else.

Now analyze this image with maximum depth:`;
    }

    return `${basePrompt}

Now analyze this image with maximum depth and exhaustive detail:`;
}

// ── Image Understanding ──────────────────────────────────────

/**
 * Analyze an image using Gemma 3 12B Vision.
 * Takes a base64-encoded image and returns a deeply detailed analysis.
 * When userQuery is provided, the analysis prioritizes aspects relevant to the user's question.
 */
export async function analyzeImage(
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    prompt?: string,
    retryCount = 0,
    userQuery?: string,
): Promise<string> {
    const analysisPrompt = prompt || buildVisionPrompt(userQuery);
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];

    const account = cfRotator.getNextAccount();
    const url = `${CF_BASE_URL}/${account.accountId}/ai/run/${CF_MODELS.VISION}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: analysisPrompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${imageBase64}`,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();

            if (response.status === 429 || response.status === 503) {
                console.warn(`[CF-AI] Rate limit on account ${account.accountId.slice(0, 8)}...`);
                cfRotator.reportError(account.accountId, 60000);
                if (retryCount < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount]));
                    return analyzeImage(imageBase64, mimeType, prompt, retryCount + 1, userQuery);
                }
            }

            throw new Error(`CF Vision API error ${response.status}: ${errorText}`);
        }

        cfRotator.reportSuccess(account.accountId);
        const data = await response.json();
        return data.result?.response || '';
    } catch (error) {
        if (!(error instanceof Error && error.message.includes('CF Vision API error'))) {
            if (retryCount < MAX_RETRIES) {
                console.warn(`[CF-AI] Network error. Retry ${retryCount + 1}/${MAX_RETRIES}...`);
                cfRotator.reportError(account.accountId, 30000);
                await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount]));
                return analyzeImage(imageBase64, mimeType, prompt, retryCount + 1, userQuery);
            }
        }
        throw error;
    }
}

// ── Image Generation ─────────────────────────────────────────

/**
 * Generate an image from a text prompt using Flux 1 Schnell.
 * Returns the image as a base64-encoded PNG string.
 */
export async function generateImage(
    prompt: string,
    options: {
        numSteps?: number;
        width?: number;
        height?: number;
    } = {},
    retryCount = 0
): Promise<string> {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];

    const account = cfRotator.getNextAccount();
    const url = `${CF_BASE_URL}/${account.accountId}/ai/run/${CF_MODELS.IMAGE_GEN}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                num_steps: options.numSteps ?? 4,
                width: options.width ?? 1024,
                height: options.height ?? 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();

            if (response.status === 429 || response.status === 503) {
                cfRotator.reportError(account.accountId, 60000);
                if (retryCount < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount]));
                    return generateImage(prompt, options, retryCount + 1);
                }
            }

            throw new Error(`CF Image Gen API error ${response.status}: ${errorText}`);
        }

        cfRotator.reportSuccess(account.accountId);

        // Flux returns the image as raw binary or JSON with base64
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const json = await response.json();
            // CF Workers AI wraps it in result.image (base64)
            return json.result?.image || '';
        } else {
            // Raw binary image response
            const buffer = await response.arrayBuffer();
            // Convert to base64 for Deno
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }
    } catch (error) {
        if (!(error instanceof Error && error.message.includes('CF Image Gen API error'))) {
            if (retryCount < MAX_RETRIES) {
                console.warn(`[CF-AI] Image gen network error. Retry ${retryCount + 1}/${MAX_RETRIES}...`);
                cfRotator.reportError(account.accountId, 30000);
                await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount]));
                return generateImage(prompt, options, retryCount + 1);
            }
        }
        throw error;
    }
}
