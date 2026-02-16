// ============================================================
// DeepEx SSE Client
// Connects to the reasoning engine and processes events
// Supports chained Edge Functions for Ultra-Deep mode
// ============================================================

import type {
    SSEEvent,
    IntentMetadata,
    ThoughtLayer,
    ReasoningMode,
    Source,
} from '../types';

// ── Thinking State ───────────────────────────────────────────
export interface ThinkingStep {
    layer: ThoughtLayer;
    label: string;
    content: string;
    artifact: Record<string, unknown> | null;
    status: 'pending' | 'active' | 'complete';
    parallelGroup: string | null;
    startedAt: number;
    completedAt: number | null;
}

export interface StreamState {
    conversationId: string | null;
    messageId: string | null;
    mode: ReasoningMode | null;
    classification: IntentMetadata | null;
    steps: ThinkingStep[];
    finalContent: string;
    isThinking: boolean;
    isFinalizing: boolean;
    isComplete: boolean;
    wasEscalated: boolean;
    confidence: number | null;
    assumptions: string[];
    uncertaintyNotes: string[];
    sources: Source[];
    error: string | null;
}

export type StreamListener = (state: StreamState) => void;

// ── Initial State Factory ────────────────────────────────────
function createInitialState(): StreamState {
    return {
        conversationId: null,
        messageId: null,
        mode: null,
        classification: null,
        steps: [],
        finalContent: '',
        isThinking: false,
        isFinalizing: false,
        isComplete: false,
        wasEscalated: false,
        confidence: null,
        assumptions: [],
        uncertaintyNotes: [],
        sources: [],
        error: null,
    };
}

// ── SSE Client ───────────────────────────────────────────────
export class DeepExStreamClient {
    private supabaseUrl: string;
    private supabaseKey: string;
    private listeners: StreamListener[] = [];
    private state: StreamState = createInitialState();
    private abortController: AbortController | null = null;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: StreamListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    /**
     * Get the current stream state snapshot
     */
    getState(): StreamState {
        return { ...this.state, steps: [...this.state.steps] };
    }

    /**
     * Notify all listeners of state change
     */
    private notify(): void {
        const snapshot = { ...this.state, steps: [...this.state.steps] };
        this.listeners.forEach((l) => l(snapshot));
    }

    /**
     * Update state and notify
     */
    private updateState(partial: Partial<StreamState>): void {
        this.state = { ...this.state, ...partial };
        this.notify();
    }

    /**
     * Find or create a thinking step
     */
    private getOrCreateStep(layer: ThoughtLayer, label: string, parallelGroup?: string): ThinkingStep {
        let step = this.state.steps.find(
            (s) => s.layer === layer && s.status !== 'complete'
        );
        if (!step) {
            step = {
                layer,
                label,
                content: '',
                artifact: null,
                status: 'pending',
                parallelGroup: parallelGroup || null,
                startedAt: Date.now(),
                completedAt: null,
            };
            this.state.steps = [...this.state.steps, step];
        }
        return step;
    }

    /** Max retries per edge function call */
    private static readonly STAGE_MAX_RETRIES = 2;
    private static readonly STAGE_RETRY_DELAYS = [2000, 4000];

    /**
     * Read SSE events from an endpoint with retry logic.
     * Returns captured stage_data if any.
     * Retries on 502/503/504 and network errors.
     * Filters out SSE comment lines (heartbeat keepalive).
     */
    private async readSSEStream(
        endpoint: string,
        body: Record<string, unknown>,
        retryCount = 0
    ): Promise<Record<string, unknown> | null> {
        console.log(`[DeepEx] Calling ${endpoint}... (attempt ${retryCount + 1})`);

        try {
            const response = await fetch(
                `${this.supabaseUrl}/functions/v1/${endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.supabaseKey}`,
                        'apikey': this.supabaseKey,
                    },
                    body: JSON.stringify(body),
                    signal: this.abortController!.signal,
                }
            );

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error(`[DeepEx] ${endpoint} returned ${response.status}:`, errorText.slice(0, 300));

