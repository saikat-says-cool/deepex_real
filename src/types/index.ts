// ============================================================
// DeepEx Core Types
// Shared between Frontend and Edge Functions
// ============================================================

// ── Reasoning Modes ──────────────────────────────────────────
export type ReasoningMode = 'instant' | 'deep' | 'ultra_deep';

// ── Cortex Classification ────────────────────────────────────
export type Domain =
    | 'math'
    | 'coding'
    | 'strategy'
    | 'philosophy'
    | 'prediction'
    | 'creative'
    | 'social'
    | 'science'
    | 'general';

export type ReasoningType =
    | 'symbolic'
    | 'probabilistic'
    | 'causal'
    | 'strategic'
    | 'temporal'
    | 'creative'
    | 'social'
    | 'abductive'
    | 'optimization'
    | 'meta';

export type Severity = 'low' | 'medium' | 'high';

export interface IntentMetadata {
    domain: Domain;
    reasoning_modes: ReasoningType[];
    complexity: Severity;
    stakes: Severity;
    uncertainty: Severity;
    recommended_mode: ReasoningMode;
    parallelism_needed: boolean;
}

// ── Database Row Types ───────────────────────────────────────
export interface Conversation {
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Source {
    title: string;
    url: string;
    snippet: string;
}

export interface Message {
    id: string;
    conversation_id: string;
    role: MessageRole;
    content: string;
    mode: ReasoningMode | null;
    was_escalated: boolean;
    confidence_score: number | null;
    assumptions: string[] | null;
    uncertainty_notes: string[] | null;
    intent_metadata: IntentMetadata | null;
    sources: Source[] | null;
    total_thinking_time_ms: number | null;
    created_at: string;
}

// ── Thought Log Types ────────────────────────────────────────
export type ThoughtLayer =
    // Cortex
    | 'classification'
    // Deep Mode
    | 'decomposition'
    | 'primary_solver'
    | 'fast_critic'
    | 'refiner'
    | 'confidence_gate'
    // Ultra-Deep Mode
    | 'deep_decomposition'
    | 'solver_a_standard'
    | 'solver_b_pessimist'
    | 'solver_c_creative'
    | 'skeptic_agent'
    | 'verifier_agent'
    | 'synthesizer'
    | 'meta_critic'
    | 'ultra_confidence'
    // Special
    | 'escalation_trigger'
    | 'web_search';

export type ThoughtStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ThoughtLog {
    id: string;
    message_id: string;
    layer: ThoughtLayer;
    layer_label: string;
    layer_order: number;
    content: string;
    artifact: Record<string, unknown> | null;
    parallel_group: string | null;
    status: ThoughtStatus;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    created_at: string;
}

// ── Reasoning Artifacts ──────────────────────────────────────
export interface ProblemMap {
    facts: string[];
    intent: string;
    constraints: string[];
    unknowns: string[];
    output_type: string;
}

export interface PrimarySolution {
    reasoning: string;
    draft_answer: string;
}

export interface CriticReport {
    issues: string[];
    confidence_flags: string[];
    missing_angles: string[];
}

export interface SkepticReport {
    contradictions: string[];
    weak_points: string[];
    unresolved_questions: string[];
}

export interface VerificationReport {
    logical_flow_valid: boolean;
    assumption_issues: string[];
    consistency_issues: string[];
    overall_validity: 'valid' | 'partially_valid' | 'invalid';
}

export interface MetaCriticReport {
    fully_answers_user: boolean;
    missing_elements: string[];
    quality_assessment: string;
}

export interface ConfidenceResult {
    score: number;
    assumptions: string[];
    uncertainty_notes: string[];
}

// ── SSE Event Types ──────────────────────────────────────────
export type SSEEventType =
    | 'classification'        // Cortex has classified the query
    | 'mode_selected'         // Mode has been chosen
    | 'layer_start'           // A thinking layer has begun
    | 'layer_chunk'           // Streaming text from a layer
    | 'layer_artifact'        // Structured JSON artifact from a layer
    | 'layer_complete'        // A layer has finished
    | 'escalation'            // Deep → Ultra-Deep escalation triggered
    | 'parallel_start'        // Triple solvers starting
    | 'stage_data'            // Chained function orchestration data
    | 'final_start'           // Final answer is beginning
    | 'final_chunk'           // Streaming the final answer
    | 'final_complete'        // Response complete
    | 'error';                // Something went wrong

export interface SSEEvent {
    type: SSEEventType;
    layer?: ThoughtLayer;
    layer_label?: string;
    mode?: ReasoningMode;
    content?: string;
    artifact?: Record<string, unknown>;
    metadata?: IntentMetadata;
    confidence?: number;
    assumptions?: string[];
    uncertainty_notes?: string[];
    sources?: Source[];
    error?: string;
    message_id?: string;
    parallel_group?: string;
    timestamp: number;
}

// ── API Request/Response ─────────────────────────────────────
export interface ChatRequest {
    conversation_id: string;
    message: string;
    mode_override?: ReasoningMode;  // User can force a mode
}

export interface ChatResponse {
    message_id: string;
    conversation_id: string;
}
