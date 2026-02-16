// ============================================================
// DeepEx Reasoning Engine — Main Edge Function
// The Thinking Orchestrator
// Supports time-aware checkpointing for deep mode resumption
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SSEStream } from '../_shared/sse-stream.ts';
import { longcatComplete, longcatStream, MODELS } from '../_shared/longcat-client.ts';
import { webSearch, buildSearchContext, shouldSearch } from '../_shared/langsearch-client.ts';
import { analyzeImage, generateImage } from '../_shared/cloudflare-ai-client.ts';
import { selectModel, deriveComplexity, logModelSelection, type Complexity } from '../_shared/model-selector.ts';
import * as prompts from '../_shared/prompts.ts';
import type {
    ChatRequest,
    IntentMetadata,
    ProblemMap,
    CriticReport,
    ConfidenceResult,
    ReasoningMode,
    Source,
} from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Time budget: checkpoint if we exceed this limit.
// Supabase Edge Functions have a ~150s wall-clock limit.
// We are more conservative now (50s) to handle overhead and streaming.
const TIMEOUT_BUDGET_MS = 50_000;

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const body = await req.json();

        // ── Handle deep mode continuation (checkpoint resume) ──
        if (body.stage === 'continue_deep') {
            return handleDeepContinuation(supabase, body);
        }

        const { conversation_id, message, image_url, mode_override, model_override } = body as ChatRequest;

        // ── Create SSE stream ─────────────────────────────────
        const sse = new SSEStream();
        const response = sse.getResponse();
        const startTime = Date.now();

        // Run orchestration in background
        (async () => {
            const functionStartTime = Date.now();
            console.log(`[DeepEx] Orchestration starting. Current limit: ${TIMEOUT_BUDGET_MS}ms`);

            try {
                // ── Fetch conversation history ─────────────────────
                const { data: previousMessages } = await supabase
                    .from('messages')
                    .select('role, content')
                    .eq('conversation_id', conversation_id)
                    .order('created_at', { ascending: true })
                    .limit(20);

                // Build conversation context string
                let conversationHistory = '';
                if (previousMessages && previousMessages.length > 0) {
                    const historyLines = previousMessages
                        .filter((m: { role: string; content: string }) => m.content && m.content.trim())
                        .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 1200)}`)
                        .slice(-10); // Keep last 10 turns max (was 16 — reduced to control context size)
                    if (historyLines.length > 0) {
                        conversationHistory = `\n\n## Previous Conversation:\n${historyLines.join('\n\n')}`;
                    }
                }

                // ── Save user message ───────────────────────────────
                const { data: userMsg } = await supabase
                    .from('messages')
                    .insert({
                        conversation_id,
                        role: 'user',
                        content: message,
                        image_url: image_url || null,
                    })
                    .select('id')
                    .single();

                // ══════════════════════════════════════════════════════
                // PHASE -1: VISUAL INTELLIGENCE (if image attached)
                // ══════════════════════════════════════════════════════
                let visionContext = '';
                if (image_url) {
                    console.log(`[DeepEx] Image attached — activating Deep Visual Intelligence at +${Date.now() - functionStartTime}ms`);
                    sse.emitLayerStart('classification', 'Analyzing Image with Visual Intelligence');

                    try {
                        // Fetch the image and convert to base64
                        const imgResponse = await fetch(image_url);
                        if (imgResponse.ok) {
                            const imgBuffer = await imgResponse.arrayBuffer();
                            const imgBytes = new Uint8Array(imgBuffer);
                            let binary = '';
                            for (let i = 0; i < imgBytes.byteLength; i++) {
                                binary += String.fromCharCode(imgBytes[i]);
                            }
                            const imgBase64 = btoa(binary);
                            const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

                            // Deep analysis with user query context (uses enhanced buildVisionPrompt)
                            const description = await analyzeImage(
                                imgBase64,
                                contentType,
                                undefined,  // Use default enhanced prompt builder
                                0,          // retryCount
                                message,    // Pass user's message for context-aware analysis
                            );

                            visionContext = `\n\n═══ VISUAL INTELLIGENCE ANALYSIS ═══\nThe user attached an image. Below is an exhaustive visual analysis produced by DeepEx's Vision system (Gemma 3 12B multimodal). Use this analysis to understand the image completely when formulating your response.\n\n${description}\n═══ END IMAGE ANALYSIS ═══`;
                            console.log(`[DeepEx] Deep vision analysis complete: ${description.length} chars at +${Date.now() - functionStartTime}ms`);
                        } else {
                            console.warn(`[DeepEx] Failed to fetch image: ${imgResponse.status}`);
                            visionContext = '\n\n[Note: User attached an image but it could not be retrieved for analysis.]';
                        }
                    } catch (visionErr) {
                        console.error('[DeepEx] Vision analysis failed:', visionErr);
                        visionContext = '\n\n[Note: User attached an image but visual analysis encountered an error.]';
                    }

                    sse.emitLayerComplete('classification', 'Visual Intelligence Analysis');
                }

                // ── Create assistant message placeholder ────────────
                const { data: assistantMsg } = await supabase
                    .from('messages')
                    .insert({
                        conversation_id,
                        role: 'assistant',
                        content: '',
                    })
                    .select('id')
                    .single();

                const messageId = assistantMsg!.id;
                let layerOrder = 0;

                // If mode is explicitly set to instant, tell the client immediately so it can hide thinking UI
                if (mode_override === 'instant') {
                    sse.emitModeSelected('instant');
                }

                // ══════════════════════════════════════════════════════
                // PHASE 0: CORTEX — Problem Classification
                // ══════════════════════════════════════════════════════
                console.log(`[DeepEx] Phase 0: Classification starting at +${Date.now() - functionStartTime}ms`);
                sse.emitLayerStart('classification', 'Analyzing Query');
                layerOrder++;

                const cortexModel = selectModel('cortex_classify', 'medium');
                logModelSelection('cortex_classify', 'medium', cortexModel);
                const classificationResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.CORTEX_SYSTEM },
                        { role: 'user', content: prompts.cortexUserPrompt(message) + visionContext + (conversationHistory ? `\n\nNote: This is part of an ongoing conversation. Consider context when classifying.${conversationHistory}` : '') },
                    ],
                    cortexModel
                );

                let metadata: IntentMetadata;
                try {
                    metadata = JSON.parse(classificationResult.content);
                } catch {
                    metadata = {
                        domain: 'general',
                        reasoning_modes: ['meta'],
                        complexity: 'medium',
                        stakes: 'medium',
                        uncertainty: 'medium',
                        recommended_mode: 'deep',
                        parallelism_needed: false,
                    };
                }

                // Save classification thought log
                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'classification',
                    layer_label: 'Problem Classification',
                    layer_order: layerOrder,
                    content: `Domain: ${metadata.domain} | Modes: ${metadata.reasoning_modes.join(', ')} | Complexity: ${metadata.complexity}`,
                    artifact: metadata as unknown as Record<string, unknown>,
                    status: 'complete',
                    started_at: new Date(startTime).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitClassification(metadata);
                sse.emitLayerComplete('classification', 'Problem Classification');

                // ── Determine mode ────────────────────────────────
                // Remap legacy 'exploratory' to 'deep' (exploratory has been retired)
                let mode: ReasoningMode = mode_override || metadata.recommended_mode;
                if ((mode as string) === 'exploratory') mode = 'deep';

                // ── Derive effective complexity for model selection ──
                const effectiveComplexity: Complexity = deriveComplexity(
                    metadata.complexity,
                    metadata.stakes,
                    metadata.uncertainty
                );
                console.log(`[DeepEx] Mode: ${mode} | Complexity: ${effectiveComplexity} (C:${metadata.complexity}/S:${metadata.stakes}/U:${metadata.uncertainty}) at +${Date.now() - functionStartTime}ms`);
                sse.emitModeSelected(mode);

                // Update message with classification
                await supabase
                    .from('messages')
                    .update({ intent_metadata: metadata as unknown as Record<string, unknown>, mode })
                    .eq('id', messageId);

                // ── Web Search (if needed) ────────────────────────
                let searchContext = '';
                let sources: Source[] = [];
                const needsSearch = (metadata as IntentMetadata & { needs_web_search?: boolean }).needs_web_search || shouldSearch(message, metadata.domain);
                console.log(`[DeepEx] Needs search: ${needsSearch} at +${Date.now() - functionStartTime}ms`);

                if (needsSearch) {
                    sse.emitLayerStart('web_search', 'Searching the Web');
                    layerOrder++;

                    try {
                        const searchQueries = (metadata as IntentMetadata & { search_queries?: string[] }).search_queries || [message];
                        const allResults = [];

                        for (const q of searchQueries.slice(0, 2)) {
                            const { sources: s, rawResults } = await webSearch(q, { count: 4 });
                            sources.push(...s);
                            allResults.push(...rawResults);
                        }

                        // Deduplicate sources by URL
                        sources = sources.filter(
                            (s, i, arr) => arr.findIndex((x) => x.url === s.url) === i
                        );

                        searchContext = buildSearchContext(allResults);
                        // Cap search context to prevent context window overflow in downstream prompts
                        // This gets injected into EVERY solver/skeptic/verifier/synthesizer prompt
                        if (searchContext.length > 8000) {
                            searchContext = searchContext.slice(0, 8000) + '\n[Search context truncated for length]';
                        }

                        await supabase.from('thought_logs').insert({
                            message_id: messageId,
                            layer: 'web_search',
                            layer_label: 'Web Search',
                            layer_order: layerOrder,
                            content: `Found ${sources.length} sources`,
                            artifact: { sources, queries: searchQueries } as unknown as Record<string, unknown>,
                            status: 'complete',
                            started_at: new Date().toISOString(),
                            completed_at: new Date().toISOString(),
                        });

                        sse.emitLayerArtifact('web_search', { sources });
                    } catch (e) {
                        console.error('Web search failed:', e);
                    }
                    sse.emitLayerComplete('web_search', 'Web Search');
                }

                // ══════════════════════════════════════════════════════
                // IMAGE GENERATION ROUTE (if user wants to create an image)
                // ══════════════════════════════════════════════════════
                const extMeta = metadata as IntentMetadata & { wants_image_generation?: boolean; image_generation_prompt?: string };
                if (extMeta.wants_image_generation && extMeta.image_generation_prompt) {
                    console.log(`[DeepEx] Image generation detected at +${Date.now() - functionStartTime}ms`);
                    sse.emitLayerStart('image_generation', 'Generating Image');
                    layerOrder++;

                    try {
                        const genPrompt = extMeta.image_generation_prompt;
                        console.log(`[DeepEx] Generation prompt: ${genPrompt.slice(0, 100)}...`);

                        // Generate with Flux Schnell
                        const imageBase64 = await generateImage(genPrompt, { numSteps: 4, width: 1024, height: 1024 });

                        if (imageBase64) {
                            // Upload to Supabase Storage
                            const fileName = `generated/${messageId}_${Date.now()}.png`;
                            const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

                            const { error: uploadError } = await supabase.storage
                                .from('message-attachments')
                                .upload(fileName, imageBytes, {
                                    contentType: 'image/png',
                                    upsert: false,
                                });

                            if (uploadError) {
                                console.error('[DeepEx] Upload error:', uploadError);
                                throw new Error(`Failed to upload generated image: ${uploadError.message}`);
                            }

                            // Get public URL
                            const { data: publicUrlData } = supabase.storage
                                .from('message-attachments')
                                .getPublicUrl(fileName);

                            const generatedImageUrl = publicUrlData.publicUrl;
                            console.log(`[DeepEx] Image generated and uploaded: ${generatedImageUrl}`);

                            await supabase.from('thought_logs').insert({
                                message_id: messageId,
                                layer: 'image_generation',
                                layer_label: 'Image Generation',
                                layer_order: layerOrder,
                                content: `Generated image from prompt: "${genPrompt.slice(0, 100)}..."`,
                                artifact: { prompt: genPrompt, url: generatedImageUrl } as unknown as Record<string, unknown>,
                                status: 'complete',
                                started_at: new Date().toISOString(),
                                completed_at: new Date().toISOString(),
                            });

                            sse.emitLayerComplete('image_generation', 'Image Generated');

                            // Now stream a response that includes the generated image
                            sse.emitFinalStart(messageId);
                            let finalContent = '';

                            for await (const chunk of longcatStream(
                                [
                                    {
                                        role: 'system',
                                        content: prompts.INSTANT_SYSTEM + `\n\nYou just generated an image for the user using DeepEx's image generation capabilities (powered by Flux Schnell). The image has been created and will be displayed below your response. Describe what was created, mention any artistic choices, and ask if they'd like any modifications. Be enthusiastic but concise. Do NOT include any image markdown yourself — the image will be automatically appended.` + conversationHistory,
                                    },
                                    { role: 'user', content: message },
                                ],
                                { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 }
                            )) {
                                if (chunk.content) {
                                    finalContent += chunk.content;
                                    sse.emitFinalChunk(chunk.content);
                                }
                            }

                            // Append the generated image as markdown
                            const imageMarkdown = `\n\n![Generated Image](${generatedImageUrl})`;
                            finalContent += imageMarkdown;
                            sse.emitFinalChunk(imageMarkdown);

                            // Save to DB with the generated image URL
                            await supabase
                                .from('messages')
                                .update({
                                    content: finalContent,
                                    image_url: generatedImageUrl,
                                    total_thinking_time_ms: Date.now() - startTime,
                                })
                                .eq('id', messageId);

                            sse.emitFinalComplete(95, [], [], []);
                            sse.close();
                            return;
                        }
                    } catch (genErr) {
                        console.error('[DeepEx] Image generation failed:', genErr);
                        // Fall through to normal processing if generation fails
                        sse.emitLayerComplete('image_generation', 'Generation Failed — Falling Back');
                    }
                }

                // ══════════════════════════════════════════════════════
                // ROUTE: Instant Mode
                // ══════════════════════════════════════════════════════
                if (mode === 'instant') {
                    sse.emitFinalStart(messageId);

                    const instantModel = selectModel('instant_answer', effectiveComplexity, model_override);
                    logModelSelection('instant_answer', effectiveComplexity, instantModel);

                    let finalContent = '';
                    for await (const chunk of longcatStream(
                        [
                            {
                                role: 'system',
                                content:
                                    prompts.INSTANT_SYSTEM +
                                    (searchContext ? `\n\nWeb context:\n${searchContext}` : '') +
                                    conversationHistory,
                            },
                            { role: 'user', content: message + visionContext },
                        ],
                        instantModel
                    )) {
                        if (chunk.content) {
                            finalContent += chunk.content;
                            sse.emitFinalChunk(chunk.content);
                        }
                    }

                    // Fallback: If streaming yielded nothing, try a standard request
                    if (!finalContent) {
                        try {
                            const fallbackResp = await longcatComplete(
                                [
                                    {
                                        role: 'system',
                                        content:
                                            prompts.INSTANT_SYSTEM +
                                            (searchContext ? `\n\nWeb context:\n${searchContext}` : '') +
                                            conversationHistory,
                                    },
                                    { role: 'user', content: message + visionContext },
                                ],
                                { model: MODELS.FLASH_CHAT } // Fallback to reliable Chat model
                            );
                            if (fallbackResp.content) {
                                finalContent = fallbackResp.content;
                                sse.emitFinalChunk(finalContent);
                            }
                        } catch (err) {
                            console.error('Instant Mode fallback failed:', err);
                        }
                    }

                    // Save
                    await supabase
                        .from('messages')
                        .update({
                            content: finalContent,
                            sources: sources.length ? sources : null,
                            total_thinking_time_ms: Date.now() - startTime,
                        })
                        .eq('id', messageId);

                    sse.emitFinalComplete(95, [], [], sources.length ? sources : undefined);
                    sse.close();
                    return;
                }

                // ══════════════════════════════════════════════════════
                // DEEP MODE
                // ══════════════════════════════════════════════════════
                if (mode === 'deep') {
                    const result = await runDeepMode(
                        sse, supabase, messageId, message + visionContext, searchContext, sources, startTime, layerOrder, conversationHistory, functionStartTime, effectiveComplexity, model_override
                    );
                    // Check escalation gate
                    if (result.shouldEscalate) {
                        sse.emitEscalation(
                            `Confidence ${result.confidence} is below threshold. Escalating to Ultra-Deep reasoning.`
                        );

                        await supabase
                            .from('messages')
                            .update({ was_escalated: true, mode: 'ultra_deep' })
                            .eq('id', messageId);

                        // Emit stage_data for frontend to call ultra-solve
                        sse.emitStageData({
                            stage: 'needs_ultra',
                            message_id: messageId,
                            query: message + visionContext,
                            search_context: searchContext,
                            sources,
                            start_time: startTime,
                            layer_order: result.layerOrder,
                            conversation_history: conversationHistory,
                            complexity: effectiveComplexity,
                        });
                    }
                    sse.close();
                    return;
                }

                // ══════════════════════════════════════════════════════
                // ULTRA-DEEP MODE — Emit stage_data, frontend chains
                // ══════════════════════════════════════════════════════
                if (mode === 'ultra_deep') {
                    // Emit stage_data for frontend to call ultra-solve
                    console.log(`[DeepEx] Emitting needs_ultra stage_data at +${Date.now() - functionStartTime}ms`);
                    sse.emitStageData({
                        stage: 'needs_ultra',
                        message_id: messageId,
                        query: message + visionContext,
                        search_context: searchContext,
                        sources,
                        start_time: startTime,
                        layer_order: layerOrder,
                        conversation_history: conversationHistory,
                        complexity: effectiveComplexity,
                        model_override,
                    });
                    sse.close();
                    return;
                }
            } catch (error) {
                console.error('Orchestration error:', error);
                sse.emitError(error instanceof Error ? error.message : 'Unknown error');
                sse.close();
            }
        })();

        return response;
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

