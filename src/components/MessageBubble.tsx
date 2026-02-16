// ============================================================
// MessageBubble Component
// Renders a single message with optional thinking block + copy
// Premium design with rich metadata display
// ============================================================

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message, ThoughtLog } from '../types';

interface MessageBubbleProps {
    message: Message;
    loadThoughtLogs: (messageId: string) => Promise<ThoughtLog[]>;
}

/* ── Confidence color helper ──────────────────────────────── */
function confidenceColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
}

export function MessageBubble({ message, loadThoughtLogs }: MessageBubbleProps) {
    const [showThinking, setShowThinking] = useState(true);
    const [thoughtLogs, setThoughtLogs] = useState<ThoughtLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [showSources, setShowSources] = useState(false);
    const [copied, setCopied] = useState(false);
    const [collapsedLogs, setCollapsedLogs] = useState<Set<string>>(new Set());

    const toggleLog = (logId: string) => {
        setCollapsedLogs(prev => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId);
            else next.add(logId);
            return next;
        });
    };

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

    // ── User message ──────────────────────────────────────────
    if (message.role === 'user') {
        return (
            <div className="message message-user">
                {message.image_url && (
                    <div className="message-image-attachment">
                        <img
                            src={message.image_url}
                            alt="Attached"
                            className="message-attached-image"
                            onClick={() => window.open(message.image_url!, '_blank')}
                        />
                    </div>
                )}
                <div className="message-content">{message.content}</div>
                <div className="message-actions">
                    <button
                        className={`action-btn ${copied ? 'copied' : ''}`}
                        onClick={handleCopy}
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Copied</span>
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // ── Assistant message ─────────────────────────────────────
    const hasThinking = message.mode && message.mode !== 'instant';
    const parallelLogs = thoughtLogs.filter((l) => l.parallel_group === 'ultra_solvers');
    const sequentialLogs = thoughtLogs.filter((l) => l.parallel_group !== 'ultra_solvers');

    const getModeLabel = () => {
        switch (message.mode) {
            case 'deep': return 'Deep Reasoning';
            case 'ultra_deep': return 'Ultra-Deep Reasoning';
            default: return 'Reasoning';
        }
    };

    const getModeIcon = () => {
        switch (message.mode) {
            case 'deep': return '';
            case 'ultra_deep': return '';
            default: return '';
        }
    };

    const getLayerDuration = (log: ThoughtLog) => {
        if (!log.duration_ms) return null;
        return log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="message message-assistant">
            {/* ── Persisted Thinking Block ────────────────── */}
            {hasThinking && (
                <div className={`tb-container tb-container--complete ${message.mode === 'ultra_deep' ? 'tb-container--ultra' : ''}`}>
                    <button className="tb-header" onClick={handleToggleThinking} type="button">
                        <div className="tb-header-left">
                            <div className="tb-header-indicator complete">
                            </div>
                            <span className="tb-header-mode">{getModeIcon()}</span>
                            <span className="tb-header-title">
                                {getModeLabel()}
                                {message.total_thinking_time_ms && (
                                    <span className="tb-header-time" style={{ marginLeft: 8 }}>
                                        {(message.total_thinking_time_ms / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </span>
                            {message.was_escalated && (
                                <span className="tb-badge tb-badge--escalated">Escalated</span>
                            )}
                        </div>
                        <svg
                            className={`tb-chevron ${showThinking ? 'open' : ''}`}
                            width="14" height="14" viewBox="0 0 16 16" fill="none"
                        >
                            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <div className={`tb-body ${showThinking ? 'open' : ''}`}>
                        <div className="tb-body-inner">
                            {loadingLogs && (
                                <div className="tb-loading">
                                    <div className="tb-spinner-ring" />
                                    <span>Loading thought process…</span>
                                </div>
                            )}



                            {/* Sequential Steps */}
                            {sequentialLogs.length > 0 && (
                                <div className="tb-timeline">
                                    {sequentialLogs.map((log, i) => (<div key={log.id} className="tb-timeline-step tb-timeline-step--complete">

                                        <div className="tb-step-icon tb-step-icon--complete">
                                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                                <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <div className="tb-step-body">
                                            <div
                                                className="tb-step-header"
                                                onClick={() => toggleLog(log.id)}
                                                style={{ cursor: log.content ? 'pointer' : 'default' }}
                                            >
                                                <span className="tb-step-label">{log.layer_label}</span>
                                                <div className="tb-step-header-right">
                                                    {getLayerDuration(log) && (
                                                        <span className="tb-step-duration">
                                                            {getLayerDuration(log)}
                                                        </span>
                                                    )}
                                                    {log.content && (
                                                        <svg
                                                            className={`tb-step-chevron ${collapsedLogs.has(log.id) ? '' : 'open'}`}
                                                            width="10" height="10" viewBox="0 0 16 16" fill="none"
                                                        >
                                                            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                            {log.content && !collapsedLogs.has(log.id) && (
                                                <div className="tb-step-content">{log.content}</div>
                                            )}
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            )}

                            {/* Parallel Solvers */}
                            {parallelLogs.length > 0 && (
                                <div className="tb-parallel-grid">
                                    {parallelLogs.map((log, i) => (
                                        <div key={log.id} className="tb-solver-card tb-solver-card--complete">
                                            <div
                                                className="tb-solver-header"
                                                onClick={() => toggleLog(log.id)}
                                                style={{ cursor: log.content ? 'pointer' : 'default' }}
                                            >
                                                <span className="tb-solver-label">{log.layer_label}</span>
                                                {log.content && (
                                                    <svg
                                                        className={`tb-step-chevron ${collapsedLogs.has(log.id) ? '' : 'open'}`}
                                                        width="10" height="10" viewBox="0 0 16 16" fill="none"
                                                    >
                                                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </div>
                                            {log.content && !collapsedLogs.has(log.id) && (
                                                <div className="tb-solver-content">{log.content}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Message Content ─────────────────────────── */}
            <div className="message-content">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        img: ({ src, alt, ...props }) => (
                            <div className="message-image-attachment" style={{ marginTop: 12 }}>
                                <img
                                    src={src}
                                    alt={alt || 'Generated image'}
                                    className="message-attached-image"
                                    style={{ maxWidth: '100%', maxHeight: 400, cursor: 'pointer' }}
                                    onClick={() => src && window.open(src, '_blank')}
                                    {...props}
                                />
                            </div>
                        ),
                    }}
                >
                    {message.content}
                </ReactMarkdown>
            </div>

            {/* ── Action Bar ──────────────────────────────── */}
            <div className="message-actions">
                <button
                    className={`action-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopy}
                    title="Copy to clipboard"
                >
                    {copied ? (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Copied</span>
                        </>
                    ) : (
                        <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>

            {/* ── Confidence Bar ──────────────────────────── */}
            {message.confidence_score !== null && message.confidence_score !== undefined && (
                <div className="tb-confidence" style={{ marginTop: 12 }}>
                    <div className="tb-confidence-header">
                        <div className="tb-confidence-label-group">
                            <span className="tb-confidence-label">Confidence Assessment</span>
                            <span className="tb-confidence-status">
                                {message.confidence_score >= 90 ? 'ULTIMATE' :
                                    message.confidence_score >= 80 ? 'HIGH' :
                                        message.confidence_score >= 60 ? 'MODERATE' : 'INCONCLUSIVE'}
                            </span>
                        </div>
                        <span className="tb-confidence-value">
                            {Math.round(message.confidence_score)}%
                        </span>
                    </div>
                    <div className="tb-confidence-track">
                        <div
                            className="tb-confidence-fill"
                            style={{
                                width: `${Math.min(message.confidence_score, 100)}%`,
                                background: 'var(--text-primary)',
                            }}
                        />
                        <div className="tb-confidence-threshold" style={{ left: '70%' }} title="High Confidence Threshold" />
                    </div>
                </div>
            )}

            {/* ── Sources ────────────────────────────────── */}
            {message.sources && (message.sources as any[]).length > 0 && (
                <div className="tb-sources" style={{ marginTop: 8 }}>
                    <button
                        className="tb-sources-toggle"
                        onClick={() => setShowSources(!showSources)}
                        type="button"
                    >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4 }}>
                            <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {(message.sources as any[]).length} Source{(message.sources as any[]).length !== 1 ? 's' : ''} Referenced
                        <svg
                            className={`tb-chevron-mini ${showSources ? 'open' : ''}`}
                            width="10" height="10" viewBox="0 0 16 16" fill="none"
                        >
                            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    {showSources && (
                        <div className="tb-sources-grid">
                            {(message.sources as Array<{ title: string; url: string }>).map((source, idx) => {
                                let domain = source.url;
                                try {
                                    domain = new URL(source.url).hostname.replace('www.', '');
                                } catch { /* malformed URL */ }
                                return (
                                    <a
                                        key={idx}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="tb-source-chip"
                                    >
                                        <span className="tb-source-index">{idx + 1}</span>
                                        <div className="tb-source-info">
                                            <span className="tb-source-title">{source.title || domain}</span>
                                            <span className="tb-source-domain">{domain}</span>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
