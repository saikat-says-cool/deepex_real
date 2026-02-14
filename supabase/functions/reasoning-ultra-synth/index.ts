// ============================================================
// DeepEx Ultra-Deep Synth — Stage 2
// Skeptic + Verifier + Synthesizer + Meta-Critic + Final
// Supports time-aware checkpointing for resumption
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SSEStream } from '../_shared/sse-stream.ts';
import { longcatComplete, longcatStream, MODELS } from '../_shared/longcat-client.ts';
import * as prompts from '../_shared/prompts.ts';
import type { SkepticReport, ConfidenceResult, Source } from '../_shared/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Time budget: checkpoint if we exceed 80% of the 150s limit
const TIMEOUT_BUDGET_MS = 120_000;

// ── Checkpoint type ──────────────────────────────────────────
interface SynthCheckpoint {
    continue_from: 'verifier' | 'synthesizer' | 'meta_critic' | 'confidence';
    skeptic_report?: string;
    verifier_report?: string;
    synthesized_answer?: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        const body = await req.json();

        // ── Handle continuation (checkpoint resume) ─────────
        if (body.stage === 'continue_ultra_synth') {
            return handleUltraSynthContinuation(supabase, body);
        }

        const {
            message_id: messageId,
            query,
            solver_a: solverAResult,
            solver_b: solverBResult,
            solver_c: solverCResult,
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

        // Helper: check if we're running hot on time
        const isRunningHot = () => (Date.now() - functionStart) > TIMEOUT_BUDGET_MS;

        // Helper: build common checkpoint base
        const checkpointBase = () => ({
            stage: 'continue_ultra_synth' as const,
            message_id: messageId,
            query,
            solver_a: solverAResult,
            solver_b: solverBResult,
            solver_c: solverCResult,
            search_context: searchContext,
            sources,
            start_time: startTime,
            layer_order: layerOrder,
            conversation_history: conversationHistory,
        });

        (async () => {
            try {
                // ── Layer 3: Skeptic Agent ───────────────────────────
                sse.emitLayerStart('skeptic_agent', 'Adversarial Analysis');
                layerOrder++;
                const layerStart3 = Date.now();

                const skepticResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.SKEPTIC_SYSTEM },
                        {
                            role: 'user',
                            content: prompts.skepticUserPrompt(query, solverAResult, solverBResult, solverCResult),
                        },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
                );

                let skepticReport: SkepticReport;
                try {
                    skepticReport = JSON.parse(skepticResult.content);
                } catch {
                    skepticReport = { contradictions: [], weak_points: [], unresolved_questions: [] };
                }
                const skepticStr = JSON.stringify(skepticReport, null, 2);

                sse.emitLayerChunk('skeptic_agent', skepticResult.content);
                sse.emitLayerArtifact('skeptic_agent', skepticReport as unknown as Record<string, unknown>);

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'skeptic_agent',
                    layer_label: 'Skeptic Agent',
                    layer_order: layerOrder,
                    content: skepticResult.content,
                    artifact: skepticReport as unknown as Record<string, unknown>,
                    status: 'complete',
                    started_at: new Date(layerStart3).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerComplete('skeptic_agent', 'Adversarial Analysis');

                // ── Time check: after skeptic ───────────────────────
                if (isRunningHot()) {
                    console.log('[Ultra-Synth] Running hot after skeptic, checkpointing...');
                    sse.emitStageData({
                        ...checkpointBase(),
                        checkpoint: { continue_from: 'verifier', skeptic_report: skepticStr },
                    });
                    sse.close();
                    return;
                }

                // ── Layer 4: Verifier Agent ──────────────────────────
                sse.emitLayerStart('verifier_agent', 'Logical Verification');
                layerOrder++;
                const layerStart4 = Date.now();

                const allSolutions = `SOLUTION A:\n${solverAResult}\n\nSOLUTION B:\n${solverBResult}\n\nSOLUTION C:\n${solverCResult}`;

                const verifierResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.VERIFIER_SYSTEM },
                        { role: 'user', content: prompts.verifierUserPrompt(allSolutions, skepticStr) },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
                );

                let verificationReport: Record<string, unknown>;
                try {
                    verificationReport = JSON.parse(verifierResult.content);
                } catch {
                    verificationReport = {
                        logical_flow_valid: true,
                        assumption_issues: [],
                        consistency_issues: [],
                        overall_validity: 'partially_valid',
                    };
                }
                const verifierStr = JSON.stringify(verificationReport, null, 2);