// ══════════════════════════════════════════════════════════════
// DEEP MODE PIPELINE
// ══════════════════════════════════════════════════════════════

interface DeepModeResult {
    shouldEscalate: boolean;
    confidence: number;
    layerOrder: number;
}

async function runDeepMode(
    sse: SSEStream,
    supabase: ReturnType<typeof createClient>,
    messageId: string,
    query: string,
    searchContext: string,
    sources: Source[],
    startTime: number,
    layerOrder: number,
    conversationHistory: string,
    functionStartTime: number,
    complexity: Complexity = 'medium',
    modelOverride?: string
): Promise<DeepModeResult> {

    // Helper: check if we're running hot on time.
    // We check against BOTH total message time and THIS function execution time.
    const isRunningHot = () => {
        const totalElapsed = Date.now() - startTime;
        const functionElapsed = Date.now() - functionStartTime;
        return totalElapsed > TIMEOUT_BUDGET_MS || functionElapsed > TIMEOUT_BUDGET_MS;
    };

    // ── Layer 1: Problem Decomposition ──────────────────────
    sse.emitLayerStart('decomposition', 'Decomposing Problem');
    layerOrder++;
    const layerStart1 = Date.now();

    sse.emitLayerChunk('decomposition', '> Analyzing constraints and identifying unknowns...\n');

    const decompModel = selectModel('decomposition', complexity, modelOverride);
    logModelSelection('decomposition', complexity, decompModel);
    const decompositionResult = await longcatComplete(
        [
            { role: 'system', content: prompts.DECOMPOSITION_SYSTEM },
            { role: 'user', content: prompts.decompositionUserPrompt(query, searchContext) + conversationHistory },
        ],
        decompModel
    );

    let problemMap: ProblemMap;
    try {
        problemMap = JSON.parse(decompositionResult.content);
    } catch {
        problemMap = {
            facts: [],
            intent: query,
            constraints: [],
            unknowns: [],
            output_type: 'text',
        };
    }

    const problemMapStr = JSON.stringify(problemMap, null, 2);

    // Fire-and-forget (non-critical)
    supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'decomposition',
        layer_label: 'Problem Decomposition',
        layer_order: layerOrder,
        content: problemMapStr,
        artifact: problemMap as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart1).toISOString(),
        completed_at: new Date().toISOString(),
    }).then(() => { }).catch(e => console.warn('[DeepEx] DB write failed:', e));

    sse.emitLayerArtifact('decomposition', problemMap as unknown as Record<string, unknown>);
    sse.emitLayerComplete('decomposition', 'Problem Decomposition');

    // ── Time check: after decomposition ─────────────────
    if (isRunningHot()) {
        sse.emitStageData({
            stage: 'continue_deep',
            message_id: messageId,
            query,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: layerOrder,
            conversation_history: conversationHistory,
            complexity,
            model_override: modelOverride,
            checkpoint: {
                continue_from: 'primary_solver',
                decomposition: problemMapStr,
            },
        });
        return { shouldEscalate: false, confidence: 0, layerOrder };
    }

    // ── Layer 2: Primary Solver ─────────────────────────────
    sse.emitLayerStart('primary_solver', 'Generating Solution');
    layerOrder++;
    const layerStart2 = Date.now();

    sse.emitLayerChunk('primary_solver', '> Initializing solver context...\n');

    const solverModel = selectModel('primary_solver', complexity, modelOverride);
    logModelSelection('primary_solver', complexity, solverModel);
    let primarySolution = '';
    for await (const chunk of longcatStream(
        [
            { role: 'system', content: prompts.PRIMARY_SOLVER_SYSTEM + conversationHistory },
            { role: 'user', content: prompts.primarySolverUserPrompt(query, problemMapStr, searchContext) },
        ],
        solverModel
    )) {
        if (chunk.content) {
            primarySolution += chunk.content;
            sse.emitLayerChunk('primary_solver', chunk.content);
        }
        // Early checkpoint check inside loop
        if (isRunningHot()) {
            console.warn(`[DeepEx] Running hot during Primary Solver. Partial length: ${primarySolution.length}`);
            break;
        }
    }

    // Fire-and-forget (non-critical)
    supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'primary_solver',
        layer_label: 'Primary Solver',
        layer_order: layerOrder,
        content: primarySolution,
        status: 'complete',
        started_at: new Date(layerStart2).toISOString(),
        completed_at: new Date().toISOString(),
    }).then(() => { }).catch(e => console.warn('[DeepEx] DB write failed:', e));

    sse.emitLayerComplete('primary_solver', 'Primary Solver');

    // ── Time check: after solver ────────────────────────
    if (isRunningHot()) {
        sse.emitStageData({
            stage: 'continue_deep',
            message_id: messageId,
            query,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: layerOrder,
            conversation_history: conversationHistory,
            complexity,
            model_override: modelOverride,
            checkpoint: {
                continue_from: 'fast_critic',
                decomposition: problemMapStr,
                primary_solution: primarySolution,
            },
        });
        return { shouldEscalate: false, confidence: 0, layerOrder };
    }

    // ── Layer 3: Fast Critic ────────────────────────────────
    sse.emitLayerStart('fast_critic', 'Critiquing Solution');
    layerOrder++;
    const layerStart3 = Date.now();

    sse.emitLayerChunk('fast_critic', '> Reviewing solution against constraints...\n> Checking for logical gaps...\n');

    const criticModel = selectModel('fast_critic', complexity, modelOverride);
    logModelSelection('fast_critic', complexity, criticModel);
    const criticResult = await longcatComplete(
        [
            { role: 'system', content: prompts.FAST_CRITIC_SYSTEM },
            { role: 'user', content: prompts.fastCriticUserPrompt(query, problemMapStr, primarySolution) },
        ],
        criticModel
    );

    let criticReport: CriticReport;
    try {
        criticReport = JSON.parse(criticResult.content);
    } catch {
        criticReport = { issues: [], confidence_flags: [], missing_angles: [] };
    }

    const criticStr = JSON.stringify(criticReport, null, 2);

    // Fire-and-forget (non-critical)
    supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'fast_critic',
        layer_label: 'Fast Critic',
        layer_order: layerOrder,
        content: criticStr,
        artifact: criticReport as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart3).toISOString(),
        completed_at: new Date().toISOString(),
    }).then(() => { }).catch(e => console.warn('[DeepEx] DB write failed:', e));

    sse.emitLayerArtifact('fast_critic', criticReport as unknown as Record<string, unknown>);
    sse.emitLayerComplete('fast_critic', 'Fast Critic');

    // ── Time check: after critic ────────────────────────
    if (isRunningHot()) {
        sse.emitStageData({
            stage: 'continue_deep',
            message_id: messageId,
            query,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: layerOrder,
            conversation_history: conversationHistory,
            complexity,
            model_override: modelOverride,
            checkpoint: {
                continue_from: 'refiner',
                decomposition: problemMapStr,
                primary_solution: primarySolution,
                critic_report: criticStr,
            },
        });
        return { shouldEscalate: false, confidence: 0, layerOrder };
    }

    // ── Layer 4: Refiner ────────────────────────────────────
    sse.emitLayerStart('refiner', 'Refining Answer');
    layerOrder++;
    const layerStart4 = Date.now();

    sse.emitLayerChunk('refiner', '> incorporating critique feedback...\n> Refining clarity and structure...\n\n');

    const refinerModel = selectModel('refiner', complexity, modelOverride);
    logModelSelection('refiner', complexity, refinerModel);
    let refinedAnswer = '';
    for await (const chunk of longcatStream(
        [
            { role: 'system', content: prompts.REFINER_SYSTEM + conversationHistory },
            { role: 'user', content: prompts.refinerUserPrompt(query, primarySolution, criticReport) },
        ],
        refinerModel
    )) {
        if (chunk.content) {
            refinedAnswer += chunk.content;
            sse.emitLayerChunk('refiner', chunk.content);
        }
        // Early checkpoint check inside loop
        if (isRunningHot()) {
            console.warn(`[DeepEx] Running hot during Refiner. Partial length: ${refinedAnswer.length}`);
            break;
        }
    }

    // Fire-and-forget (non-critical)
    supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'refiner',
        layer_label: 'Answer Refiner',
        layer_order: layerOrder,
        content: refinedAnswer,
        status: 'complete',
        started_at: new Date(layerStart4).toISOString(),
        completed_at: new Date().toISOString(),
    }).then(() => { }).catch(e => console.warn('[DeepEx] DB write failed:', e));

    sse.emitLayerComplete('refiner', 'Answer Refiner');

    // ── Time check: after refiner ───────────────────────
    if (isRunningHot()) {
        sse.emitStageData({
            stage: 'continue_deep',
            message_id: messageId,
            query,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: layerOrder,
            conversation_history: conversationHistory,
            complexity,
            model_override: modelOverride,
            checkpoint: {
                continue_from: 'confidence_gate',
                decomposition: problemMapStr,
                primary_solution: primarySolution,
                critic_report: criticStr,
                refined_answer: refinedAnswer,
            },
        });
        return { shouldEscalate: false, confidence: 0, layerOrder };
    }

    // ── Layer 5: Confidence Gate ────────────────────────────
    sse.emitLayerStart('confidence_gate', 'Assessing Confidence');
    layerOrder++;
    const layerStart5 = Date.now();

    sse.emitLayerChunk('confidence_gate', '> Calculating confidence score...\n> Assessing assumptions...\n');

    const confModel = selectModel('confidence_gate', complexity, modelOverride);
    logModelSelection('confidence_gate', complexity, confModel);
    const confidenceResult = await longcatComplete(
        [
            { role: 'system', content: prompts.CONFIDENCE_SYSTEM },
            { role: 'user', content: prompts.confidenceUserPrompt(query, refinedAnswer) },
        ],
        confModel
    );

    let confidence: ConfidenceResult;
    try {
        confidence = JSON.parse(confidenceResult.content);
    } catch {
        confidence = { score: 75, assumptions: [], uncertainty_notes: [] };
    }

    // Fire-and-forget (non-critical)
    supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'confidence_gate',
        layer_label: 'Confidence Assessment',
        layer_order: layerOrder,
        content: `Confidence: ${confidence.score}/100`,
        artifact: confidence as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart5).toISOString(),
        completed_at: new Date().toISOString(),
    }).then(() => { }).catch(e => console.warn('[DeepEx] DB write failed:', e));

    sse.emitLayerArtifact('confidence_gate', confidence as unknown as Record<string, unknown>);
    sse.emitLayerComplete('confidence_gate', 'Confidence Assessment');

    // ── Decision Gate ───────────────────────────────────────
    const shouldEscalate =
        confidence.score < 70 ||
        criticReport.missing_angles.length > 0;

    if (!shouldEscalate) {
        // Return the refined answer as final
        sse.emitFinalStart(messageId);
        // Stream the refined answer as final (re-emit)
        // Use larger chunks so it appears formatted immediately (since user already saw it stream in the Refiner)
        for (let i = 0; i < refinedAnswer.length; i += 500) {
            sse.emitFinalChunk(refinedAnswer.slice(i, i + 500));
        }

        await supabase
            .from('messages')
            .update({
                content: refinedAnswer,
                confidence_score: confidence.score,
                assumptions: confidence.assumptions,
                uncertainty_notes: confidence.uncertainty_notes,
                sources: sources.length ? sources : null,
                total_thinking_time_ms: Date.now() - startTime,
            })
            .eq('id', messageId);

        sse.emitFinalComplete(
            confidence.score,
            confidence.assumptions,
            confidence.uncertainty_notes,
            sources.length ? sources : undefined
        );
    }

    return { shouldEscalate, confidence: confidence.score, layerOrder };
}

