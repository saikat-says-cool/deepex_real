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

const MODES: { value: ReasoningMode | 'auto'; label: string; description: string }[] = [
    { value: 'auto', label: 'Auto', description: 'DeepEx picks the best depth for you.' },
    { value: 'instant', label: 'Instant', description: 'Fast and direct for simple tasks.' },
    { value: 'deep', label: 'Deep', description: 'Detailed reasoning with verification.' },
    { value: 'ultra_deep', label: 'Ultra-Deep', description: 'Parallel solver logic for complex problems.' },
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
    const [chatDepth, setChatDepth] = useState<ReasoningMode | 'auto'>('auto');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isInChat, setIsInChat] = useState(false);

    // Random tagline — pick once per session, re-roll on new chat
    const [taglineIndex, setTaglineIndex] = useState(() => Math.floor(Math.random() * HERO_TAGLINES.length));
    const tagline = HERO_TAGLINES[taglineIndex];

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    const heroInputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Image upload state
    const [pendingImage, setPendingImage] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // Profile popover
    const [showProfile, setShowProfile] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Get the current user info
    const [userMeta, setUserMeta] = useState<{ name: string; email: string }>({ name: '', email: '' });

    // Custom Dropdown State
    const [showModeDropdown, setShowModeDropdown] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);

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
            // Profile popover
            if (showProfile && profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setShowProfile(false);
            }
            // Mode dropdown
            if (showModeDropdown && modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
                setShowModeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showProfile, showModeDropdown]);

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

    // ── Image handling ──────────────────────────────────────────
    const processImageFile = useCallback((file: File) => {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('Image must be under 10MB');
            return;
        }

        setPendingImage(file);
        setImagePreviewUrl(URL.createObjectURL(file));
    }, []);

    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processImageFile(file);
        // Reset the file input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [processImageFile]);

    const removePendingImage = useCallback(() => {
        if (imagePreviewUrl) {
            URL.revokeObjectURL(imagePreviewUrl);
        }
        setPendingImage(null);
        setImagePreviewUrl(null);
    }, [imagePreviewUrl]);

    const uploadImageToStorage = useCallback(async (file: File): Promise<string> => {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `chat-images/${fileName}`;

        const { error } = await supabase.storage
            .from('message-attachments')
            .upload(filePath, file, {
                contentType: file.type,
                upsert: false,
            });

        if (error) throw new Error(`Upload failed: ${error.message}`);

        const { data: urlData } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    }, []);

    // ── Paste handler (Ctrl+V with image in clipboard) ──────────
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    // Create a file with a proper name since clipboard images don't have one
                    const ext = item.type.split('/')[1] || 'png';
                    const namedFile = new File([file], `pasted-image-${Date.now()}.${ext}`, { type: item.type });
                    processImageFile(namedFile);
                }
                return;
            }
        }
    }, [processImageFile]);

    // ── Drag-and-drop state and handlers ────────────────────────
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragOver(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        dragCounterRef.current = 0;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                processImageFile(file);
            }
        }
    }, [processImageFile]);

    // ── Handle send (both hero and chat) ────────────────────────
    const handleSend = useCallback(async (e?: FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if ((!trimmed && !pendingImage) || isStreaming) return;

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

        // Upload image if present
        let imageUrl: string | undefined;
        if (pendingImage) {
            setIsUploadingImage(true);
            try {
                imageUrl = await uploadImageToStorage(pendingImage);
            } catch (err) {
                console.error('Image upload failed:', err);
                alert('Failed to upload image. Please try again.');
                setIsUploadingImage(false);
                return;
            }
            setIsUploadingImage(false);
            removePendingImage();
        }

        const finalMode = chatDepth === 'auto' ? undefined : chatDepth;
        const messageText = trimmed || 'What is in this image?';
        const convId = await sendMessage(messageText, finalMode, imageUrl);

        // Generate chat title after first message
        if (isFirstMessage && convId) {
            generateChatTitle(trimmed || 'Image Analysis', convId).catch(() => { });
        }
    }, [input, pendingImage, isStreaming, isInChat, chatDepth, sendMessage, generateChatTitle, uploadImageToStorage, removePendingImage]);

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
            <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
            />

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

                <div className="top-header-center">
                    {/* Mode toggle removed */}
                </div>

                <div className="top-header-right">
                    <span className="header-badge">ENTERPRISE</span>
                </div>
            </header>

            {/* ── Main Content ─────────────────────────────────────── */}
            <div
                className={`main-content ${isDragOver ? 'drag-over' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Drag overlay */}
                {isDragOver && (
                    <div className="drag-overlay">
                        <div className="drag-overlay-content">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>Drop image here</span>
                            <span className="drag-overlay-hint">JPEG, PNG, GIF, or WebP • Max 10MB</span>
                        </div>
                    </div>
                )}
                {!isInChat ? (
                    /* ══ HERO LANDING STATE ══════════════════════════════ */
                    <div className="hero-landing">
                        <h1 className="hero-tagline">{tagline}</h1>

                        <div className="hero-input-wrapper">
                            <div className="hero-input-container">
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
                                <textarea
                                    ref={heroInputRef}
                                    className="hero-input"
                                    placeholder="How can DeepEx help you today?"
                                    value={input}
                                    onChange={handleTextareaInput}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    rows={1}
                                    autoFocus
                                />
                                <button
                                    className="image-attach-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Attach Image"
                                    type="button"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                    </svg>
                                </button>
                                <button
                                    className="hero-send-btn"
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() && !pendingImage}
                                    title="Send Message"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                        <polyline points="12 5 19 12 12 19"></polyline>
                                    </svg>
                                </button>
                            </div>
                            {/* Image Preview */}
                            {imagePreviewUrl && (
                                <div className="image-preview-bar">
                                    <div className="image-preview-item">
                                        <img src={imagePreviewUrl} alt="Preview" className="image-preview-thumb" />
                                        <button className="image-preview-remove" onClick={removePendingImage} title="Remove image">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                        <span className="image-preview-label">{pendingImage?.name}</span>
                                    </div>
                                    {isUploadingImage && (
                                        <div className="image-upload-indicator">
                                            <div className="tb-spinner-ring" style={{ width: 14, height: 14 }} />
                                            <span>Uploading…</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="hero-branding">
                            Built by <a href="https://artificialyze.com" target="_blank" rel="noopener noreferrer">Artificialyze</a>
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
                                                {!streamState.isComplete && <span className="typing-cursor" />}
                                            </div>
                                        )}

                                        {/* Error Display */}
                                        {streamState.error && (
                                            <div className="stream-error-banner">
                                                <span className="stream-error-icon">⚠️</span>
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
                                        <button
                                            className="image-attach-btn chat-attach"
                                            onClick={() => fileInputRef.current?.click()}
                                            title="Attach Image"
                                            type="button"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                            </svg>
                                        </button>
                                        <textarea
                                            ref={chatInputRef}
                                            className="chat-input"
                                            placeholder={pendingImage ? 'Ask about this image...' : 'Ask DeepEx anything...'}
                                            value={input}
                                            onChange={handleTextareaInput}
                                            onKeyDown={handleKeyDown}
                                            onPaste={handlePaste}
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
                                                disabled={!input.trim() && !pendingImage}
                                            >
                                                →
                                            </button>
                                        )}
                                    </div>
                                    {/* Image Preview in Chat */}
                                    {imagePreviewUrl && (
                                        <div className="image-preview-bar chat-preview">
                                            <div className="image-preview-item">
                                                <img src={imagePreviewUrl} alt="Preview" className="image-preview-thumb" />
                                                <button className="image-preview-remove" onClick={removePendingImage} title="Remove image">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </button>
                                                <span className="image-preview-label">{pendingImage?.name}</span>
                                            </div>
                                            {isUploadingImage && (
                                                <div className="image-upload-indicator">
                                                    <div className="tb-spinner-ring" style={{ width: 14, height: 14 }} />
                                                    <span>Uploading…</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