                // Retry on transient server errors
                if ([502, 503, 504, 500].includes(response.status) && retryCount < DeepExStreamClient.STAGE_MAX_RETRIES) {
                    const delay = DeepExStreamClient.STAGE_RETRY_DELAYS[retryCount];
                    console.warn(`[DeepEx] Retrying ${endpoint} in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return this.readSSEStream(endpoint, body, retryCount + 1);
                }

                throw new Error(`Server error from ${endpoint}: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';
            let stageData: Record<string, unknown> | null = null;
            let eventCount = 0;

            const processLine = (line: string) => {
                const trimmed = line.trim();
                // Skip empty lines and SSE comments (heartbeat keepalive)
                if (!trimmed || trimmed.startsWith(':')) return;
                if (!trimmed.startsWith('data:')) return;

                try {
                    const jsonStr = trimmed.startsWith('data: ')
                        ? trimmed.slice(6)
                        : trimmed.slice(5);
                    const event: SSEEvent = JSON.parse(jsonStr);
                    eventCount++;
                    if ((event as unknown as Record<string, unknown>).type === 'stage_data') {
                        console.log(`[DeepEx] Received stage_data from ${endpoint}`);
                        stageData = event as unknown as Record<string, unknown>;
                    } else {
                        this.processEvent(event);
                    }
                } catch (parseErr) {
                    // Only warn on actual data lines that fail to parse
                    if (trimmed.length > 10) {
                        console.warn(`[DeepEx] Parse error from ${endpoint}:`, trimmed.slice(0, 100));
                    }
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    processLine(line);
                }
            }

            // Flush remaining buffer
            buffer += decoder.decode();
            if (buffer.trim()) {
                const remaining = buffer.split('\n');
                for (const line of remaining) {
                    processLine(line);
                }
            }

            console.log(`[DeepEx] ${endpoint} complete. Events: ${eventCount}, stageData: ${stageData ? 'present' : 'null'}`);
            return stageData;
        } catch (error) {
            // Don't retry user-initiated aborts
            if ((error as Error).name === 'AbortError') throw error;

            // Retry network errors
            if (retryCount < DeepExStreamClient.STAGE_MAX_RETRIES) {
                const delay = DeepExStreamClient.STAGE_RETRY_DELAYS[retryCount];
                const errMsg = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
                console.warn(`[DeepEx] ${endpoint} failed: ${errMsg}. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                return this.readSSEStream(endpoint, body, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Start streaming a message — orchestrates chained functions
     */
    async streamMessage(
        conversationId: string,
        message: string,
        modeOverride?: ReasoningMode,
        imageUrl?: string,
        modelOverride?: string
    ): Promise<void> {
        // Reset state
        this.state = createInitialState();
        this.state.conversationId = conversationId;
        this.updateState({ isThinking: true });

        // Create abort controller
        this.abortController = new AbortController();

        try {
            // ── Stage 1: Classification + Instant/Deep (reasoning-engine) ──
            console.log('[DeepEx] Stage 1: calling reasoning-engine');
            let stageData = await this.readSSEStream('reasoning-engine', {
                conversation_id: conversationId,
                message,
                image_url: imageUrl,
                mode_override: modeOverride,
                model_override: modelOverride,
            });

            console.log('[DeepEx] Stage 1 complete. stageData:', stageData);

            // ── Handle deep mode continuations (checkpoint resume loop) ──
            let continuationCount = 0;
            const MAX_CONTINUATIONS = 10; // Safety limit
            while (
                stageData &&
                stageData.stage === 'continue_deep' &&
                continuationCount < MAX_CONTINUATIONS
            ) {
                continuationCount++;
                console.log(`[DeepEx] Deep continuation ${continuationCount}: resuming from ${(stageData.checkpoint as Record<string, unknown>)?.continue_from}`);
                stageData = await this.readSSEStream('reasoning-engine', stageData);
                console.log(`[DeepEx] Deep continuation ${continuationCount} complete. stageData:`, stageData);
            }

            // If stage_data says we need ultra-deep, chain the next functions
            if (stageData && stageData.stage === 'needs_ultra') {
                // ── Stage 2: Ultra-Deep Solve (Decomposition + 3 Solvers) ──
                console.log('[DeepEx] Stage 2: calling reasoning-ultra-solve');

                // Capture messageId early for fallback
                if (stageData.message_id) {
                    this.updateState({ messageId: stageData.message_id as string });
                }

                let solverStageData: Record<string, unknown> | null = null;

                try {
                    solverStageData = await this.readSSEStream('reasoning-ultra-solve', {
                        message_id: stageData.message_id,
                        query: stageData.query,
                        search_context: stageData.search_context,
                        sources: stageData.sources,
                        start_time: stageData.start_time,
                        layer_order: stageData.layer_order,
                        conversation_history: stageData.conversation_history,
                        complexity: stageData.complexity,
                        model_override: stageData.model_override,
                    });
                } catch (err) {
                    console.error('[DeepEx] Stage 2 (ultra-solve) failed:', err);
                    this.updateState({
                        error: `Ultra-Deep solver stage failed: ${(err as Error).message}`,
                    });
                }

                console.log('[DeepEx] Stage 2 complete. solverStageData:', solverStageData);

                // ── Handle ultra-solve continuations ──
                let solveContinuations = 0;
                while (
                    solverStageData &&
                    solverStageData.stage === 'continue_ultra_solve' &&
                    solveContinuations < MAX_CONTINUATIONS
                ) {
                    solveContinuations++;
                    console.log(`[DeepEx] Ultra-solve continuation ${solveContinuations}`);
                    try {
                        solverStageData = await this.readSSEStream('reasoning-ultra-solve', solverStageData);
                    } catch (err) {
                        console.error(`[DeepEx] Ultra-solve continuation ${solveContinuations} failed:`, err);
                        this.updateState({
                            error: `Ultra-Deep solver continuation failed: ${(err as Error).message}`,
                        });
                        break; // Stop continuations but keep flow
                    }
                    console.log(`[DeepEx] Ultra-solve continuation ${solveContinuations} complete.`);
                }

                if (solverStageData && solverStageData.solver_a !== undefined) {
                    // ── Stage 3: Ultra-Deep Synth (Skeptic + Verifier + Synthesizer + Final) ──
                    console.log('[DeepEx] Stage 3: calling reasoning-ultra-synth');

                    try {
                        let synthStageData = await this.readSSEStream('reasoning-ultra-synth', {
                            message_id: stageData.message_id,
                            query: stageData.query,
                            solver_a: solverStageData.solver_a,
                            solver_b: solverStageData.solver_b,
                            solver_c: solverStageData.solver_c,
                            search_context: stageData.search_context,
                            sources: stageData.sources,
                            start_time: stageData.start_time,
                            layer_order: solverStageData.layer_order,
                            conversation_history: stageData.conversation_history,
                            complexity: stageData.complexity,
                            model_override: stageData.model_override,
                        });

                        // ── Handle ultra-synth continuations ──
                        let synthContinuations = 0;
                        while (
                            synthStageData &&
                            synthStageData.stage === 'continue_ultra_synth' &&
                            synthContinuations < MAX_CONTINUATIONS
                        ) {
                            synthContinuations++;
                            console.log(`[DeepEx] Ultra-synth continuation ${synthContinuations}: resuming from ${(synthStageData.checkpoint as Record<string, unknown>)?.continue_from}`);
                            synthStageData = await this.readSSEStream('reasoning-ultra-synth', synthStageData);
                            console.log(`[DeepEx] Ultra-synth continuation ${synthContinuations} complete.`);
                        }

                        console.log('[DeepEx] Stage 3 complete.');
                    } catch (err) {
                        console.error('[DeepEx] Stage 3 (ultra-synth) failed:', err);
                        this.updateState({
                            error: `Ultra-Deep synthesis failed: ${(err as Error).message}`,
                            isThinking: false,
                            isFinalizing: false,
                        });
                    }
                } else {
                    console.error('[DeepEx] Stage 2 returned no solver results — cannot proceed to synthesis.', solverStageData);
                    this.updateState({
                        error: 'Ultra-Deep reasoning failed: solvers did not return results.',
                        isThinking: false,
                        isFinalizing: false,
                    });
                }
            }

            // Mark complete if not already
            if (!this.state.isComplete) {
                console.warn(`[DeepEx] Stream ended but isComplete=false. finalContent: ${this.state.finalContent.length} chars, messageId: ${this.state.messageId}, error: ${this.state.error}`);
                // If we got no final content, try fetching from DB as fallback.
                const fallbackId = (stageData?.message_id as string) || this.state.messageId;
                if (!this.state.finalContent && fallbackId) {
                    console.warn('[DeepEx] No final content received — attempting DB fallback with retries...');
                    // Poll DB up to 3 times with 3s delay (edge function may still be writing)
                    for (let attempt = 0; attempt < 3; attempt++) {
                        if (attempt > 0) {
                            console.log(`[DeepEx] DB fallback attempt ${attempt + 1}/3, waiting 3s...`);
                            await new Promise(r => setTimeout(r, 3000));
                        }
                        try {
                            const dbResp = await fetch(
                                `${this.supabaseUrl}/rest/v1/messages?id=eq.${fallbackId}&select=content,confidence_score,assumptions,uncertainty_notes,sources`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${this.supabaseKey}`,
                                        'apikey': this.supabaseKey,
                                    },
                                }
                            );
                            if (dbResp.ok) {
                                const rows = await dbResp.json();
                                if (rows?.[0]?.content) {
                                    console.log(`[DeepEx] DB fallback succeeded on attempt ${attempt + 1}: ${rows[0].content.length} chars`);
                                    this.updateState({
                                        finalContent: rows[0].content,
                                        confidence: rows[0].confidence_score ?? null,
                                        assumptions: rows[0].assumptions || [],
                                        uncertaintyNotes: rows[0].uncertainty_notes || [],
                                        sources: rows[0].sources || [],
                                        isComplete: true,
                                        isThinking: false,
                                        isFinalizing: false,
                                    });
                                    return;
                                } else {
                                    console.warn(`[DeepEx] DB fallback attempt ${attempt + 1}: content still empty`);
                                }
                            }
                        } catch (dbErr) {
                            console.error(`[DeepEx] DB fallback attempt ${attempt + 1} failed:`, dbErr);
                        }
                    }
                } else if (!this.state.finalContent && !fallbackId) {
                    console.warn('[DeepEx] No finalContent and no fallbackId — cannot recover');
                }

                this.updateState({ isComplete: true, isThinking: false, isFinalizing: false });
            } else {
                console.log(`[DeepEx] Stream ended normally. isComplete=true, finalContent: ${this.state.finalContent.length} chars`);
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            console.error('[DeepEx] streamMessage caught error:', error);
            this.updateState({
                error: error instanceof Error ? error.message : 'Connection failed',
                isThinking: false,
                isFinalizing: false,
            });
        }
    }

    /**
     * Process a single SSE event
     */
    private processEvent(event: SSEEvent): void {
        switch (event.type) {
            case 'classification':
                if (event.metadata) {
                    this.updateState({ classification: event.metadata });
                }
                break;

            case 'mode_selected':
                if (event.mode) {
                    this.updateState({ mode: event.mode });
                }
                break;

            case 'layer_start': {
                if (event.layer) {
                    const step = this.getOrCreateStep(
                        event.layer,
                        event.layer_label || event.layer,
                        event.parallel_group
                    );
                    step.status = 'active';
                    this.notify();
                }
                break;
            }

            case 'layer_chunk': {
                if (event.layer && event.content) {
                    const step = this.state.steps.find(
                        (s) => s.layer === event.layer && s.status === 'active'
                    );
                    if (step) {
                        step.content += event.content;
                        this.notify();
                    }
                }
                break;
            }

            case 'layer_artifact': {
                if (event.layer && event.artifact) {
                    const step = this.state.steps.find(
                        (s) => s.layer === event.layer && (s.status === 'active' || s.status === 'pending')
                    );
                    if (step) {
                        step.artifact = event.artifact;
                        this.notify();
                    }
                }
                break;
            }

            case 'layer_complete': {
                if (event.layer) {
                    const step = this.state.steps.find(
                        (s) => s.layer === event.layer && s.status === 'active'
                    );
                    if (step) {
                        step.status = 'complete';
                        step.completedAt = Date.now();
                        this.notify();
                    }
                }
                break;
            }

            case 'escalation':
                this.updateState({ wasEscalated: true, mode: 'ultra_deep' });
                break;

            case 'parallel_start':
                // UI can use this to switch to triple-column layout
                this.notify();
                break;

            case 'final_start':
                console.log(`[DeepEx] final_start received. messageId: ${event.message_id}`);
                if (event.message_id) {
                    this.updateState({
                        messageId: event.message_id,
                        isFinalizing: true,
                        isThinking: false,
                    });
                }
                break;

            case 'final_chunk':
                if (event.content) {
                    console.log(`[DeepEx] final_chunk received (${event.content.length} chars). Total: ${this.state.finalContent.length + event.content.length}`);
                    this.updateState({
                        finalContent: this.state.finalContent + event.content,
                    });
                }
                break;

            case 'final_complete':
                console.log(`[DeepEx] final_complete received. confidence: ${event.confidence}, finalContent length: ${this.state.finalContent.length}`);
                this.updateState({
                    isComplete: true,
                    isFinalizing: false,
                    isThinking: false,
                    confidence: event.confidence || null,
                    assumptions: event.assumptions || [],
                    uncertaintyNotes: event.uncertainty_notes || [],
                    sources: event.sources || [],
                });
                break;

            case 'error':
                console.error(`[DeepEx] Error event received: ${event.error}`);
                this.updateState({
                    error: event.error || 'Unknown error',
                    isThinking: false,
                    isFinalizing: false,
                });
                break;
        }
    }

    /**
     * Cancel the current stream
     */
    cancel(): void {
        this.abortController?.abort();
        this.updateState({
            isThinking: false,
            isFinalizing: false,
        });
    }
}
