// ============================================================
// ThinkingBlock Component — "Glass Box" Reasoning Display
// Premium real-time visualization of the AI's thought process.
// Supports Deep and Ultra-Deep pipelines.
// ============================================================

import React, { useState, useMemo } from 'react';
import type { StreamState, ThinkingStep } from '../lib/stream-client';

interface ThinkingBlockProps {
    state: StreamState;
}



/* ── Utility: human-readable duration ─────────────────────── */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Utility: total elapsed time from steps ───────────────── */
function totalElapsed(steps: ThinkingStep[]): number {
    if (steps.length === 0) return 0;
    const earliest = Math.min(...steps.map((s) => s.startedAt));
    const latest = Math.max(
        ...steps.map((s) => s.completedAt ?? Date.now())
    );
    return latest - earliest;
}



/* ── Step status → visual mapping ─────────────────────────── */
function getStepIcon(status: string): React.ReactElement {
    switch (status) {
        case 'active':
            return (
                <div className="tb-step-icon tb-step-icon--active">
                    <div className="tb-spinner-ring" />
                </div>
            );
        case 'complete':
            return (
                <div className="tb-step-icon tb-step-icon--complete">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M3 8.5L6.5 12L13 4"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            );
        default:
            return <div className="tb-step-icon tb-step-icon--pending" />;
    }
}

/* ── Layer name → refined label ───────────────────────────── */
function refineLabel(layer: string, label: string): string {
    // Use the SSE label if it's reasonable, otherwise refine
    if (label && label !== layer) return label;
    const map: Record<string, string> = {
        classification: 'Classifying Intent',
        decomposition: 'Decomposing Problem',
        primary_solver: 'Solving',
        fast_critic: 'Critical Analysis',
        refiner: 'Refining Answer',
        confidence_gate: 'Confidence Assessment',
        deep_decomposition: 'Deep Decomposition',
        solver_a_standard: 'Solver A — Standard',
        solver_b_pessimist: 'Solver B — Pessimist',
        solver_c_creative: 'Solver C — Creative',
        skeptic_agent: 'Skeptic Review',
        verifier_agent: 'Verification',
        synthesizer: 'Synthesis',
        meta_critic: 'Meta-Critic Review',
        ultra_confidence: 'Final Confidence',
        escalation_trigger: 'Escalation Triggered',
        web_search: 'Web Search',
    };
    return map[layer] || label || layer;
}



/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export function ThinkingBlock({ state }: ThinkingBlockProps) {
    const [isOpen, setIsOpen] = useState(true);
    const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());

    const toggleStep = (stepId: string) => {
        setCollapsedSteps(prev => {
            const next = new Set(prev);
            if (next.has(stepId)) next.delete(stepId);
            else next.add(stepId);
            return next;
        });
    };

    const { steps, classification, mode } = state;
    const isActive = state.isThinking || state.isFinalizing;
    const elapsed = totalElapsed(steps);

    const completedSteps = steps.filter((s) => s.status === 'complete').length;
    const activeStep = steps.find((s) => s.status === 'active');

    // Separate parallel solvers from sequential steps
    const parallelSteps = useMemo(
        () => steps.filter((s) => s.parallelGroup === 'ultra_solvers'),
        [steps]
    );
    const sequentialSteps = useMemo(
        () => steps.filter((s) => s.parallelGroup !== 'ultra_solvers'),
        [steps]
    );


    const isUltraDeep = mode === 'ultra_deep';

    // Don't render for instant mode, or if no steps and no classification
    if (mode === 'instant' || (steps.length === 0 && !classification)) return null;

    return (
        <div
            className={`tb-container ${isUltraDeep ? 'tb-container--ultra' : ''} ${isActive ? 'tb-container--active' : 'tb-container--complete'}`}
        >
            {/* ═══ HEADER ════════════════════════════════════════ */}
            <button className="tb-header" onClick={() => setIsOpen(!isOpen)} type="button">
                <div className="tb-header-left">
                    <div className={`tb-header-indicator ${isActive ? 'active' : 'complete'}`}>
                        {isActive ? (
                            <div className="tb-rotating-square" />
                        ) : (
                            <div className="tb-dot-complete" />
                        )}
                    </div>

                    <span className="tb-header-title">
                        {isActive
                            ? activeStep
                                ? refineLabel(activeStep.layer, activeStep.label)
                                : 'Thinking…'
                            : `Reasoned through ${completedSteps} step${completedSteps !== 1 ? 's' : ''}`}
                    </span>
                </div>

                <div className="tb-header-right">
                    {/* Elapsed time */}
                    {elapsed > 0 && (
                        <span className="tb-header-time">
                            {formatDuration(elapsed)}
                        </span>
                    )}

                    {/* Chevron */}
                    <svg
                        className={`tb-chevron ${isOpen ? 'open' : ''}`}
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                    >
                        <path
                            d="M4 6L8 10L12 6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </button >

            {/* ═══ BODY ══════════════════════════════════════════ */}
            < div className={`tb-body ${isOpen ? 'open' : ''}`
            }>
                <div className="tb-body-inner">


                    {/* ── Sequential Steps Timeline ──────────────── */}
                    {sequentialSteps.length > 0 && (
                        <div className="tb-timeline">
                            {sequentialSteps.map((step, i) => (
                                <div
                                    key={`${step.layer}-${i}`}
                                    className={`tb-timeline-step tb-timeline-step--${step.status}`}
                                >
                                    {/* Connector line */}
                                    {i < sequentialSteps.length - 1 && (
                                        <div className={`tb-timeline-connector ${step.status === 'complete' ? 'done' : ''}`} />
                                    )}

                                    {/* Icon */}
                                    {getStepIcon(step.status)}

                                    {/* Content */}
                                    <div className="tb-step-body">
                                        <div
                                            className="tb-step-header"
                                            onClick={() => toggleStep(`${step.layer}-${i}`)}
                                            style={{ cursor: step.content ? 'pointer' : 'default' }}
                                        >
                                            <span className="tb-step-label">
                                                {refineLabel(step.layer, step.label)}
                                            </span>
                                            <div className="tb-step-header-right">
                                                {step.status === 'complete' && step.completedAt && (
                                                    <span className="tb-step-duration">
                                                        {formatDuration(step.completedAt - step.startedAt)}
                                                    </span>
                                                )}
                                                {step.content && (
                                                    <svg
                                                        className={`tb-step-chevron ${collapsedSteps.has(`${step.layer}-${i}`) ? '' : 'open'}`}
                                                        width="10" height="10" viewBox="0 0 16 16" fill="none"
                                                    >
                                                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>
                                        {step.content && !collapsedSteps.has(`${step.layer}-${i}`) && (
                                            <div className="tb-step-content">
                                                {step.content}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Parallel Solvers (Ultra-Deep) ──────────── */}
                    {parallelSteps.length > 0 && (
                        <div className="tb-parallel">
                            <div className="tb-parallel-grid">
                                {parallelSteps.map((solver, i) => (
                                    <div
                                        key={`solver-${i}`}
                                        className={`tb-solver-card tb-solver-card--${solver.status}`}
                                    >
                                        <div
                                            className="tb-solver-header"
                                            onClick={() => toggleStep(`solver-${i}`)}
                                            style={{ cursor: solver.content ? 'pointer' : 'default' }}
                                        >
                                            <span className="tb-solver-label">{solver.label}</span>
                                            {solver.content && (
                                                <svg
                                                    className={`tb-step-chevron ${collapsedSteps.has(`solver-${i}`) ? '' : 'open'}`}
                                                    width="10" height="10" viewBox="0 0 16 16" fill="none"
                                                >
                                                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                        {solver.content && !collapsedSteps.has(`solver-${i}`) && (
                                            <div className="tb-solver-content">{solver.content}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Confidence Meter ────────────────────────── */}
                    {state.confidence !== null && (
                        <div className="tb-confidence">
                            <div className="tb-confidence-header">
                                <span className="tb-confidence-label">Confidence Score</span>
                                <span
                                    className="tb-confidence-value"
                                    style={{ color: confidenceColor(state.confidence) }}
                                >
                                    {Math.round(state.confidence)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ── Sources ─────────────────────────────────── */}
                    {state.sources && state.sources.length > 0 && (
                        <div className="tb-sources">
                            <div className="tb-sources-label">
                                {state.sources.length} Source{state.sources.length !== 1 ? 's' : ''} Referenced
                            </div>
                            <div className="tb-sources-list">
                                {state.sources.map((src, i) => (
                                    <a
                                        key={i}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="tb-source-link"
                                    >
                                        [{i + 1}] {src.title || src.url}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Assumptions & Uncertainty ───────────────── */}
                    {((state.assumptions && state.assumptions.length > 0) ||
                        (state.uncertaintyNotes && state.uncertaintyNotes.length > 0)) && (
                            <div className="tb-meta-section">
                                {state.assumptions && state.assumptions.length > 0 && (
                                    <div className="tb-meta-group">
                                        <div className="tb-meta-label">
                                            Assumptions Made
                                        </div>
                                        <ul className="tb-meta-list">
                                            {state.assumptions.map((a, i) => (
                                                <li key={i}>{a}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {state.uncertaintyNotes && state.uncertaintyNotes.length > 0 && (
                                    <div className="tb-meta-group tb-meta-group--uncertainty">
                                        <div className="tb-meta-label">
                                            Uncertainty Notes
                                        </div>
                                        <ul className="tb-meta-list">
                                            {state.uncertaintyNotes.map((n, i) => (
                                                <li key={i}>{n}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                    {/* ── Error ───────────────────────────────────── */}
                    {state.error && (
                        <div className="tb-error">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span>{state.error}</span>
                        </div>
                    )}
                </div>
            </div >
        </div >
    );
}
