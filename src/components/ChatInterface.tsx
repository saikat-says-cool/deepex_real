import React, { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { useDeepEx } from '../hooks/useDeepEx';
import { ThinkingBlock } from './ThinkingBlock';
import { MessageBubble } from './MessageBubble';
import { supabase } from '../lib/supabase';
import type { ReasoningMode } from '../types';

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

const MODES: { value: ReasoningMode | 'auto'; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'instant', label: 'Instant' },
    { value: 'deep', label: 'Deep' },
    { value: 'ultra_deep', label: 'Ultra-Deep' },
];

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
    const [mode, setMode] = useState<ReasoningMode | 'auto'>('auto');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isInChat, setIsInChat] = useState(false);

    // Random tagline — pick once per session, re-roll on new chat
    const [taglineIndex, setTaglineIndex] = useState(() => Math.floor(Math.random() * HERO_TAGLINES.length));
    const tagline = HERO_TAGLINES[taglineIndex];

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    const heroInputRef = useRef<HTMLInputElement>(null);

    // Profile popover
    const [showProfile, setShowProfile] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Get the current user info
    const [userMeta, setUserMeta] = useState<{ name: string; email: string }>({ name: '', email: '' });
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

    // Close profile popover on outside click
    useEffect(() => {
        if (!showProfile) return;
        const handleClick = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setShowProfile(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showProfile]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };



    // ── Auto-scroll on new messages ─────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamState]);

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

        const modeOverride = mode === 'auto' ? undefined : mode;
        const convId = await sendMessage(trimmed, modeOverride);

        // Generate chat title after first message
        if (isFirstMessage && convId) {
            generateChatTitle(trimmed, convId).catch(() => { });
        }
    }, [input, isStreaming, isInChat, mode, sendMessage, generateChatTitle]);

    // ── Key handlers ────────────────────────────────────────────
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleHeroKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
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
                        ✕
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
                                    deleteConversation(c.id);
                                }}
                            >
                                ✕
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
                    <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
                        ☰
                    </button>
                    <span className="logo-text">DeepEx 1.0</span>
                </div>

                <div className="top-header-right">
                    <span className="header-badge">ENTERPRISE</span>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────── */}
            <div className="main-content">
                {!isInChat ? (
                    /* ══ HERO LANDING STATE ══════════════════════════════ */
                    <div className="hero-landing">
                        <h1 className="hero-tagline">{tagline}</h1>

                        <div className="hero-input-wrapper">
                            <div className="hero-input-container">
                                <div className="mode-dropdown-container">
                                    <select
                                        className="mode-dropdown"
                                        value={mode}
                                        onChange={(e) => setMode(e.target.value as ReasoningMode | 'auto')}
                                    >
                                        {MODES.map((m) => (
                                            <option key={m.value} value={m.value}>
                                                {m.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <input
                                    ref={heroInputRef}
                                    type="text"
                                    className="hero-input"
                                    placeholder="How can DeepEx help you today?"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleHeroKeyDown}
                                    autoFocus
                                />
                                <button
                                    className="hero-send-btn"
                                    onClick={() => handleSend()}
                                    disabled={!input.trim()}
                                >
                                    →
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ══ CHAT VIEW STATE ════════════════════════════════ */
                    <div className="chat-view">
                        {/* Messages */}
                        <div className="messages-area">
                            <div className="messages-container">
                                {messages.map((msg) => (
                                    <MessageBubble key={msg.id} message={msg} loadThoughtLogs={loadThoughtLogs} />
                                ))}

                                {/* Live Thinking Block */}
                                {isStreaming && streamState && (
                                    <div className="message message-assistant">
                                        <ThinkingBlock state={streamState} />

                                        {/* Streaming Final Answer */}
                                        {streamState.finalContent && (
                                            <div className="message-content">
                                                {streamState.finalContent}
                                                <span className="typing-cursor" />
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
                                    <div className="mode-dropdown-container">
                                        <select
                                            className="mode-dropdown"
                                            value={mode}
                                            onChange={(e) => setMode(e.target.value as ReasoningMode | 'auto')}
                                        >
                                            {MODES.map((m) => (
                                                <option key={m.value} value={m.value}>
                                                    {m.label}
                                                </option>
                                            ))}
                                        </select>
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
            </div>
        </div>
    );
}
