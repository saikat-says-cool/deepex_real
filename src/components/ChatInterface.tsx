import React, { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { useDeepEx } from '../hooks/useDeepEx';
import { ThinkingBlock } from './ThinkingBlock';
import { MessageBubble } from './MessageBubble';
import { supabase } from '../lib/supabase';
import type { ReasoningMode } from '../types';

const Logo = ({ className, size = 24 }: { className?: string; size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
    >
        {/* Left Diamond */}
        <path d="M35 20L65 50L35 80L5 50L35 20Z" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        {/* Right Diamond */}
        <path d="M65 20L95 50L65 80L35 50L65 20Z" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        {/* Interlocking occlusion segment */}
        <path d="M50 35L65 20L80 35" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ShootingStars = ({ active }: { active: boolean }) => (
    <div className={`shooting-stars-background ${active ? '' : 'is-stopped'}`}>
        {[...Array(6)].map((_, i) => (
            <div key={i} className={`shooting-star star-${i}`} />
        ))}
    </div>
);

const HERO_TAGLINES = [
    'Think Harder. Push Limits.',
    'Reason. Challenge. Discover.',
    'Go deeper than the answer.',
    'What would you like to unravel?',
    'Every question deserves rigour.',
    'Let\'s think this through.',
    'The hardest questions, answered.',
    'Ask boldly. Think clearly.',
    'Where reasoning meets precision.',
    'Challenge assumptions. Find truth.',
    'Beyond search. Beyond summaries.',
    'Clarity through structured thought.',
    'No shortcuts. Real reasoning.',
    'What deserves a second thought?',
    'Depth over speed. Always.',
];

const MODES: { value: ReasoningMode; label: string; description: string }[] = [
    { value: 'instant', label: 'Instant', description: 'Fast and direct for simple tasks.' },
    { value: 'deep', label: 'Deep', description: 'Detailed reasoning with verification.' },
    { value: 'ultra_deep', label: 'Ultra-Deep', description: 'Parallel solver logic for complex problems.' },
];

// ── Frontier Model Mapping (Marketing Layer) ────────────────
interface FrontierModel {
    id: string;
    label: string;
    provider: string;
    providerColor: string;
    longcatModel: string;
    tier: 'speed' | 'standard' | 'reasoning' | 'ultra';
    description: string;
}

const FRONTIER_MODELS: FrontierModel[] = [
    // Speed Tier → LongCat-Flash-Lite
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', providerColor: '#10a37f', longcatModel: 'LongCat-Flash-Lite', tier: 'speed', description: 'Fast and efficient' },
    { id: 'claude-3.5-haiku', label: 'Claude 3.5 Haiku', provider: 'Anthropic', providerColor: '#d97706', longcatModel: 'LongCat-Flash-Lite', tier: 'speed', description: 'Quick responses' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'Google', providerColor: '#4285f4', longcatModel: 'LongCat-Flash-Lite', tier: 'speed', description: 'Rapid processing' },
    // Standard Tier → LongCat-Flash-Chat
    { id: 'gpt-4.5', label: 'GPT-4.5', provider: 'OpenAI', providerColor: '#10a37f', longcatModel: 'LongCat-Flash-Chat', tier: 'standard', description: 'Strong general assistant' },
    { id: 'claude-4.5-sonnet-std', label: 'Claude 4.5 Sonnet', provider: 'Anthropic', providerColor: '#d97706', longcatModel: 'LongCat-Flash-Chat', tier: 'standard', description: 'Balanced reasoning' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', providerColor: '#4285f4', longcatModel: 'LongCat-Flash-Chat', tier: 'standard', description: 'Professional grade' },
    // Reasoning Tier → LongCat-Flash-Thinking
    { id: 'gpt-5.1', label: 'GPT-5.1', provider: 'OpenAI', providerColor: '#10a37f', longcatModel: 'LongCat-Flash-Thinking', tier: 'reasoning', description: 'Deep chain-of-thought' },
    { id: 'claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'Anthropic', providerColor: '#d97706', longcatModel: 'LongCat-Flash-Thinking', tier: 'reasoning', description: 'Extended thinking mode' },
    { id: 'deepseek-v1', label: 'DeepSeek V1', provider: 'DeepSeek', providerColor: '#00b4d8', longcatModel: 'LongCat-Flash-Thinking', tier: 'reasoning', description: 'Math & proof specialist' },
    // Ultra Tier → LongCat-Flash-Thinking-2601
    { id: 'gpt-o3', label: 'GPT-o3', provider: 'OpenAI', providerColor: '#10a37f', longcatModel: 'LongCat-Flash-Thinking-2601', tier: 'ultra', description: 'Maximum deliberation' },
    { id: 'claude-opus-4.6', label: 'Claude Opus 4.6', provider: 'Anthropic', providerColor: '#d97706', longcatModel: 'LongCat-Flash-Thinking-2601', tier: 'ultra', description: 'Ultimate reasoning' },
    { id: 'gemini-3-pro', label: 'Gemini 3 Pro', provider: 'Google', providerColor: '#4285f4', longcatModel: 'LongCat-Flash-Thinking-2601', tier: 'ultra', description: 'Peak performance' },
    { id: 'deepseek-r1-ultra', label: 'DeepSeek R1', provider: 'DeepSeek', providerColor: '#00b4d8', longcatModel: 'LongCat-Flash-Thinking-2601', tier: 'ultra', description: 'Maximum reasoning scale' },
];

const TIER_LABELS: Record<string, string> = {
    speed: 'Speed',
    standard: 'Standard',
    reasoning: 'Reasoning',
    ultra: 'Ultra',
};

const TIER_ORDER: FrontierModel['tier'][] = ['speed', 'standard', 'reasoning', 'ultra'];

export function ChatInterface() {
    const {
        conversations,
        currentConversation,
        messages,
        isStreaming,
        streamState,
        sendMessage,
        createConversation,
        selectConversation,
        deleteConversation,
        stopStream,
        loadThoughtLogs,
        generateChatTitle,
    } = useDeepEx();

    const [input, setInput] = useState('');
    const [chatDepth, setChatDepth] = useState<ReasoningMode>('deep');
    const [selectedModelId, setSelectedModelId] = useState('gpt-o3');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isInChat, setIsInChat] = useState(false);

    // Random tagline — pick once per session, re-roll on new chat
    const [taglineIndex, setTaglineIndex] = useState(() => Math.floor(Math.random() * HERO_TAGLINES.length));
    const tagline = HERO_TAGLINES[taglineIndex];

    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
    const messagesAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    const heroInputRef = useRef<HTMLTextAreaElement>(null);

    // Profile popover
    const [showProfile, setShowProfile] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Get the current user info
    const [userMeta, setUserMeta] = useState<{ name: string; email: string }>({ name: '', email: '' });

    // Custom Dropdown State
    const [showModeDropdown, setShowModeDropdown] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const modelDropdownRef = useRef<HTMLDivElement>(null);

    // Derived: currently selected frontier model
    const selectedFrontier = FRONTIER_MODELS.find(m => m.id === selectedModelId)!;

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
                setUserMeta({
                    name: data.user.user_metadata?.full_name || data.user.user_metadata?.display_name || '',
                    email: data.user.email || '',
                });
            }
        });
    }, []);

    // Close popovers on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (showProfile && profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setShowProfile(false);
            }
            if (showModeDropdown && modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
                setShowModeDropdown(false);
            }
            if (showModelDropdown && modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showProfile, showModeDropdown, showModelDropdown]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };



    // ── Auto-scroll on new messages ─────────────────────────────
    useEffect(() => {
        if (autoScrollEnabled) {
            // Use 'auto' instead of 'smooth' when streaming to prevent the "pulling" sensation
            // that competes with manual user scroll actions.
            messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
        }
    }, [messages, streamState, autoScrollEnabled, isStreaming]);

    const handleScroll = () => {
        if (!messagesAreaRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesAreaRef.current;
        // If we are within 20px of the bottom, enable auto-scroll.
        // Smaller threshold (20 instead of 100) makes it easier for the user to "break out" of auto-scroll.
        const atBottom = scrollHeight - scrollTop - clientHeight < 20;
        setAutoScrollEnabled(atBottom);
    };

    // ── If a conversation is selected, enter chat mode ──────────
    useEffect(() => {
        if (currentConversation && messages.length > 0) {
            setIsInChat(true);
        }
    }, [currentConversation, messages]);

    // ── Focus input on chat mode ────────────────────────────────
    useEffect(() => {
        if (isInChat) {
            chatInputRef.current?.focus();
        }
    }, [isInChat]);

    // ── Image handling ──────────────────────────────────────────


    // ── Paste handler (Ctrl+V with image in clipboard) ──────────


    // ── Drag-and-drop state and handlers ────────────────────────


    // ── Handle send (both hero and chat) ────────────────────────
    const handleSend = useCallback(async (e?: FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isStreaming) return;

        const isFirstMessage = !isInChat;

        // If this is the first message, transition to chat
        if (isFirstMessage) {
            setIsInChat(true);
        }

        setInput('');
        // Reset textarea height
        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
        }
        if (heroInputRef.current) {
            heroInputRef.current.style.height = 'auto';
        }

        const frontier = FRONTIER_MODELS.find(m => m.id === selectedModelId);
        const messageText = trimmed;
        const convId = await sendMessage(messageText, chatDepth, undefined, frontier?.longcatModel);

        // Generate chat title after first message
        if (isFirstMessage && convId) {
            generateChatTitle(trimmed, convId).catch(() => { });
        }
    }, [input, isStreaming, isInChat, chatDepth, selectedModelId, sendMessage, generateChatTitle]);

    // ── Key handlers ────────────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Auto-resize textarea ────────────────────────────────────
    const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
    };

    // ── Sidebar handlers ───────────────────────────────────────
    const handleNewChat = () => {
        setIsInChat(false);
        setInput('');
        setSidebarOpen(false);
        createConversation();
        // Pick a new random tagline
        setTaglineIndex(Math.floor(Math.random() * HERO_TAGLINES.length));
    };

    const handleSelectConversation = (id: string) => {
        selectConversation(id);
        setSidebarOpen(false);
        setIsInChat(true);
    };

    return (
        <div className="app-layout">
            {/* Hidden file input for image attachment */}


            {/* ── Sidebar Overlay ──────────────────────────────────── */}
            <div
                className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            {/* ── Sidebar Drawer ───────────────────────────────────── */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <span className="sidebar-title">DeepEx</span>
                    <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <button
                    className="conversation-item"
                    style={{
                        margin: '8px 8px 0',
                        justifyContent: 'center',
                        border: '1px dashed var(--surface-border)',
                        color: 'var(--text-secondary)',
                        fontSize: '13px',
                        fontWeight: 500,
                    }}
                    onClick={handleNewChat}
                >
                    + New Chat
                </button>

                <div className="sidebar-section-label">Recent Chats</div>
                <div className="sidebar-conversations">
                    {conversations.map((c) => (
                        <div
                            key={c.id}
                            className={`conversation-item ${currentConversation?.id === c.id ? 'active' : ''}`}
                            onClick={() => handleSelectConversation(c.id)}
                        >
                            <span className="conversation-title">
                                {c.title || 'Untitled'}
                            </span>
                            <button
                                className="conversation-delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteConversation(c.id).then(() => {
                                        // If no conversations left, trigger new chat
                                        if (conversations.length <= 1) {
                                            handleNewChat();
                                        }
                                    });
                                }}
                            >
                                X
                            </button>
                        </div>
                    ))}

                    {conversations.length === 0 && (
                        <div style={{
                            padding: '20px 12px',
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                            fontSize: '12px',
                        }}>
                            No conversations yet
                        </div>
                    )}
                </div>

                {/* ── Profile Button (bottom of sidebar) ─────── */}
                <div className="sidebar-profile-area" ref={profileRef}>
                    {showProfile && (
                        <div className="profile-popover">
                            <div className="profile-popover-header">
                                <div className="profile-avatar">
                                    {userMeta.name ? userMeta.name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div className="profile-info">
                                    <span className="profile-name">{userMeta.name || 'User'}</span>
                                    <span className="profile-email">{userMeta.email}</span>
                                </div>
                            </div>
                            <div className="profile-popover-divider" />
                            <button className="profile-signout" onClick={handleSignOut}>
                                Sign Out
                            </button>
                        </div>
                    )}
                    <button
                        className="sidebar-profile-btn"
                        onClick={() => setShowProfile(!showProfile)}
                    >
                        <div className="profile-avatar-small">
                            {userMeta.name ? userMeta.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="sidebar-profile-text">
                            <span className="sidebar-profile-name">{userMeta.name || 'User'}</span>
                            <span className="sidebar-profile-email">{userMeta.email}</span>
                        </div>
                    </button>
                </div>
            </aside>

            {/* ── Top Header ───────────────────────────────────────── */}
            <header className="top-header">
                <div className="top-header-left">
                    <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} title="Open sidebar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                    <div className="header-logo-container">
                        <Logo className="header-logo" size={28} />
                        <span className="logo-text">DeepEx</span>
                    </div>
                </div>

                <div className="top-header-center">
                    {/* Model selector moved to chat bar */}
                </div>

                <div className="top-header-right">
                    <span className="header-badge">ENTERPRISE</span>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────── */}
            <div className={`main-content`}>

                {!isInChat ? (
                    /* ══ HERO LANDING STATE ══════════════════════════════ */
                    <div className="hero-landing">
                        <h1 className="hero-tagline">{tagline}</h1>

                        <div className="hero-input-wrapper">
                            <div className="hero-input-container">
                                <div className="mode-dropdown-container is-hero" ref={modeDropdownRef}>
                                    <button
                                        className={`mode-dropdown-trigger ${showModeDropdown ? 'active' : ''}`}
                                        onClick={() => setShowModeDropdown(!showModeDropdown)}
                                    >
                                        <span className="mode-label">
                                            {MODES.find(m => m.value === chatDepth)?.label}
                                        </span>
                                        <span className="mode-chevron">▾</span>
                                    </button>

                                    {showModeDropdown && (
                                        <div className="mode-dropdown-menu">
                                            {MODES.map((m) => (
                                                <div
                                                    key={m.value}
                                                    className={`mode-option ${chatDepth === m.value ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setChatDepth(m.value);
                                                        setShowModeDropdown(false);
                                                    }}
                                                >
                                                    <div className="mode-option-label">{m.label}</div>
                                                    <div className="mode-option-desc">{m.description}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <textarea
                                    ref={heroInputRef}
                                    className="hero-input"
                                    placeholder="How can DeepEx help you today?"
                                    value={input}
                                    onChange={handleTextareaInput}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    autoFocus
                                />

                                <div className="model-selector-container in-bar is-hero" ref={modelDropdownRef}>
                                    <button
                                        className={`model-selector-trigger ${showModelDropdown ? 'active' : ''}`}
                                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                                    >
                                        <span className="model-provider-dot" style={{ background: selectedFrontier?.providerColor }} />
                                        <span className="model-selector-name">{selectedFrontier?.label}</span>
                                        <span className="model-chevron">▾</span>
                                    </button>

                                    {showModelDropdown && (
                                        <div className="model-selector-dropdown">
                                            <div className="model-dropdown-header">Select Model</div>
                                            {TIER_ORDER.map(tier => (
                                                <div key={tier} className="model-tier-group">
                                                    <div className="model-tier-label">{TIER_LABELS[tier]}</div>
                                                    {FRONTIER_MODELS.filter(m => m.tier === tier).map(model => (
                                                        <div
                                                            key={model.id}
                                                            className={`model-option-item ${selectedModelId === model.id ? 'selected' : ''}`}
                                                            onClick={() => {
                                                                setSelectedModelId(model.id);
                                                                setShowModelDropdown(false);
                                                            }}
                                                        >
                                                            <span className="model-provider-dot" style={{ background: model.providerColor }} />
                                                            <div className="model-option-info">
                                                                <span className="model-option-name">{model.label}</span>
                                                                <span className="model-option-desc">{model.description}</span>
                                                            </div>
                                                            <span className="model-option-provider">{model.provider}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    className="hero-send-btn"
                                    onClick={() => handleSend()}
                                    disabled={!input.trim()}
                                    title="Send Message"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                        <polyline points="12 5 19 12 12 19"></polyline>
                                    </svg>
                                </button>
                            </div>

                        </div>

                    </div>
                ) : (
                    /* ══ CHAT VIEW STATE ════════════════════════════════ */
                    <div className="chat-view">
                        {/* Messages */}
                        <div className="messages-area" ref={messagesAreaRef} onScroll={handleScroll}>
                            <div className="messages-container">
                                {messages.map((msg) => (
                                    <MessageBubble key={msg.id} message={msg} loadThoughtLogs={loadThoughtLogs} />
                                ))}

                                {/* Live Thinking Block */}
                                {isStreaming && streamState && streamState.conversationId === currentConversation?.id && (
                                    <div className="message message-assistant">
                                        <ThinkingBlock state={streamState} />

                                        {/* Instant Mode Loader - Show while waiting for first content */}
                                        {streamState.mode === 'instant' && !streamState.finalContent && (
                                            <div className="instant-loader-container">
                                                <div className="tb-rotating-square" />
                                                <span className="instant-loader-text">Gathering response…</span>
                                            </div>
                                        )}

                                        {/* Streaming Final Answer */}
                                        {streamState.finalContent && (
                                            <div className="message-content">
                                                {streamState.finalContent}
                                                {!streamState.isComplete && <span className="typing-cursor" />}
                                            </div>
                                        )}

                                        {/* Error Display */}
                                        {streamState.error && (
                                            <div className="stream-error-banner">
                                                <span className="stream-error-icon">!</span>
                                                <span>{streamState.error}</span>
                                            </div>
                                        )}
                                    </div>
                                )}


                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* Chat Input */}
                        <div className="chat-input-area">
                            <div className="chat-input-container">
                                <div className="chat-input-row">
                                    <div className="mode-dropdown-container" ref={modeDropdownRef}>
                                        <button
                                            className={`mode-dropdown-trigger ${showModeDropdown ? 'active' : ''}`}
                                            onClick={() => setShowModeDropdown(!showModeDropdown)}
                                        >
                                            <span className="mode-label">
                                                {MODES.find(m => m.value === chatDepth)?.label}
                                            </span>
                                            <span className="mode-chevron">▾</span>
                                        </button>

                                        {showModeDropdown && (
                                            <div className="mode-dropdown-menu">
                                                {MODES.map((m) => (
                                                    <div
                                                        key={m.value}
                                                        className={`mode-option ${chatDepth === m.value ? 'selected' : ''}`}
                                                        onClick={() => {
                                                            setChatDepth(m.value);
                                                            setShowModeDropdown(false);
                                                        }}
                                                    >
                                                        <div className="mode-option-label">{m.label}</div>
                                                        <div className="mode-option-desc">{m.description}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="chat-input-wrapper">
                                        <textarea
                                            ref={chatInputRef}
                                            className="chat-input"
                                            placeholder="Ask DeepEx anything..."
                                            value={input}
                                            onChange={handleTextareaInput}
                                            onKeyDown={handleKeyDown}
                                            rows={1}
                                        />

                                        <div className="model-selector-container in-bar" ref={modelDropdownRef}>
                                            <button
                                                className={`model-selector-trigger ${showModelDropdown ? 'active' : ''}`}
                                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                            >
                                                <span className="model-provider-dot" style={{ background: selectedFrontier?.providerColor }} />
                                                <span className="model-selector-name">{selectedFrontier?.label}</span>
                                                <span className="model-chevron">▾</span>
                                            </button>

                                            {showModelDropdown && (
                                                <div className="model-selector-dropdown">
                                                    <div className="model-dropdown-header">Select Model</div>
                                                    {TIER_ORDER.map(tier => (
                                                        <div key={tier} className="model-tier-group">
                                                            <div className="model-tier-label">{TIER_LABELS[tier]}</div>
                                                            {FRONTIER_MODELS.filter(m => m.tier === tier).map(model => (
                                                                <div
                                                                    key={model.id}
                                                                    className={`model-option-item ${selectedModelId === model.id ? 'selected' : ''}`}
                                                                    onClick={() => {
                                                                        setSelectedModelId(model.id);
                                                                        setShowModelDropdown(false);
                                                                    }}
                                                                >
                                                                    <span className="model-provider-dot" style={{ background: model.providerColor }} />
                                                                    <div className="model-option-info">
                                                                        <span className="model-option-name">{model.label}</span>
                                                                        <span className="model-option-desc">{model.description}</span>
                                                                    </div>
                                                                    <span className="model-option-provider">{model.provider}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {isStreaming ? (
                                            <button className="stop-btn-square" onClick={stopStream} title="Stop generation">
                                                <div className="stop-icon"></div>
                                            </button>
                                        ) : (
                                            <button
                                                className="chat-send-btn"
                                                onClick={() => handleSend()}
                                                disabled={!input.trim()}
                                            >
                                                →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {/* ── Background Elements ───────────────────────────── */}
                <ShootingStars active={!isInChat} />
            </div>
        </div>
    );
}

export default ChatInterface;
