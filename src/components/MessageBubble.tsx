// ============================================================
// MessageBubble Component
// Renders a single message with optional thinking block + copy
// ============================================================

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, ThoughtLog } from '../types';

interface MessageBubbleProps {
    message: Message;
    loadThoughtLogs: (messageId: string) => Promise<ThoughtLog[]>;
}

export function MessageBubble({ message, loadThoughtLogs }: MessageBubbleProps) {
    const [showThinking, setShowThinking] = useState(false);
    const [thoughtLogs, setThoughtLogs] = useState<ThoughtLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleToggleThinking = useCallback(async () => {
        if (!showThinking && thoughtLogs.length === 0) {
            setLoadingLogs(true);
            const logs = await loadThoughtLogs(message.id);
            setThoughtLogs(logs);
            setLoadingLogs(false);
        }
        setShowThinking(!showThinking);
    }, [showThinking, thoughtLogs.length, loadThoughtLogs, message.id]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = message.content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [message.content]);

    if (message.role === 'user') {
        return (
            <div className="message message-user">
                <div className="message-content">{message.content}</div>
                <button
                    className={`copy-button ${copied ? 'copied' : ''}`}
                    onClick={handleCopy}
                    title="Copy to clipboard"
                >
                    {copied ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    )}
                </button>
            </div>
        );
    }

    // Assistant message
    const hasThinking = message.mode && message.mode !== 'instant';
    const parallelLogs = thoughtLogs.filter((l) => l.parallel_group === 'ultra_solvers');
    const sequentialLogs = thoughtLogs.filter((l) => l.parallel_group !== 'ultra_solvers');

    const getModeLabel = () => {
        switch (message.mode) {
            case 'deep': return 'Deep';
            case 'ultra_deep': return 'Ultra-Deep';
            default: return '';
        }
    };

    const getLayerDuration = (log: ThoughtLog) => {
        if (!log.duration_ms) return null;
        return log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="message message-assistant">
            {/* Thinking Toggle (for persisted messages) */}
            {hasThinking && (
                <div className="thinking-block">
                    <div className="thinking-header" onClick={handleToggleThinking}>
                        <div className="thinking-header-left">
                            <div className="thinking-icon complete">✓</div>
                            <span className="thinking-title">
                                {getModeLabel()} Reasoning
                                {message.total_thinking_time_ms && (
                                    <span style={{
                                        color: 'var(--text-muted)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        marginLeft: 8,
                                        fontWeight: 400,
                                    }}>
                                        {(message.total_thinking_time_ms / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </span>
                        </div>
                        <span className={`thinking-chevron ${showThinking ? 'open' : ''}`}>▼</span>
                    </div>

                    <div className={`thinking-body ${showThinking ? 'open' : ''}`}>
                        {loadingLogs && (
                            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="spinner" />
                                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                    Loading thought process...
                                </span>
                            </div>
                        )}

                        {/* Classification Tags */}
                        {message.intent_metadata && (
                            <div className="classification-tags" style={{ padding: '0 16px 8px' }}>
                                <span className="tag tag-domain">
                                    {(message.intent_metadata as Record<string, unknown>).domain as string}
                                </span>
                                <span className={`tag tag-mode ${message.mode === 'ultra_deep' ? 'ultra' : ''}`}>
                                    {getModeLabel()}
                                </span>
                                {((message.intent_metadata as Record<string, unknown>).reasoning_modes as string[] || []).map((rm: string) => (
                                    <span key={rm} className="tag tag-reasoning">{rm}</span>
                                ))}
                                {message.was_escalated && (
                                    <span className="tag tag-escalated">⬆ Escalated</span>
                                )}
                            </div>
                        )}

                        {/* Sequential Steps */}
                        {sequentialLogs.length > 0 && (
                            <div className="thinking-steps">
                                {sequentialLogs.map((log) => (
                                    <div key={log.id} className="thinking-step">
                                        <div className="thinking-step-header">
                                            <div className="step-indicator complete" />
                                            <span className="step-label">
                                                {log.layer_label}
                                                {getLayerDuration(log) && (
                                                    <span style={{
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 400,
                                                        marginLeft: 8,
                                                        textTransform: 'none',
                                                        letterSpacing: 'normal',
                                                        fontFamily: 'var(--font-mono)',
                                                        fontSize: 11,
                                                    }}>
                                                        {getLayerDuration(log)}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        {log.content && (
                                            <div className="step-content">{log.content}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Parallel Solvers */}
                        {parallelLogs.length > 0 && (
                            <div className="parallel-solvers">
                                {parallelLogs.map((log) => {
                                    const solverClass = log.layer.includes('solver_a')
                                        ? 'solver-a'
                                        : log.layer.includes('solver_b')
                                            ? 'solver-b'
                                            : 'solver-c';

                                    const solverIcon = log.layer.includes('solver_a')
                                        ? '🔵'
                                        : log.layer.includes('solver_b')
                                            ? '🟠'
                                            : '🟣';

                                    return (
                                        <div key={log.id} className={`parallel-solver ${solverClass}`}>
                                            <div className="solver-label">
                                                <span>{solverIcon}</span>
                                                <span>{log.layer_label}</span>
                                            </div>
                                            <div className="solver-content">
                                                {log.content}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Message Content */}
            <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                </ReactMarkdown>
            </div>

            {/* Copy Button (assistant) */}
            <button
                className={`copy-button ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                title="Copy to clipboard"
            >
                {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                )}
            </button>

            {/* Confidence Bar */}
            {message.confidence_score !== null && (
                <div className="confidence-bar">
                    <span className="confidence-label">Confidence</span>
                    <div className="confidence-track">
                        <div
                            className="confidence-fill"
                            style={{ width: `${message.confidence_score}%` }}
                        />
                    </div>
                    <span className="confidence-score">{message.confidence_score}</span>
                </div>
            )}

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
                <div className="sources-section">
                    <button
                        className="sources-toggle"
                        onClick={() => setShowSources(!showSources)}
                    >
                        📎 {message.sources.length} Sources
                        <span className={`thinking-chevron ${showSources ? 'open' : ''}`}>▼</span>
                    </button>

                    {showSources && (
                        <div className="sources-list">
                            {(message.sources as Array<{ title: string; url: string }>).map((source, idx) => (
                                <a
                                    key={idx}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="source-chip"
                                >
                                    <span className="source-chip-index">{idx + 1}</span>
                                    <span className="source-chip-title">{source.title}</span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
