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

/* ── Mode metadata ────────────────────────────────────────── */
const MODE_META: Record<string, { label: string; icon: string; accent: string }> = {
    instant: { label: 'Instant', icon: '⚡', accent: 'var(--text-tertiary)' },
    deep: { label: 'Deep Reasoning', icon: '🧠', accent: '#3b82f6' },
    ultra_deep: { label: 'Ultra-Deep Reasoning', icon: '⚛️', accent: '#a855f7' },
};

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

/* ── Confidence color ─────────────────────────────────────── */
function confidenceColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export function ThinkingBlock({ state }: ThinkingBlockProps) {
    const [isOpen, setIsOpen] = useState(true);

    const { steps, classification, mode, wasEscalated } = state;
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

    const modeInfo = MODE_META[mode || ''] || MODE_META.instant;
    const isUltraDeep = mode === 'ultra_deep';

    // Don't render if no steps and no classification
    if (steps.length === 0 && !classification) return null;

    return (
        <div
            className={`tb-container ${isUltraDeep ? 'tb-container--ultra' : ''} ${isActive ? 'tb-container--active' : 'tb-container--complete'}`}
        >
            {/* ── Animated top border ──────────────────────────── */}
            {isActive && <div className="tb-scan-line" />}

            {/* ═══ HEADER ════════════════════════════════════════ */}
            <button className="tb-header" onClick={() => setIsOpen(!isOpen)} type="button">
                <div className="tb-header-left">
                    {/* Status indicator */}
                    <div className={`tb-header-indicator ${isActive ? 'active' : 'complete'}`}>
                        {isActive ? (
                            <div className="tb-header-pulse" />
                        ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </div>

                    {/* Mode badge */}
                    <span className="tb-header-mode">{modeInfo.icon}</span>

                    {/* Title */}
                    <span className="tb-header-title">
                        {isActive
                            ? activeStep
                                ? refineLabel(activeStep.layer, activeStep.label)
                                : 'Thinking…'
                            : `Reasoned through ${completedSteps} step${completedSteps !== 1 ? 's' : ''}`}
                    </span>

                    {wasEscalated && (
                        <span className="tb-badge tb-badge--escalated">
                            ⬆ Escalated
                        </span>
                    )}
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
            </button>

            {/* ═══ BODY ══════════════════════════════════════════ */}
            <div className={`tb-body ${isOpen ? 'open' : ''}`}>
                <div className="tb-body-inner">
                    {/* ── Classification Tags ────────────────────── */}
                    {classification && (
                        <div className="tb-tags">
                            <span className="tb-tag tb-tag--domain">
                                {classification.domain}
                            </span>
                            <span className={`tb-tag tb-tag--mode ${isUltraDeep ? 'ultra' : ''}`}>
                                {modeInfo.label}
                            </span>
                            {classification.reasoning_modes.map((rm) => (
                                <span key={rm} className="tb-tag tb-tag--reasoning">
                                    {rm}
                                </span>
                            ))}
                            <span className={`tb-tag tb-tag--complexity ${classification.complexity}`}>
                                {classification.complexity} complexity
                            </span>
                        </div>
                    )}

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
                                        <div className="tb-step-header">
                                            <span className="tb-step-label">
                                                {refineLabel(step.layer, step.label)}
                                            </span>
                                            {step.status === 'complete' && step.completedAt && (
                                                <span className="tb-step-duration">
                                                    {formatDuration(step.completedAt - step.startedAt)}
                                                </span>
                                            )}
                                        </div>
                                        {step.content && (
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
                            <div className="tb-parallel-header">
                                <span className="tb-parallel-icon">⚡</span>
                                <span className="tb-parallel-title">Parallel Reasoning Paths</span>
                            </div>
                            <div className="tb-parallel-grid">
                                {parallelSteps.map((solver, i) => (
                                    <div
                                        key={`solver-${i}`}
                                        className={`tb-solver-card tb-solver-card--${solver.status}`}
                                    >
                                        <div className="tb-solver-header">
                                            <span className={`tb-solver-dot solver-${i}`} />
                                            <span className="tb-solver-label">{solver.label}</span>
                                            {solver.status === 'active' && (
                                                <span className="tb-solver-live">LIVE</span>
                                            )}
                                            {solver.status === 'complete' && (
                                                <svg className="tb-solver-check" width="12" height="12" viewBox="0 0 16 16" fill="none">
                                                    <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                        {solver.content && (
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
                            <div className="tb-confidence-track">
                                <div
                                    className="tb-confidence-fill"
                                    style={{
                                        width: `${Math.min(state.confidence, 100)}%`,
                                        background: `linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #22c55e 75%, ${confidenceColor(state.confidence)} 100%)`,
                                    }}
                                />
                                {/* Threshold marker at 70% */}
                                <div className="tb-confidence-threshold" style={{ left: '70%' }} />
                            </div>
                        </div>
                    )}

                    {/* ── Sources ─────────────────────────────────── */}
                    {state.sources && state.sources.length > 0 && (
                        <div className="tb-sources">
                            <div className="tb-sources-label">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4 }}>
                                    <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                {state.sources.length} Source{state.sources.length !== 1 ? 's' : ''} Referenced
                            </div>
                            <div className="tb-sources-grid">
                                {state.sources.map((src, i) => {
                                    let domain = src.url;
                                    try {
                                        domain = new URL(src.url).hostname.replace('www.', '');
                                    } catch { /* malformed URL — use raw */ }
                                    return (
                                        <a
                                            key={i}
                                            href={src.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tb-source-chip"
                                            title={src.title}
                                        >
                                            <span className="tb-source-index">{i + 1}</span>
                                            <div className="tb-source-info">
                                                <span className="tb-source-title">{src.title || domain}</span>
                                                <span className="tb-source-domain">{domain}</span>
                                            </div>
                                        </a>
                                    );
                                })}
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
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4 }}>
                                                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                                                <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
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
                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4 }}>
                                                <path d="M6.5 5.5C6.5 4.67 7.17 4 8 4s1.5.67 1.5 1.5c0 .83-.75 1.25-1.5 2M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                                            </svg>
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
            </div>
        </div>
    );
}
