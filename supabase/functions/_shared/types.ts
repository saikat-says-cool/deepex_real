// ============================================================
// DeepEx Core Types (Deno-compatible for Edge Functions)
// Mirror of src/types/index.ts
// ============================================================

export type ReasoningMode = 'instant' | 'deep' | 'ultra_deep';

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

export interface SearchConfig {
    query: string;
    count?: number;
    freshness?: 'noLimit' | 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear';
    summary?: boolean;
}

export interface IntentMetadata {
    domain: Domain;
    reasoning_modes: ReasoningType[];
    complexity: Severity;
    stakes: Severity;
    uncertainty: Severity;
    recommended_mode: ReasoningMode;
    parallelism_needed: boolean;
    needs_web_search?: boolean;
    search_queries?: (string | SearchConfig)[];
}

export type ThoughtLayer =
    | 'classification'
    | 'decomposition'
    | 'primary_solver'
    | 'fast_critic'
    | 'refiner'
    | 'confidence_gate'
    | 'deep_decomposition'
    | 'solver_a_standard'
    | 'solver_b_pessimist'
    | 'solver_c_creative'
    | 'skeptic_agent'
    | 'verifier_agent'
    | 'synthesizer'
    | 'meta_critic'
    | 'ultra_confidence'
    | 'escalation_trigger'
    | 'web_search';

export type ThoughtStatus = 'pending' | 'streaming' | 'complete' | 'error';

export type SSEEventType =
    | 'classification'
    | 'mode_selected'
    | 'layer_start'
    | 'layer_chunk'
    | 'layer_artifact'
    | 'layer_complete'
    | 'escalation'
    | 'parallel_start'
    | 'stage_data'
    | 'final_start'
    | 'final_chunk'
    | 'final_complete'
    | 'error';

export interface Source {
    title: string;
    url: string;
    snippet: string;
}

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

export interface ChatRequest {
    conversation_id: string;
    message: string;
    image_url?: string;
    mode_override?: ReasoningMode;
    model_override?: string;
}

// ── Reasoning Artifacts ──────────────────────────────────────
export interface ProblemMap {
    facts: string[];
    intent: string;
    constraints: string[];
    unknowns: string[];
    output_type: string;
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

export interface ConfidenceResult {
    score: number;
    assumptions: string[];
    uncertainty_notes: string[];
}
