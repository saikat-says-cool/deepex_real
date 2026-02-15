// ============================================================
// SSE Stream Helper — ULTRA RESILIENT
// Creates a Server-Sent Events stream from the Edge Function
// Features: heartbeat keepalive to prevent proxy timeouts,
// safe emit (never throws), idempotent close
// ============================================================

import type { SSEEvent, SSEEventType, ThoughtLayer, ReasoningMode, IntentMetadata, Source } from './types.ts';

/**
 * SSE Stream Controller with heartbeat keepalive.
 * Sends a comment line every 10s to prevent proxies/CDNs
 * from killing idle connections.
 */
export class SSEStream {
    private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    private encoder = new TextEncoder();
    private closed = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    public stream: ReadableStream<Uint8Array>;

    constructor() {
        this.stream = new ReadableStream({
            start: (controller) => {
                this.controller = controller;
                // Start heartbeat: send a SSE comment every 10s to keep connection alive
                this.heartbeatTimer = setInterval(() => {
                    this.sendRaw(': heartbeat\n\n');
                }, 10_000);
            },
            cancel: () => {
                this.stopHeartbeat();
            },
        });
    }

    /** Send raw bytes — safe, never throws */
    private sendRaw(text: string): void {
        if (this.closed || !this.controller) return;
        try {
            this.controller.enqueue(this.encoder.encode(text));
        } catch {
            // Stream already closed — ignore
        }
    }

    /** Stop the heartbeat timer */
    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Emit a raw SSE event — safe, never throws
     */
    private emit(event: SSEEvent): void {
        if (this.closed) return;
        const data = `data: ${JSON.stringify(event)}\n\n`;
        this.sendRaw(data);
    }

    /**
     * Phase 0: Cortex classification result
     */
    emitClassification(metadata: IntentMetadata): void {
        this.emit({
            type: 'classification',
            metadata,
            timestamp: Date.now(),
        });
    }

    /**
     * Mode has been selected
     */
    emitModeSelected(mode: ReasoningMode): void {
        this.emit({
            type: 'mode_selected',
            mode,
            timestamp: Date.now(),
        });
    }

    /**
     * A thinking layer has started
     */
    emitLayerStart(layer: ThoughtLayer, label: string, parallelGroup?: string): void {
        this.emit({
            type: 'layer_start',
            layer,
            layer_label: label,
            parallel_group: parallelGroup,
            timestamp: Date.now(),
        });
    }

    /**
     * Stream a chunk of reasoning text from a layer
     */
    emitLayerChunk(layer: ThoughtLayer, content: string, parallelGroup?: string): void {
        this.emit({
            type: 'layer_chunk',
            layer,
            content,
            parallel_group: parallelGroup,
            timestamp: Date.now(),
        });
    }

    /**
     * Emit a structured artifact from a layer
     */
    emitLayerArtifact(layer: ThoughtLayer, artifact: Record<string, unknown>): void {
        this.emit({
            type: 'layer_artifact',
            layer,
            artifact,
            timestamp: Date.now(),
        });
    }

    /**
     * Mark a layer as complete
     */
    emitLayerComplete(layer: ThoughtLayer, label: string): void {
        this.emit({
            type: 'layer_complete',
            layer,
            layer_label: label,
            timestamp: Date.now(),
        });
    }

    /**
     * Escalation from Deep → Ultra-Deep triggered
     */
    emitEscalation(reason: string): void {
        this.emit({
            type: 'escalation',
            content: reason,
            timestamp: Date.now(),
        });
    }

    /**
     * Triple parallel solvers are starting
     */
    emitParallelStart(): void {
        this.emit({
            type: 'parallel_start',
            parallel_group: 'ultra_solvers',
            timestamp: Date.now(),
        });
    }

    /**
     * Final answer is starting to stream
     */
    emitFinalStart(messageId: string): void {
        this.emit({
            type: 'final_start',
            message_id: messageId,
            timestamp: Date.now(),
        });
    }

    /**
     * Stream a chunk of the final answer
     */
    emitFinalChunk(content: string): void {
        this.emit({
            type: 'final_chunk',
            content,
            timestamp: Date.now(),
        });
    }

    /**
     * Response is fully complete
     */
    emitFinalComplete(
        confidence?: number,
        assumptions?: string[],
        uncertaintyNotes?: string[],
        sources?: Source[]
    ): void {
        this.emit({
            type: 'final_complete',
            confidence,
            assumptions,
            uncertainty_notes: uncertaintyNotes,
            sources,
            timestamp: Date.now(),
        });
    }

    /**
     * Emit an error
     */
    emitError(error: string): void {
        this.emit({
            type: 'error',
            error,
            timestamp: Date.now(),
        });
    }

    /**
     * Close the stream (safe to call multiple times, idempotent)
     */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.stopHeartbeat();
        if (this.controller) {
            try {
                this.controller.close();
            } catch {
                // Already closed — ignore
            }
            this.controller = null as unknown as ReadableStreamDefaultController;
        }
    }

    /**
     * Emit stage data for chained function orchestration.
     * The frontend captures this data and passes it to the next function.
     */
    emitStageData(data: Record<string, unknown>): void {
        this.emit({
            type: 'stage_data',
            ...data,
            timestamp: Date.now(),
        });
    }

    /**
     * Get the Response object for the Edge Function
     */
    getResponse(): Response {
        return new Response(this.stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable Nginx buffering
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }
}