                sse.emitLayerChunk('verifier_agent', verifierResult.content);
                sse.emitLayerArtifact('verifier_agent', verificationReport);

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'verifier_agent',
                    layer_label: 'Logical Verifier',
                    layer_order: layerOrder,
                    content: verifierResult.content,
                    artifact: verificationReport,
                    status: 'complete',
                    started_at: new Date(layerStart4).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerComplete('verifier_agent', 'Logical Verification');

                // ── Time check: after verifier ──────────────────────
                if (isRunningHot()) {
                    console.log('[Ultra-Synth] Running hot after verifier, checkpointing...');
                    sse.emitStageData({
                        ...checkpointBase(),
                        checkpoint: {
                            continue_from: 'synthesizer',
                            skeptic_report: skepticStr,
                            verifier_report: verifierStr,
                        },
                    });
                    sse.close();
                    return;
                }

                // ── Layer 5: Synthesizer (Streaming) ─────────────────
                const synthResult = await runSynthesizer(
                    sse, supabase, messageId, query,
                    solverAResult, solverBResult, solverCResult,
                    skepticStr, verifierStr, searchContext, convCtx, layerOrder
                );
                layerOrder = synthResult.layerOrder;

                // ── Time check: after synthesizer ───────────────────
                if (isRunningHot()) {
                    console.log('[Ultra-Synth] Running hot after synthesizer, checkpointing...');
                    sse.emitStageData({
                        ...checkpointBase(),
                        checkpoint: {
                            continue_from: 'meta_critic',
                            skeptic_report: skepticStr,
                            verifier_report: verifierStr,
                            synthesized_answer: synthResult.answer,
                        },
                    });
                    sse.close();
                    return;
                }

                // ── Layers 6-7: Meta-Critic + Confidence + Final ────
                await runMetaCriticAndFinalize(
                    sse, supabase, messageId, query,
                    solverAResult, solverBResult, solverCResult,
                    skepticStr, verifierStr, searchContext, sources as Source[],
                    startTime, convCtx, layerOrder, synthResult.answer,
                    () => (Date.now() - functionStart) > TIMEOUT_BUDGET_MS,
                    checkpointBase
                );

            } catch (error) {
                console.error('Ultra-synth error:', error);
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
// SYNTHESIZER — Shared logic
// ══════════════════════════════════════════════════════════════

async function runSynthesizer(
    sse: SSEStream,
    supabase: ReturnType<typeof createClient>,
    messageId: string,
    query: string,
    solverAResult: string,
    solverBResult: string,
    solverCResult: string,
    skepticStr: string,
    verifierStr: string,
    searchContext: string,
    convCtx: string,
    layerOrder: number,
): Promise<{ answer: string; layerOrder: number }> {
    sse.emitLayerStart('synthesizer', 'Synthesizing Final Answer');
    layerOrder++;
    const layerStart5 = Date.now();

    let synthesizedAnswer = '';
    for await (const chunk of longcatStream(
        [
            { role: 'system', content: prompts.SYNTHESIZER_SYSTEM + convCtx },
            {
                role: 'user',
                content: prompts.synthesizerUserPrompt(
                    query, solverAResult, solverBResult, solverCResult,
                    skepticStr, verifierStr, searchContext
                ),
            },
        ],
        { model: MODELS.FLASH_THINKING, temperature: 0.4 }
    )) {
        if (chunk.content) {
            synthesizedAnswer += chunk.content;
            sse.emitLayerChunk('synthesizer', chunk.content);
        }
    }

    // Fallback if streaming failed
    if (!synthesizedAnswer) {
        const fallback = await longcatComplete(
            [
                { role: 'system', content: prompts.SYNTHESIZER_SYSTEM },
                {
                    role: 'user',
                    content: prompts.synthesizerUserPrompt(
                        query, solverAResult, solverBResult, solverCResult,
                        skepticStr, verifierStr, searchContext
                    ),
                },
            ],
            { model: MODELS.FLASH_THINKING, temperature: 0.4 }
        );
        synthesizedAnswer = fallback.content || '';
        if (synthesizedAnswer) {
            sse.emitLayerChunk('synthesizer', synthesizedAnswer);
        }
    }

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'synthesizer',
        layer_label: 'Answer Synthesizer',
        layer_order: layerOrder,
        content: synthesizedAnswer,
        status: 'complete',
        started_at: new Date(layerStart5).toISOString(),
        completed_at: new Date().toISOString(),
    });

    sse.emitLayerComplete('synthesizer', 'Synthesizing Final Answer');

    return { answer: synthesizedAnswer, layerOrder };
}

