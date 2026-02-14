// ============================================================
// DeepEx Reasoning Engine — Main Edge Function
// The Thinking Orchestrator
// Supports time-aware checkpointing for deep mode resumption
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SSEStream } from '../_shared/sse-stream.ts';
import { longcatComplete, longcatStream, MODELS } from '../_shared/longcat-client.ts';
import { webSearch, buildSearchContext, shouldSearch } from '../_shared/langsearch-client.ts';
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

// Time budget: checkpoint if we exceed 80% of the 150s limit
const TIMEOUT_BUDGET_MS = 120_000;

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

        const { conversation_id, message, mode_override } = body as ChatRequest;

        // ── Create SSE stream ─────────────────────────────────
        const sse = new SSEStream();
        const response = sse.getResponse();
        const startTime = Date.now();

        // Run orchestration in background
        (async () => {
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
                        .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 2000)}`)
                        .slice(-16); // Keep last 16 turns max
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
                    })
                    .select('id')
                    .single();

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

                // ══════════════════════════════════════════════════════
                // PHASE 0: CORTEX — Problem Classification
                // ══════════════════════════════════════════════════════
                sse.emitLayerStart('classification', 'Analyzing Query');
                layerOrder++;

                const classificationResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.CORTEX_SYSTEM },
                        { role: 'user', content: prompts.cortexUserPrompt(message) + (conversationHistory ? `\n\nNote: This is part of an ongoing conversation. Consider context when classifying.${conversationHistory}` : '') },
                    ],
                    { model: MODELS.FLASH_CHAT, temperature: 0.1 }
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
                const mode: ReasoningMode = mode_override || metadata.recommended_mode;
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
                // ROUTE: Instant Mode
                // ══════════════════════════════════════════════════════
                if (mode === 'instant') {
                    sse.emitFinalStart(messageId);

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
                            { role: 'user', content: message },
                        ],
                        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
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
                                    { role: 'user', content: message },
                                ],
                                { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
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
                        sse, supabase, messageId, message, searchContext, sources, startTime, layerOrder, conversationHistory
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
                            query: message,
                            search_context: searchContext,
                            sources,
                            start_time: startTime,
                            layer_order: result.layerOrder,
                            conversation_history: conversationHistory,
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
                    sse.emitStageData({
                        stage: 'needs_ultra',
                        message_id: messageId,
                        query: message,
                        search_context: searchContext,
                        sources,
                        start_time: startTime,
                        layer_order: layerOrder,
                        conversation_history: conversationHistory,
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
    conversationHistory: string
): Promise<DeepModeResult> {

    // Helper: check if we're running hot on time
    const isRunningHot = () => (Date.now() - startTime) > TIMEOUT_BUDGET_MS;

    // ── Layer 1: Problem Decomposition ──────────────────────
    sse.emitLayerStart('decomposition', 'Decomposing Problem');
    layerOrder++;
    const layerStart1 = Date.now();

    const decompositionResult = await longcatComplete(
        [
            { role: 'system', content: prompts.DECOMPOSITION_SYSTEM },
            { role: 'user', content: prompts.decompositionUserPrompt(query, searchContext) + conversationHistory },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
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

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'decomposition',
        layer_label: 'Problem Decomposition',
        layer_order: layerOrder,
        content: problemMapStr,
        artifact: problemMap as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart1).toISOString(),
        completed_at: new Date().toISOString(),
    });

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

    let primarySolution = '';
    for await (const chunk of longcatStream(
        [
            { role: 'system', content: prompts.PRIMARY_SOLVER_SYSTEM + conversationHistory },
            { role: 'user', content: prompts.primarySolverUserPrompt(query, problemMapStr, searchContext) },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
    )) {
        if (chunk.content) {
            primarySolution += chunk.content;
            sse.emitLayerChunk('primary_solver', chunk.content);
        }
    }

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'primary_solver',
        layer_label: 'Primary Solver',
        layer_order: layerOrder,
        content: primarySolution,
        status: 'complete',
        started_at: new Date(layerStart2).toISOString(),
        completed_at: new Date().toISOString(),
    });

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

    const criticResult = await longcatComplete(
        [
            { role: 'system', content: prompts.FAST_CRITIC_SYSTEM },
            { role: 'user', content: prompts.fastCriticUserPrompt(query, problemMapStr, primarySolution) },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 }
    );

    let criticReport: CriticReport;
    try {
        criticReport = JSON.parse(criticResult.content);
    } catch {
        criticReport = { issues: [], confidence_flags: [], missing_angles: [] };
    }

    const criticStr = JSON.stringify(criticReport, null, 2);

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'fast_critic',
        layer_label: 'Fast Critic',
        layer_order: layerOrder,
        content: criticStr,
        artifact: criticReport as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart3).toISOString(),
        completed_at: new Date().toISOString(),
    });

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

    let refinedAnswer = '';
    for await (const chunk of longcatStream(
        [
            { role: 'system', content: prompts.REFINER_SYSTEM + conversationHistory },
            { role: 'user', content: prompts.refinerUserPrompt(query, primarySolution, criticStr) },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
    )) {
        if (chunk.content) {
            refinedAnswer += chunk.content;
            sse.emitLayerChunk('refiner', chunk.content);
        }
    }

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'refiner',
        layer_label: 'Answer Refiner',
        layer_order: layerOrder,
        content: refinedAnswer,
        status: 'complete',
        started_at: new Date(layerStart4).toISOString(),
        completed_at: new Date().toISOString(),
    });

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

    const confidenceResult = await longcatComplete(
        [
            { role: 'system', content: prompts.CONFIDENCE_SYSTEM },
            { role: 'user', content: prompts.confidenceUserPrompt(query, refinedAnswer) },
        ],
        { model: MODELS.FLASH_CHAT }
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

    // ── Decision Gate ───────────────────────────────────────
    const shouldEscalate =
        confidence.score < 70 ||
        criticReport.missing_angles.length > 0;

    if (!shouldEscalate) {
        // Return the refined answer as final
        sse.emitFinalStart(messageId);
        // Stream the refined answer as final (re-emit)
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
    const continuationStart = Date.now();
    let layerOrder = initialLayerOrder || 0;

    // Helper: check if THIS continuation is running hot
    const isRunningHot = () => (Date.now() - continuationStart) > TIMEOUT_BUDGET_MS;

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

                for await (const chunk of longcatStream(
                    [
                        { role: 'system', content: prompts.PRIMARY_SOLVER_SYSTEM + conversationHistory },
                        { role: 'user', content: prompts.primarySolverUserPrompt(query, problemMapStr, searchContext) },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
                )) {
                    if (chunk.content) {
                        primarySolution += chunk.content;
                        sse.emitLayerChunk('primary_solver', chunk.content);
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

                const criticResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.FAST_CRITIC_SYSTEM },
                        { role: 'user', content: prompts.fastCriticUserPrompt(query, problemMapStr, primarySolution) },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 }
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

                refinedAnswer = '';
                for await (const chunk of longcatStream(
                    [
                        { role: 'system', content: prompts.REFINER_SYSTEM + conversationHistory },
                        { role: 'user', content: prompts.refinerUserPrompt(query, primarySolution, criticStr) },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
                )) {
                    if (chunk.content) {
                        refinedAnswer += chunk.content;
                        sse.emitLayerChunk('refiner', chunk.content);
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

            const confidenceResult = await longcatComplete(
                [
                    { role: 'system', content: prompts.CONFIDENCE_SYSTEM },
                    { role: 'user', content: prompts.confidenceUserPrompt(query, refinedAnswer) },
                ],
                { model: MODELS.FLASH_CHAT }
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
