// ============================================================
// ThinkingBlock Component
// The "Glass Box" that shows the AI's reasoning in real-time
// ============================================================

import { useState } from 'react';
import type { StreamState, ThinkingStep } from '../lib/stream-client';
import type { ReasoningMode } from '../types';

interface ThinkingBlockProps {
    state: StreamState;
}

export function ThinkingBlock({ state }: ThinkingBlockProps) {
    const [isOpen, setIsOpen] = useState(true);

    const { steps, classification, mode, wasEscalated } = state;
    const isActive = state.isThinking || state.isFinalizing;

    const completedSteps = steps.filter((s) => s.status === 'complete').length;
    const activeStep = steps.find((s) => s.status === 'active');

    // Separate parallel solvers from sequential steps
    const parallelSteps = steps.filter((s) => s.parallelGroup === 'ultra_solvers');
    const sequentialSteps = steps.filter((s) => s.parallelGroup !== 'ultra_solvers');

    const getModeLabel = (m: ReasoningMode | null) => {
        switch (m) {
            case 'instant': return 'Instant';
            case 'deep': return 'Deep';
            case 'ultra_deep': return 'Ultra-Deep';
            default: return 'Analyzing';
        }
    };

    const getStepDuration = (step: ThinkingStep) => {
        if (!step.completedAt) return null;
        const ms = step.completedAt - step.startedAt;
        return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
    };

    // Don't render if no steps
    if (steps.length === 0 && !classification) return null;

    return (
        <div className="thinking-block">
            {/* Header */}
            <div className="thinking-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="thinking-header-left">
                    <div className={`thinking-icon ${isActive ? 'active' : 'complete'}`}>
                        {isActive ? '⚡' : '✓'}
                    </div>
                    <span className="thinking-title">
                        {isActive
                            ? activeStep
                                ? activeStep.label
                                : 'Thinking...'
                            : `Thought for ${completedSteps} steps`}
                    </span>
                </div>
                <span className={`thinking-chevron ${isOpen ? 'open' : ''}`}>▼</span>
            </div>

            {/* Body */}
            <div className={`thinking-body ${isOpen ? 'open' : ''}`}>
                {/* Classification Tags */}
                {classification && (
                    <div className="classification-tags" style={{ padding: '0 14px 8px' }}>
                        <span className="tag tag-domain">{classification.domain}</span>
                        <span className={`tag tag-mode ${mode === 'ultra_deep' ? 'ultra' : ''}`}>
                            {getModeLabel(mode)}
                        </span>
                        {classification.reasoning_modes.map((rm) => (
                            <span key={rm} className="tag tag-reasoning">{rm}</span>
                        ))}
                        {wasEscalated && (
                            <span className="tag tag-escalated">⬆ Escalated</span>
                        )}
                    </div>
                )}

                {/* Sequential Steps */}
                <div className="thinking-steps">
                    {sequentialSteps.map((step, idx) => (
                        <div key={`${step.layer}-${idx}`} className="thinking-step">
                            <div className="thinking-step-header">
                                <div className={`step-indicator ${step.status}`} />
                                <span className="step-label">
                                    {step.label}
                                    {getStepDuration(step) && (
                                        <span style={{
                                            color: 'var(--text-muted)',
                                            fontWeight: 400,
                                            marginLeft: 8,
                                            textTransform: 'none',
                                            letterSpacing: 'normal',
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 10,
                                        }}>
                                            {getStepDuration(step)}
                                        </span>
                                    )}
                                </span>
                            </div>
                            {step.content && (
                                <div className="step-content">{step.content}</div>
                            )}
                            {step.artifact && !step.content && (
                                <div className="step-content">
                                    {JSON.stringify(step.artifact, null, 2)}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Parallel Solvers (Triple Column) */}
                {parallelSteps.length > 0 && (
                    <div className="parallel-solvers">
                        {parallelSteps.map((step) => {
                            const solverClass = step.layer.includes('solver_a')
                                ? 'solver-a'
                                : step.layer.includes('solver_b')
                                    ? 'solver-b'
                                    : 'solver-c';

                            return (
                                <div
                                    key={step.layer}
                                    className={`parallel-solver ${solverClass}`}
                                >
                                    <div className="solver-label">
                                        <span>{step.label}</span>
                                        <div
                                            className={`step-indicator ${step.status}`}
                                            style={{ marginLeft: 'auto' }}
                                        />
                                    </div>
                                    <div className="solver-content">
                                        {step.content || (step.status === 'active' ? 'Reasoning...' : '')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
