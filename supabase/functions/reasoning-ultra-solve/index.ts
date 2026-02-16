// ============================================================
// DeepEx Ultra-Deep Solve — Stage 1
// Decomposition + 3 Parallel Solvers (FLASH_THINKING)
// Supports time-aware checkpointing for resumption
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SSEStream } from '../_shared/sse-stream.ts';
import { longcatComplete, longcatStream, MODELS } from '../_shared/longcat-client.ts';
import { selectModel, logModelSelection, type Complexity } from '../_shared/model-selector.ts';
import * as prompts from '../_shared/prompts.ts';
import type { Source } from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Time budget: checkpoint if we exceed this limit (Supabase real limit is ~60-90s)
const TIMEOUT_BUDGET_MS = 50_000;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const body = await req.json();

        // ── Handle continuation (checkpoint resume) ─────────
        if (body.stage === 'continue_ultra_solve') {
            return handleUltraSolveContinuation(supabase, body);
        }

        const {
            message_id: messageId,
            query,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: initialLayerOrder,
            conversation_history: conversationHistory,
        } = body;

        const complexity: Complexity = body.complexity || 'high'; // Default to 'high' for Ultra-Deep
        const convCtx = conversationHistory || '';
        const functionStart = Date.now();

        const sse = new SSEStream();
        const response = sse.getResponse();
        let layerOrder = initialLayerOrder || 0;

        (async () => {
            try {
                // ── Layer 1: Deep Decomposition ─────────────────────
                sse.emitLayerStart('deep_decomposition', 'Deep Problem Analysis');
                layerOrder++;
                const layerStart1 = Date.now();

                const decompModel = selectModel('deep_decomposition', complexity);
                logModelSelection('deep_decomposition', complexity, decompModel);
                let decompContent = '';
                for await (const chunk of longcatStream(
                    [
                        { role: 'system', content: prompts.DEEP_DECOMPOSITION_SYSTEM },
                        { role: 'user', content: prompts.decompositionUserPrompt(query, searchContext) + convCtx },
                    ],
                    decompModel
                )) {
                    if (chunk.content) {
                        decompContent += chunk.content;
                        sse.emitLayerChunk('deep_decomposition', chunk.content);
                    }
                }

                let deepProblemMap: Record<string, unknown>;
                try {
                    deepProblemMap = JSON.parse(decompContent);
                } catch {
                    deepProblemMap = { intent: query, facts: [], constraints: [], unknowns: [] };
                }

                const deepMapStr = JSON.stringify(deepProblemMap, null, 2);

                // Fire-and-forget: don't await DB write (non-critical)
                supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'deep_decomposition',
                    layer_label: 'Deep Problem Analysis',
                    layer_order: layerOrder,
                    content: decompContent,
                    artifact: deepProblemMap,
                    status: 'complete',
                    started_at: new Date(layerStart1).toISOString(),
                    completed_at: new Date().toISOString(),
                }).then(() => { }).catch(e => console.warn('[Ultra-Solve] DB write failed (non-critical):', e));

                sse.emitLayerArtifact('deep_decomposition', deepProblemMap);
                sse.emitLayerComplete('deep_decomposition', 'Deep Problem Analysis');

                // ── Time check: after decomposition ─────────────────
                if ((Date.now() - functionStart) > TIMEOUT_BUDGET_MS) {
                    console.log('[Ultra-Solve] Running hot after decomposition, checkpointing...');
                    sse.emitStageData({
                        stage: 'continue_ultra_solve',
                        message_id: messageId,
                        query,
                        search_context: searchContext,
                        sources,
                        start_time: startTime,
                        layer_order: layerOrder,
                        conversation_history: conversationHistory,
                        complexity,
                        checkpoint: {
                            continue_from: 'solvers',
                            decomposition: deepMapStr,
                        },
                    });
                    sse.close();
                    return;
                }

                // ── Layer 2: Triple Parallel Solvers ─────────────────
                await runParallelSolvers(sse, supabase, messageId, query, deepMapStr, searchContext, convCtx, layerOrder, complexity);

            } catch (error) {
                console.error('Ultra-solve error:', error);
                sse.emitError(error instanceof Error ? error.message : 'Unknown error');
            }
            sse.close();
        })();

        return response;
    } catch (error) {
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

// ══════════════════════════════════════════════════════════════
// PARALLEL SOLVERS — Shared logic for initial & continuation
// ══════════════════════════════════════════════════════════════

async function runParallelSolvers(
    sse: SSEStream,
    supabase: ReturnType<typeof createClient>,
    messageId: string,
    query: string,
    deepMapStr: string,
    searchContext: string,
    convCtx: string,
    layerOrder: number,
    complexity: Complexity = 'high',
): Promise<void> {
    sse.emitParallelStart();
    layerOrder++;

    const solverPrompt = prompts.solverUserPrompt(query, deepMapStr, searchContext);
    const parallelGroup = 'ultra_solvers';

    sse.emitLayerStart('solver_a_standard', 'Standard Reasoner', parallelGroup);
    sse.emitLayerStart('solver_b_pessimist', 'Failure Mode Analysis', parallelGroup);
    sse.emitLayerStart('solver_c_creative', 'Creative Alternatives', parallelGroup);

    const layerStart2 = Date.now();

    // Helper: run a solver with streaming, fallback to complete if empty, and graceful error handling
    const runSolver = async (
        system: string,
        temperature: number,
        layerName: string,
    ): Promise<string> => {
        let content = '';
        const solverConfig = selectModel('ultra_solver', complexity);
        // Merge per-solver temperature with model selection
        const mergedConfig = { ...solverConfig, temperature };
        logModelSelection('ultra_solver', complexity, mergedConfig);
        try {
            for await (const chunk of longcatStream(
                [
                    { role: 'system', content: system + convCtx },
                    { role: 'user', content: solverPrompt },
                ],
                mergedConfig
            )) {
                if (chunk.content) {
                    content += chunk.content;
                    sse.emitLayerChunk(layerName as any, chunk.content, parallelGroup);
                }
            }
        } catch (err) {
            console.error(`[Ultra-Solve] ${layerName} streaming failed:`, err);
            // Don't return yet - try fallback
        }

        // Fallback: if streaming yielded nothing, try a non-streaming call
        if (!content) {
            console.warn(`[Ultra-Solve] ${layerName} streamed empty — trying fallback...`);
            try {
                const fallback = await longcatComplete(
                    [
                        { role: 'system', content: system + convCtx },
                        { role: 'user', content: solverPrompt },
                    ],
                    { model: MODELS.FLASH_CHAT, temperature } // Fallback to reliable model
                );
                content = fallback.content || '';
                if (content) {
                    sse.emitLayerChunk(layerName as any, content, parallelGroup);
                    console.log(`[Ultra-Solve] ${layerName} fallback succeeded (${content.length} chars)`);
                } else {
                    content = `[Solver produced no output after retries — continuing with partial results]`;
                    sse.emitLayerChunk(layerName as any, content, parallelGroup);
                    console.error(`[Ultra-Solve] ${layerName} fallback also returned empty`);
                }
            } catch (fallbackErr) {
                content = `[Solver failed after retries: ${(fallbackErr as Error).message || 'Unknown'} — continuing with partial results]`;
                sse.emitLayerChunk(layerName as any, content, parallelGroup);
                console.error(`[Ultra-Solve] ${layerName} fallback also failed:`, fallbackErr);
            }
        }

        return content;
    };

    // Run all three in parallel with graceful degradation and 500ms staggering
    // Staggering helps prevent network congestion/connection reset issues
    const runA = runSolver(prompts.SOLVER_A_SYSTEM, 0.3, 'solver_a_standard');
    await new Promise(r => setTimeout(r, 500));
    const runB = runSolver(prompts.SOLVER_B_SYSTEM, 0.5, 'solver_b_pessimist');
    await new Promise(r => setTimeout(r, 500));
    const runC = runSolver(prompts.SOLVER_C_SYSTEM, 0.8, 'solver_c_creative');

    // Per-solver hard timeout: 40s. If a solver hangs, we don't wait forever.
    const SOLVER_TIMEOUT_MS = 40_000;
    const withTimeout = (p: Promise<string>, name: string) =>
        Promise.race([
            p,
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`${name} timed out after ${SOLVER_TIMEOUT_MS}ms`)), SOLVER_TIMEOUT_MS)
            ),
        ]);

    const results = await Promise.allSettled([
        withTimeout(runA, 'Solver A'),
        withTimeout(runB, 'Solver B'),
        withTimeout(runC, 'Solver C'),
    ]);

    // Cap each solver output at 6000 chars to prevent context overflow in synthesizer
    const MAX_SOLVER_OUTPUT = 6000;
    const capOutput = (text: string) =>
        text.length > MAX_SOLVER_OUTPUT
            ? text.slice(0, MAX_SOLVER_OUTPUT) + '\n[Output truncated for synthesis]'
            : text;

    const solverAResult = capOutput(results[0].status === 'fulfilled' ? results[0].value : '[Solver A failed completely]');
    const solverBResult = capOutput(results[1].status === 'fulfilled' ? results[1].value : '[Solver B failed completely]');
    const solverCResult = capOutput(results[2].status === 'fulfilled' ? results[2].value : '[Solver C failed completely]');

    // Log if any solvers failed
    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount > 0) {
        console.warn(`[Ultra-Solve] ${failedCount}/3 solvers failed completely. Continuing with partial results.`);
    }

    // Ensure we have at least one valid solver output before emitting stage_data
    // If all failed, we should throw to the catch block instead of sending nulls to Stage 3
    if (!solverAResult.length && !solverBResult.length && !solverCResult.length) {
        throw new Error('All solvers produced empty results.');
    }

    // Mark solvers complete
    sse.emitLayerComplete('solver_a_standard', 'Standard Reasoner');
    sse.emitLayerComplete('solver_b_pessimist', 'Failure Mode Analysis');
    sse.emitLayerComplete('solver_c_creative', 'Creative Alternatives');

    // Save solver thought logs in parallel
    // Fire-and-forget: save solver thought logs (non-critical)
    Promise.all([
        supabase.from('thought_logs').insert({
            message_id: messageId,
            layer: 'solver_a_standard',
            layer_label: 'Solver A: Standard',
            layer_order: layerOrder,
            content: solverAResult,
            parallel_group: parallelGroup,
            status: 'complete',
            started_at: new Date(layerStart2).toISOString(),
            completed_at: new Date().toISOString(),
        }),
        supabase.from('thought_logs').insert({
            message_id: messageId,
            layer: 'solver_b_pessimist',
            layer_label: 'Solver B: Pessimist',
            layer_order: layerOrder,
            content: solverBResult,
            parallel_group: parallelGroup,
            status: 'complete',
            started_at: new Date(layerStart2).toISOString(),
            completed_at: new Date().toISOString(),
        }),
        supabase.from('thought_logs').insert({
            message_id: messageId,
            layer: 'solver_c_creative',
            layer_label: 'Solver C: Creative',
            layer_order: layerOrder,
            content: solverCResult,
            parallel_group: parallelGroup,
            status: 'complete',
            started_at: new Date(layerStart2).toISOString(),
            completed_at: new Date().toISOString(),
        }),
    ]).catch(e => console.warn('[Ultra-Solve] DB write failed (non-critical):', e));

    // ── Emit stage data for next function ───────────────
    sse.emitStageData({
        solver_a: solverAResult,
        solver_b: solverBResult,
        solver_c: solverCResult,
        layer_order: layerOrder,
        complexity,
    });
}

// ══════════════════════════════════════════════════════════════
// CONTINUATION HANDLER — Resume from checkpoint
// ══════════════════════════════════════════════════════════════

function handleUltraSolveContinuation(
    supabase: ReturnType<typeof createClient>,
    body: Record<string, unknown>
): Response {
    const {
        message_id: messageId,
        query,
        search_context: searchContext,
        sources,
        start_time: startTime,
        layer_order: layerOrder,
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
        checkpoint: { continue_from: string; decomposition: string };
    };

    const convCtx = conversationHistory || '';
    const contComplexity: Complexity = (body.complexity as Complexity) || 'high';

    const sse = new SSEStream();
    const response = sse.getResponse();

    (async () => {
        try {
            console.log(`[Ultra-Solve] Continuation from: ${checkpoint.continue_from}`);

            // Currently the only checkpoint is after decomposition → resume at solvers
            await runParallelSolvers(
                sse, supabase, messageId, query,
                checkpoint.decomposition, searchContext, convCtx, layerOrder, contComplexity
            );
        } catch (error) {
            console.error('Ultra-solve continuation error:', error);
            sse.emitError(error instanceof Error ? error.message : 'Unknown error');
        }
        sse.close();
    })();

    return response;
}