// ══════════════════════════════════════════════════════════════
// META-CRITIC + FINALIZE — Shared logic
// ══════════════════════════════════════════════════════════════

async function runMetaCriticAndFinalize(
    sse: SSEStream,
    supabase: ReturnType<typeof createClient>,
    messageId: string,
    query: string,
    solverAResult: string,
    solverBResult: string,
    solverCResult: string,
    skepticStr: string,
    verifierStr: string,
    searchContext: string,
    sources: Source[],
    startTime: number,
    convCtx: string,
    layerOrder: number,
    synthesizedAnswer: string,
    isRunningHot: () => boolean,
    checkpointBase: () => Record<string, unknown>,
): Promise<void> {
    // ── Layer 6: Meta-Critic ─────────────────────────────
    sse.emitLayerStart('meta_critic', 'Final Quality Check');
    layerOrder++;
    const layerStart6 = Date.now();

    const metaCriticResult = await longcatComplete(
        [
            { role: 'system', content: prompts.META_CRITIC_SYSTEM },
            { role: 'user', content: prompts.metaCriticUserPrompt(query, synthesizedAnswer) },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 }
    );

    let metaCritic: { fully_answers_user: boolean; missing_elements: string[]; quality_assessment: string };
    try {
        metaCritic = JSON.parse(metaCriticResult.content);
    } catch {
        metaCritic = { fully_answers_user: true, missing_elements: [], quality_assessment: 'Good' };
    }

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'meta_critic',
        layer_label: 'Meta-Critic',
        layer_order: layerOrder,
        content: JSON.stringify(metaCritic, null, 2),
        artifact: metaCritic as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date(layerStart6).toISOString(),
        completed_at: new Date().toISOString(),
    });

    sse.emitLayerArtifact('meta_critic', metaCritic as unknown as Record<string, unknown>);
    sse.emitLayerComplete('meta_critic', 'Final Quality Check');

    // ── Meta-Critic Loop (one retry if needed) ───────────
    if (!metaCritic.fully_answers_user && metaCritic.missing_elements.length > 0) {
        // ── Time check before re-synthesis ──────────────
        if (isRunningHot()) {
            console.log('[Ultra-Synth] Running hot before re-synth, checkpointing...');
            sse.emitStageData({
                ...checkpointBase(),
                checkpoint: {
                    continue_from: 'confidence',
                    skeptic_report: skepticStr,
                    verifier_report: verifierStr,
                    synthesized_answer: synthesizedAnswer,
                } as SynthCheckpoint,
            });
            return;
        }

        sse.emitLayerStart('synthesizer', 'Re-synthesizing with Feedback');
        layerOrder++;
        const resynStart = Date.now();

        let resynthesized = '';
        for await (const chunk of longcatStream(
            [
                { role: 'system', content: prompts.SYNTHESIZER_SYSTEM + convCtx },
                {
                    role: 'user',
                    content: `${prompts.synthesizerUserPrompt(
                        query, solverAResult, solverBResult, solverCResult,
                        skepticStr, verifierStr, searchContext
                    )}\n\n--- META-CRITIC FEEDBACK ---\nMissing elements: ${metaCritic.missing_elements.join(', ')}\nPlease address these gaps.`,
                },
            ],
            { model: MODELS.FLASH_THINKING, temperature: 0.4 }
        )) {
            if (chunk.content) {
                resynthesized += chunk.content;
                sse.emitLayerChunk('synthesizer', chunk.content);
            }
        }

        if (resynthesized) {
            synthesizedAnswer = resynthesized;
        }

        await supabase.from('thought_logs').insert({
            message_id: messageId,
            layer: 'synthesizer',
            layer_label: 'Re-Synthesis',
            layer_order: layerOrder,
            content: synthesizedAnswer,
            status: 'complete',
            started_at: new Date(resynStart).toISOString(),
            completed_at: new Date().toISOString(),
        });

        sse.emitLayerComplete('synthesizer', 'Re-synthesizing with Feedback');
    }

    // ── Time check before confidence ────────────────────
    if (isRunningHot()) {
        console.log('[Ultra-Synth] Running hot before confidence, checkpointing...');
        sse.emitStageData({
            ...checkpointBase(),
            checkpoint: {
                continue_from: 'confidence',
                skeptic_report: skepticStr,
                verifier_report: verifierStr,
                synthesized_answer: synthesizedAnswer,
            } as SynthCheckpoint,
        });
        return;
    }

    // ── Layer 7: Final Confidence ────────────────────────
    await runFinalConfidenceAndEmit(
        sse, supabase, messageId, query,
        synthesizedAnswer, sources, startTime, layerOrder
    );
}

