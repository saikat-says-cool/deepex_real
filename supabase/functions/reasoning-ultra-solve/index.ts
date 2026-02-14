// ============================================================
// DeepEx Ultra-Deep Solve — Stage 1
// Decomposition + 3 Parallel Solvers (FLASH_THINKING)
// Supports time-aware checkpointing for resumption
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SSEStream } from '../_shared/sse-stream.ts';
import { longcatComplete, longcatStream, MODELS } from '../_shared/longcat-client.ts';
import * as prompts from '../_shared/prompts.ts';
import type { Source } from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Time budget: checkpoint if we exceed 80% of the 150s limit
const TIMEOUT_BUDGET_MS = 120_000;

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

                const deepDecompResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.DEEP_DECOMPOSITION_SYSTEM },
                        { role: 'user', content: prompts.decompositionUserPrompt(query, searchContext) + convCtx },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
                );

                let deepProblemMap: Record<string, unknown>;
                try {
                    deepProblemMap = JSON.parse(deepDecompResult.content);
                } catch {
                    deepProblemMap = { intent: query, facts: [], constraints: [], unknowns: [] };
                }

                const deepMapStr = JSON.stringify(deepProblemMap, null, 2);

                sse.emitLayerChunk('deep_decomposition', deepDecompResult.content);

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'deep_decomposition',
                    layer_label: 'Deep Problem Analysis',
                    layer_order: layerOrder,
                    content: deepDecompResult.content,
                    artifact: deepProblemMap,
                    status: 'complete',
                    started_at: new Date(layerStart1).toISOString(),
                    completed_at: new Date().toISOString(),
                });

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
                        checkpoint: {
                            continue_from: 'solvers',
                            decomposition: deepMapStr,
                        },
                    });
                    sse.close();
                    return;
                }

                // ── Layer 2: Triple Parallel Solvers ─────────────────
                await runParallelSolvers(sse, supabase, messageId, query, deepMapStr, searchContext, convCtx, layerOrder);

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
): Promise<void> {
    sse.emitParallelStart();
    layerOrder++;

    const solverPrompt = prompts.solverUserPrompt(query, deepMapStr, searchContext);
    const parallelGroup = 'ultra_solvers';

    sse.emitLayerStart('solver_a_standard', 'Standard Reasoner', parallelGroup);
    sse.emitLayerStart('solver_b_pessimist', 'Failure Mode Analysis', parallelGroup);
    sse.emitLayerStart('solver_c_creative', 'Creative Alternatives', parallelGroup);

    const layerStart2 = Date.now();

    // Run all three in parallel with FLASH_THINKING
    const [solverAResult, solverBResult, solverCResult] = await Promise.all([
        // Solver A: Standard
        (async () => {
            let content = '';
            for await (const chunk of longcatStream(
                [
                    { role: 'system', content: prompts.SOLVER_A_SYSTEM + convCtx },
                    { role: 'user', content: solverPrompt },
                ],
                { model: MODELS.FLASH_THINKING, temperature: 0.3, enableThinking: true, thinkingBudget: 4096 }
            )) {
                if (chunk.content) {
                    content += chunk.content;
                    sse.emitLayerChunk('solver_a_standard', chunk.content, parallelGroup);
                }
            }
            return content;
        })(),
        // Solver B: Pessimist
        (async () => {
            let content = '';
            for await (const chunk of longcatStream(
                [
                    { role: 'system', content: prompts.SOLVER_B_SYSTEM + convCtx },
                    { role: 'user', content: solverPrompt },
                ],
                { model: MODELS.FLASH_THINKING, temperature: 0.5, enableThinking: true, thinkingBudget: 4096 }
            )) {
                if (chunk.content) {
                    content += chunk.content;
                    sse.emitLayerChunk('solver_b_pessimist', chunk.content, parallelGroup);
                }
            }
            return content;
        })(),
        // Solver C: Creative
        (async () => {
            let content = '';
            for await (const chunk of longcatStream(
                [
                    { role: 'system', content: prompts.SOLVER_C_SYSTEM + convCtx },
                    { role: 'user', content: solverPrompt },
                ],
                { model: MODELS.FLASH_THINKING, temperature: 0.8, enableThinking: true, thinkingBudget: 4096 }
            )) {
                if (chunk.content) {
                    content += chunk.content;
                    sse.emitLayerChunk('solver_c_creative', chunk.content, parallelGroup);
                }
            }
            return content;
        })(),
    ]);

    // Mark solvers complete
    sse.emitLayerComplete('solver_a_standard', 'Standard Reasoner');
    sse.emitLayerComplete('solver_b_pessimist', 'Failure Mode Analysis');
    sse.emitLayerComplete('solver_c_creative', 'Creative Alternatives');

    // Save solver thought logs in parallel
    await Promise.all([
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
    ]);

    // ── Emit stage data for next function ───────────────
    sse.emitStageData({
        solver_a: solverAResult,
        solver_b: solverBResult,
        solver_c: solverCResult,
        layer_order: layerOrder,
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

    const sse = new SSEStream();
    const response = sse.getResponse();

    (async () => {
        try {
            console.log(`[Ultra-Solve] Continuation from: ${checkpoint.continue_from}`);

            // Currently the only checkpoint is after decomposition → resume at solvers
            await runParallelSolvers(
                sse, supabase, messageId, query,
                checkpoint.decomposition, searchContext, convCtx, layerOrder
            );
        } catch (error) {
            console.error('Ultra-solve continuation error:', error);
            sse.emitError(error instanceof Error ? error.message : 'Unknown error');
        }
        sse.close();
    })();

    return response;
}
