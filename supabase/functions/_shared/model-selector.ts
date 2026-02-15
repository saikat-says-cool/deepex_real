// ============================================================
// DeepEx Smart Model Selector
// Maps (pipeline step × query complexity) → optimal model
// Every model is a first-class citizen with dedicated responsibilities
// ============================================================

import { MODELS } from './longcat-client.ts';

// ── Complexity Tiers ─────────────────────────────────────────
export type Complexity = 'low' | 'medium' | 'high';

// ── Pipeline Steps ───────────────────────────────────────────
// Each step in the reasoning pipeline has different needs
export type PipelineStep =
    // Instant Mode
    | 'instant_answer'
    // Deep Mode
    | 'decomposition'
    | 'primary_solver'
    | 'fast_critic'
    | 'refiner'
    | 'confidence_gate'
    // Ultra-Deep Mode
    | 'deep_decomposition'
    | 'ultra_solver'
    | 'skeptic'
    | 'verifier'
    | 'synthesizer'
    | 'meta_critic'
    | 'ultra_confidence'
    // Utility
    | 'cortex_classify'
    | 'chat_title';

// ── Model Selection Config ───────────────────────────────────
// Returns: { model, enableThinking, thinkingBudget, temperature }

export interface ModelConfig {
    model: string;
    enableThinking?: boolean;
    thinkingBudget?: number;
    temperature?: number;
}

/**
 * Select the optimal model for a given pipeline step and complexity level.
 *
 * Design philosophy:
 * - Flash-Lite: JSON tasks, scoring, classification, simple outputs
 * - Flash-Chat: Medium reasoning, refining, writing, standard answers
 * - Flash-Thinking: Deep analysis, complex decomposition, solving
 * - Flash-Thinking-2601: Critical high-stakes steps, ultimate quality
 */
export function selectModel(step: PipelineStep, complexity: Complexity): ModelConfig {
    switch (step) {
        // ── Utility (always Flash-Lite) ──────────────────────
        case 'cortex_classify':
        case 'chat_title':
            return { model: MODELS.FLASH_LITE, temperature: 0.1 };

        // ══════════════════════════════════════════════════════
        // INSTANT MODE
        // ══════════════════════════════════════════════════════
        case 'instant_answer':
            switch (complexity) {
                case 'low':
                    // Simple greetings, lookups, translations → Flash-Lite is plenty
                    return { model: MODELS.FLASH_LITE, temperature: 0.3 };
                case 'medium':
                    // Moderate questions → Flash-Chat for better reasoning
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'high':
                    // Complex single-pass → Flash-Chat with more creativity
                    return { model: MODELS.FLASH_CHAT, temperature: 0.4 };
            }
            break;

        // ══════════════════════════════════════════════════════
        // DEEP MODE
        // ══════════════════════════════════════════════════════
        case 'decomposition':
            switch (complexity) {
                case 'low':
                    // Simple problems → Flash-Lite can decompose these
                    return { model: MODELS.FLASH_LITE, temperature: 0.2 };
                case 'medium':
                    // Medium → Flash-Chat for structured analysis
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'high':
                    // Complex → Flash-Thinking for deep structural analysis
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 };
            }
            break;

        case 'primary_solver':
            switch (complexity) {
                case 'low':
                    // Simple → Flash-Chat handles it fine
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'medium':
                    // Medium → Flash-Thinking for internal chain-of-thought
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
                case 'high':
                    // Hard → Flash-Thinking-2601 for maximum quality
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 4096 };
            }
            break;

        case 'fast_critic':
            // Critic produces structured JSON → Flash-Lite for all complexities
            // It's reviewing work, not creating new reasoning
            switch (complexity) {
                case 'low':
                    return { model: MODELS.FLASH_LITE, temperature: 0.1 };
                case 'medium':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.2 };
                case 'high':
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 };
            }
            break;

        case 'refiner':
            // Refiner writes the final polished answer → Flash-Chat excels at writing
            return { model: MODELS.FLASH_CHAT, temperature: 0.3 };

        case 'confidence_gate':
            // Simple JSON score → Flash-Lite always
            return { model: MODELS.FLASH_LITE, temperature: 0.1 };

        // ══════════════════════════════════════════════════════
        // ULTRA-DEEP MODE
        // ══════════════════════════════════════════════════════
        case 'deep_decomposition':
            switch (complexity) {
                case 'low':
                    // Shouldn't normally reach ultra-deep with low complexity, but handle gracefully
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'medium':
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 1024 };
                case 'high':
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
            }
            break;

        case 'ultra_solver':
            switch (complexity) {
                case 'low':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'medium':
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
                case 'high':
                    // The crown jewel: Flash-Thinking-2601 for the hardest problems
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 3072 };
            }
            break;

        case 'skeptic':
            switch (complexity) {
                case 'low':
                    // Simple critique → Flash-Lite can handle it
                    return { model: MODELS.FLASH_LITE, temperature: 0.2 };
                case 'medium':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'high':
                    // Deep adversarial analysis → needs thinking
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
            }
            break;

        case 'verifier':
            switch (complexity) {
                case 'low':
                    return { model: MODELS.FLASH_LITE, temperature: 0.1 };
                case 'medium':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.2 };
                case 'high':
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
            }
            break;

        case 'synthesizer':
            switch (complexity) {
                case 'low':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
                case 'medium':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.4 };
                case 'high':
                    // Synthesis of complex multi-solver outputs → needs thinking power
                    return { model: MODELS.FLASH_THINKING, enableThinking: true, thinkingBudget: 2048 };
            }
            break;

        case 'meta_critic':
            // Meta-critic produces structured JSON → Flash-Lite for all
            switch (complexity) {
                case 'low':
                    return { model: MODELS.FLASH_LITE, temperature: 0.1 };
                case 'medium':
                    return { model: MODELS.FLASH_LITE, temperature: 0.1 };
                case 'high':
                    return { model: MODELS.FLASH_CHAT, temperature: 0.2 };
            }
            break;

        case 'ultra_confidence':
            // Always Flash-Lite — it's a simple score
            return { model: MODELS.FLASH_LITE, temperature: 0.1 };
    }

    // Fallback: Flash-Chat is our reliable middle ground
    return { model: MODELS.FLASH_CHAT, temperature: 0.3 };
}

/**
 * Derive the effective complexity from Cortex classification fields.
 * Combines complexity, stakes, and uncertainty into a single tier.
 */
export function deriveComplexity(
    complexity: 'low' | 'medium' | 'high',
    stakes: 'low' | 'medium' | 'high',
    uncertainty: 'low' | 'medium' | 'high'
): Complexity {
    const weights = { low: 0, medium: 1, high: 2 };
    const score = weights[complexity] + weights[stakes] + weights[uncertainty];

    // Score range: 0-6
    // 0-1 → low, 2-3 → medium, 4-6 → high
    if (score <= 1) return 'low';
    if (score <= 3) return 'medium';
    return 'high';
}

/**
 * Log the model selection for observability.
 */
export function logModelSelection(step: PipelineStep, complexity: Complexity, config: ModelConfig): void {
    console.log(
        `[ModelSelector] ${step} (${complexity}) → ${config.model}` +
        (config.enableThinking ? ` [thinking:${config.thinkingBudget}]` : '') +
        (config.temperature !== undefined ? ` [temp:${config.temperature}]` : '')
    );
}