// ══════════════════════════════════════════════════════════════
// FINAL CONFIDENCE + EMIT — Shared logic
// ══════════════════════════════════════════════════════════════

async function runFinalConfidenceAndEmit(
    sse: SSEStream,
    supabase: ReturnType<typeof createClient>,
    messageId: string,
    query: string,
    synthesizedAnswer: string,
    sources: Source[],
    startTime: number,
    layerOrder: number,
): Promise<void> {
    sse.emitLayerStart('ultra_confidence', 'Final Confidence Assessment');
    layerOrder++;

    const finalConfResult = await longcatComplete(
        [
            { role: 'system', content: prompts.CONFIDENCE_SYSTEM },
            { role: 'user', content: prompts.confidenceUserPrompt(query, synthesizedAnswer) },
        ],
        { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 }
    );

    let finalConfidence: ConfidenceResult;
    try {
        finalConfidence = JSON.parse(finalConfResult.content);
    } catch {
        finalConfidence = { score: 80, assumptions: [], uncertainty_notes: [] };
    }

    await supabase.from('thought_logs').insert({
        message_id: messageId,
        layer: 'ultra_confidence',
        layer_label: 'Final Confidence',
        layer_order: layerOrder,
        content: `Confidence: ${finalConfidence.score}/100`,
        artifact: finalConfidence as unknown as Record<string, unknown>,
        status: 'complete',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
    });

    sse.emitLayerArtifact('ultra_confidence', finalConfidence as unknown as Record<string, unknown>);
    sse.emitLayerComplete('ultra_confidence', 'Final Confidence Assessment');

    // ── Emit Final Answer ────────────────────────────────
    sse.emitFinalStart(messageId);
    const chunkSize = 8;
    for (let i = 0; i < synthesizedAnswer.length; i += chunkSize) {
        sse.emitFinalChunk(synthesizedAnswer.slice(i, i + chunkSize));
    }

    // Save to DB
    await supabase
        .from('messages')
        .update({
            content: synthesizedAnswer,
            confidence_score: finalConfidence.score,
            assumptions: finalConfidence.assumptions,
            uncertainty_notes: finalConfidence.uncertainty_notes,
            sources: sources?.length ? sources : null,
            total_thinking_time_ms: Date.now() - startTime,
        })
        .eq('id', messageId);

    sse.emitFinalComplete(
        finalConfidence.score,
        finalConfidence.assumptions,
        finalConfidence.uncertainty_notes,
        sources?.length ? sources : undefined
    );
}

// ══════════════════════════════════════════════════════════════
// CONTINUATION HANDLER — Resume from checkpoint
// ══════════════════════════════════════════════════════════════