// ══════════════════════════════════════════════════════════════
// DEEP MODE CONTINUATION — Resume from checkpoint
// ══════════════════════════════════════════════════════════════

interface DeepCheckpoint {
    continue_from: 'primary_solver' | 'fast_critic' | 'refiner' | 'confidence_gate';
    decomposition?: string;
    primary_solution?: string;
    critic_report?: string;
    refined_answer?: string;
}

async function handleDeepContinuation(
    supabase: ReturnType<typeof createClient>,
    body: Record<string, unknown>
): Promise<Response> {
    const {
        message_id: messageId,
        query,
        search_context: searchContext,
        sources,
        start_time: originalStartTime,
        layer_order: initialLayerOrder,
        conversation_history: conversationHistory,
        checkpoint,
    } = body as {
        message_id: string;
        query: string;
        search_context: string;
        sources: Source[];
        start_time: number;
        layer_order: number;
        conversation_history: string;
        checkpoint: DeepCheckpoint;
    };

    const sse = new SSEStream();
    const response = sse.getResponse();
    const functionStartTime = Date.now();
    const contComplexity: Complexity = (body.complexity as Complexity) || 'medium';
    const contModelOverride = (body.model_override as string) || undefined;
    let layerOrder = initialLayerOrder || 0;

    // Helper: check if we're running hot on time
    const isRunningHot = () => (Date.now() - functionStartTime) > TIMEOUT_BUDGET_MS;

    (async () => {
        try {
            let problemMapStr = checkpoint.decomposition || '{}';
            let primarySolution = checkpoint.primary_solution || '';
            let criticStr = checkpoint.critic_report || '';
            let refinedAnswer = checkpoint.refined_answer || '';

            console.log(`[DeepEx] Continuation from: ${checkpoint.continue_from}`);

            // ── Primary Solver (if needed) ─────────────────────────
            if (checkpoint.continue_from === 'primary_solver') {
                sse.emitLayerStart('primary_solver', 'Generating Solution');
                layerOrder++;
                const layerStart = Date.now();

                const contSolverModel = selectModel('primary_solver', contComplexity, contModelOverride);
                logModelSelection('primary_solver', contComplexity, contSolverModel);
                for await (const chunk of longcatStream(
                    [
                        { role: 'system', content: prompts.PRIMARY_SOLVER_SYSTEM + conversationHistory },
                        { role: 'user', content: prompts.primarySolverUserPrompt(query, problemMapStr, searchContext) },
                    ],
                    contSolverModel
                )) {
                    if (chunk.content) {
                        primarySolution += chunk.content;
                        sse.emitLayerChunk('primary_solver', chunk.content);
                    }
                    if (isRunningHot()) {
                        console.warn('[DeepEx] Continuation running hot during Primary Solver breakout.');
                        break;
                    }
                }

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'primary_solver',
                    layer_label: 'Primary Solver',
                    layer_order: layerOrder,
                    content: primarySolution,
                    status: 'complete',
                    started_at: new Date(layerStart).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerComplete('primary_solver', 'Primary Solver');

                if (isRunningHot()) {
                    sse.emitStageData({
                        stage: 'continue_deep',
                        message_id: messageId, query, search_context: searchContext, sources,
                        start_time: originalStartTime, layer_order: layerOrder,
                        conversation_history: conversationHistory,
                        complexity: contComplexity,
                        model_override: contModelOverride,
                        checkpoint: {
                            continue_from: 'fast_critic',
                            decomposition: problemMapStr,
                            primary_solution: primarySolution,
                        },
                    });
                    sse.close();
                    return;
                }
            }

            // ── Fast Critic (if needed) ───────────────────────────
            if (['primary_solver', 'fast_critic'].includes(checkpoint.continue_from)) {
                sse.emitLayerStart('fast_critic', 'Critiquing Solution');
                layerOrder++;
                const layerStart = Date.now();

                const contCriticModel = selectModel('fast_critic', contComplexity, contModelOverride);
                logModelSelection('fast_critic', contComplexity, contCriticModel);
                const criticResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.FAST_CRITIC_SYSTEM },
                        { role: 'user', content: prompts.fastCriticUserPrompt(query, problemMapStr, primarySolution) },
                    ],
                    contCriticModel
                );

                let criticReport: CriticReport;
                try {
                    criticReport = JSON.parse(criticResult.content);
                } catch {
                    criticReport = { issues: [], confidence_flags: [], missing_angles: [] };
                }
                criticStr = JSON.stringify(criticReport, null, 2);

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'fast_critic',
                    layer_label: 'Fast Critic',
                    layer_order: layerOrder,
                    content: criticStr,
                    artifact: criticReport as unknown as Record<string, unknown>,
                    status: 'complete',
                    started_at: new Date(layerStart).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerArtifact('fast_critic', criticReport as unknown as Record<string, unknown>);
                sse.emitLayerComplete('fast_critic', 'Fast Critic');

                if (isRunningHot()) {
                    sse.emitStageData({
                        stage: 'continue_deep',
                        message_id: messageId, query, search_context: searchContext, sources,
                        start_time: originalStartTime, layer_order: layerOrder,
                        conversation_history: conversationHistory,
                        complexity: contComplexity,
                        model_override: contModelOverride,
                        checkpoint: {
                            continue_from: 'refiner',
                            decomposition: problemMapStr,
                            primary_solution: primarySolution,
                            critic_report: criticStr,
                        },
                    });
                    sse.close();
                    return;
                }
            }

            // ── Refiner (if needed) ───────────────────────────────
            if (['primary_solver', 'fast_critic', 'refiner'].includes(checkpoint.continue_from)) {
                sse.emitLayerStart('refiner', 'Refining Answer');
                layerOrder++;
                const layerStart = Date.now();

                const contRefinerModel = selectModel('refiner', contComplexity, contModelOverride);
                logModelSelection('refiner', contComplexity, contRefinerModel);
                refinedAnswer = '';
                for await (const chunk of longcatStream(
                    [
                        { role: 'system', content: prompts.REFINER_SYSTEM + conversationHistory },
                        { role: 'user', content: prompts.refinerUserPrompt(query, primarySolution, criticStr) },
                    ],
                    contRefinerModel
                )) {
                    if (chunk.content) {
                        refinedAnswer += chunk.content;
                        sse.emitLayerChunk('refiner', chunk.content);
                    }
                    if (isRunningHot()) {
                        console.warn('[DeepEx] Continuation running hot during Refiner breakout.');
                        break;
                    }
                }

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'refiner',
                    layer_label: 'Answer Refiner',
                    layer_order: layerOrder,
                    content: refinedAnswer,
                    status: 'complete',
                    started_at: new Date(layerStart).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerComplete('refiner', 'Answer Refiner');

                if (isRunningHot()) {
                    sse.emitStageData({
                        stage: 'continue_deep',
                        message_id: messageId, query, search_context: searchContext, sources,
                        start_time: originalStartTime, layer_order: layerOrder,
                        conversation_history: conversationHistory,
                        complexity: contComplexity,
                        model_override: contModelOverride,
                        checkpoint: {
                            continue_from: 'confidence_gate',
                            decomposition: problemMapStr,
                            primary_solution: primarySolution,
                            critic_report: criticStr,
                            refined_answer: refinedAnswer,
                        },
                    });
                    sse.close();
                    return;
                }
            }

            // ── Confidence Gate ────────────────────────────────────
            sse.emitLayerStart('confidence_gate', 'Assessing Confidence');
            layerOrder++;
            const layerStart5 = Date.now();

            const contConfModel = selectModel('confidence_gate', contComplexity, contModelOverride);
            logModelSelection('confidence_gate', contComplexity, contConfModel);
            const confidenceResult = await longcatComplete(
                [
                    { role: 'system', content: prompts.CONFIDENCE_SYSTEM },
                    { role: 'user', content: prompts.confidenceUserPrompt(query, refinedAnswer) },
                ],
                contConfModel
            );

            let confidence: ConfidenceResult;
            try {
                confidence = JSON.parse(confidenceResult.content);
            } catch {
                confidence = { score: 75, assumptions: [], uncertainty_notes: [] };
            }

            await supabase.from('thought_logs').insert({
                message_id: messageId,
                layer: 'confidence_gate',
                layer_label: 'Confidence Assessment',
                layer_order: layerOrder,
                content: `Confidence: ${confidence.score}/100`,
                artifact: confidence as unknown as Record<string, unknown>,
                status: 'complete',
                started_at: new Date(layerStart5).toISOString(),
                completed_at: new Date().toISOString(),
            });

            sse.emitLayerArtifact('confidence_gate', confidence as unknown as Record<string, unknown>);
            sse.emitLayerComplete('confidence_gate', 'Confidence Assessment');

            // ── Parse critic report for escalation decision ──────
            let criticReport: CriticReport;
            try {
                criticReport = JSON.parse(criticStr);
            } catch {
                criticReport = { issues: [], confidence_flags: [], missing_angles: [] };
            }

            const shouldEscalate =
                confidence.score < 70 ||
                criticReport.missing_angles.length > 0;

            if (shouldEscalate) {
                sse.emitEscalation(
                    `Confidence ${confidence.score} is below threshold. Escalating to Ultra-Deep reasoning.`
                );

                await supabase
                    .from('messages')
                    .update({ was_escalated: true, mode: 'ultra_deep' })
                    .eq('id', messageId);

                sse.emitStageData({
                    stage: 'needs_ultra',
                    message_id: messageId,
                    query,
                    search_context: searchContext,
                    sources,
                    start_time: originalStartTime,
                    layer_order: layerOrder,
                    conversation_history: conversationHistory,
                    complexity: contComplexity,
                    model_override: contModelOverride,
                });
            } else {
                // Return the refined answer as final
                sse.emitFinalStart(messageId);
                for (let i = 0; i < refinedAnswer.length; i += 10) {
                    sse.emitFinalChunk(refinedAnswer.slice(i, i + 10));
                }

                await supabase
                    .from('messages')
                    .update({
                        content: refinedAnswer,
                        confidence_score: confidence.score,
                        assumptions: confidence.assumptions,
                        uncertainty_notes: confidence.uncertainty_notes,
                        sources: (sources as Source[])?.length ? sources : null,
                        total_thinking_time_ms: Date.now() - originalStartTime,
                    })
                    .eq('id', messageId);

                sse.emitFinalComplete(
                    confidence.score,
                    confidence.assumptions,
                    confidence.uncertainty_notes,
                    (sources as Source[])?.length ? sources as Source[] : undefined
                );
            }
        } catch (error) {
            console.error('Deep continuation error:', error);
            sse.emitError(error instanceof Error ? error.message : 'Unknown error');
        }
        sse.close();
    })();

    return response;
}