function handleUltraSynthContinuation(
    supabase: ReturnType<typeof createClient>,
    body: Record<string, unknown>
): Response {
    const {
        message_id: messageId,
        query,
        solver_a: solverAResult,
        solver_b: solverBResult,
        solver_c: solverCResult,
        search_context: searchContext,
        sources,
        start_time: startTime,
        layer_order: initialLayerOrder,
        conversation_history: conversationHistory,
        checkpoint,
    } = body as {
        message_id: string;
        query: string;
        solver_a: string;
        solver_b: string;
        solver_c: string;
        search_context: string;
        sources: Source[];
        start_time: number;
        layer_order: number;
        conversation_history: string;
        checkpoint: SynthCheckpoint;
    };

    const convCtx = conversationHistory || '';
    const continuationStart = Date.now();

    const sse = new SSEStream();
    const response = sse.getResponse();
    let layerOrder = initialLayerOrder || 0;

    const isRunningHot = () => (Date.now() - continuationStart) > TIMEOUT_BUDGET_MS;

    const checkpointBase = () => ({
        stage: 'continue_ultra_synth' as const,
        message_id: messageId,
        query,
        solver_a: solverAResult,
        solver_b: solverBResult,
        solver_c: solverCResult,
        search_context: searchContext,
        sources,
        start_time: startTime,
        layer_order: layerOrder,
        conversation_history: conversationHistory,
    });

    (async () => {
        try {
            let skepticStr = checkpoint.skeptic_report || '{}';
            let verifierStr = checkpoint.verifier_report || '{}';
            let synthesizedAnswer = checkpoint.synthesized_answer || '';

            console.log(`[Ultra-Synth] Continuation from: ${checkpoint.continue_from}`);

            // ── Verifier (if needed) ─────────────────────────────
            if (checkpoint.continue_from === 'verifier') {
                sse.emitLayerStart('verifier_agent', 'Logical Verification');
                layerOrder++;
                const layerStart = Date.now();

                const allSolutions = `SOLUTION A:\n${solverAResult}\n\nSOLUTION B:\n${solverBResult}\n\nSOLUTION C:\n${solverCResult}`;

                const verifierResult = await longcatComplete(
                    [
                        { role: 'system', content: prompts.VERIFIER_SYSTEM },
                        { role: 'user', content: prompts.verifierUserPrompt(allSolutions, skepticStr) },
                    ],
                    { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 }
                );

                let verificationReport: Record<string, unknown>;
                try {
                    verificationReport = JSON.parse(verifierResult.content);
                } catch {
                    verificationReport = {
                        logical_flow_valid: true, assumption_issues: [],
                        consistency_issues: [], overall_validity: 'partially_valid',
                    };
                }
                verifierStr = JSON.stringify(verificationReport, null, 2);

                sse.emitLayerChunk('verifier_agent', verifierResult.content);
                sse.emitLayerArtifact('verifier_agent', verificationReport);

                await supabase.from('thought_logs').insert({
                    message_id: messageId,
                    layer: 'verifier_agent',
                    layer_label: 'Logical Verifier',
                    layer_order: layerOrder,
                    content: verifierResult.content,
                    artifact: verificationReport,
                    status: 'complete',
                    started_at: new Date(layerStart).toISOString(),
                    completed_at: new Date().toISOString(),
                });

                sse.emitLayerComplete('verifier_agent', 'Logical Verification');

                if (isRunningHot()) {
                    sse.emitStageData({
                        ...checkpointBase(),
                        checkpoint: {
                            continue_from: 'synthesizer',
                            skeptic_report: skepticStr,
                            verifier_report: verifierStr,
                        },
                    });
                    sse.close();
                    return;
                }
            }

            // ── Synthesizer (if needed) ──────────────────────────
            if (['verifier', 'synthesizer'].includes(checkpoint.continue_from)) {
                const synthResult = await runSynthesizer(
                    sse, supabase, messageId, query,
                    solverAResult, solverBResult, solverCResult,
                    skepticStr, verifierStr, searchContext, convCtx, layerOrder
                );
                layerOrder = synthResult.layerOrder;
                synthesizedAnswer = synthResult.answer;

                if (isRunningHot()) {
                    sse.emitStageData({
                        ...checkpointBase(),
                        checkpoint: {
                            continue_from: 'meta_critic',
                            skeptic_report: skepticStr,
                            verifier_report: verifierStr,
                            synthesized_answer: synthesizedAnswer,
                        },
                    });
                    sse.close();
                    return;
                }
            }

            // ── Meta-Critic + Finalize (if needed) ───────────────
            if (['verifier', 'synthesizer', 'meta_critic'].includes(checkpoint.continue_from)) {
                await runMetaCriticAndFinalize(
                    sse, supabase, messageId, query,
                    solverAResult, solverBResult, solverCResult,
                    skepticStr, verifierStr, searchContext, sources,
                    startTime, convCtx, layerOrder, synthesizedAnswer,
                    isRunningHot, checkpointBase
                );
            } else if (checkpoint.continue_from === 'confidence') {
                // Jump straight to confidence
                await runFinalConfidenceAndEmit(
                    sse, supabase, messageId, query,
                    synthesizedAnswer, sources, startTime, layerOrder
                );
            }

        } catch (error) {
            console.error('Ultra-synth continuation error:', error);
            sse.emitError(error instanceof Error ? error.message : 'Unknown error');
        }
        sse.close();
    })();

    return response;
}
