// ============================================================
// useDeepEx Hook
// Bridges the SSE stream client to React state
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { DeepExStreamClient } from '../lib/stream-client';
import type { StreamState } from '../lib/stream-client';
import { supabase } from '../lib/supabase';
import type { Conversation, Message, ReasoningMode, ThoughtLog } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Hook Return Type ─────────────────────────────────────────
interface UseDeepExReturn {
    // Conversation
    conversations: Conversation[];
    currentConversation: Conversation | null;
    messages: Message[];
    createConversation: () => Promise<string>;
    selectConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;

    // Messaging
    sendMessage: (content: string, modeOverride?: ReasoningMode, imageUrl?: string) => Promise<string | undefined>;
    stopStream: () => void;

    // Stream State
    streamState: StreamState;
    isStreaming: boolean;

    // Thought Logs
    loadThoughtLogs: (messageId: string) => Promise<ThoughtLog[]>;

    // UI Helpers
    fetchTagline: () => Promise<string>;
    generateChatTitle: (message: string, conversationId?: string) => Promise<void>;
}

export function useDeepEx(): UseDeepExReturn {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [streamState, setStreamState] = useState<StreamState>({
        messageId: null,
        mode: null,
        classification: null,
        steps: [],
        finalContent: '',
        isThinking: false,
        isFinalizing: false,
        isComplete: false,
        wasEscalated: false,
        confidence: null,
        assumptions: [],
        uncertaintyNotes: [],
        sources: [],
        error: null,
    });

    const clientRef = useRef<DeepExStreamClient | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const currentConvIdRef = useRef<string | null>(null);

    // Sync ref with current conversation
    useEffect(() => {
        currentConvIdRef.current = currentConversation?.id || null;
    }, [currentConversation]);

    // ── Initialize SSE client ─────────────────────────────────
    useEffect(() => {
        const client = new DeepExStreamClient(supabaseUrl, supabaseKey);
        const unsubscribe = client.onStateChange((state) => {
            setStreamState(state);
        });
        clientRef.current = client;
        return () => { unsubscribe(); };
    }, []);

    // ── Load conversations on mount ───────────────────────────
    useEffect(() => {
        loadConversations();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Conversation Management ────────────────────────────────
    const loadConversations = useCallback(async () => {
        const { data } = await supabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false });
        if (data) setConversations(data);
    }, []);

    const createConversation = useCallback(async (): Promise<string> => {
        // Just reset local state — don't insert into DB yet.
        // The DB row is created lazily on the first sendMessage.
        setCurrentConversation(null);
        setMessages([]);
        currentConvIdRef.current = null;
        return '';
    }, []);

    /** Actually persist the conversation to the DB (called on first send) */
    const ensureConversation = useCallback(async (): Promise<string> => {
        // If there's already a persisted conversation, return its ID
        if (currentConversation?.id) return currentConversation.id;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('conversations')
            .insert({ user_id: user.id, title: 'New Chat' })
            .select()
            .single();

        if (error) throw error;
        setConversations((prev) => [data, ...prev]);
        setCurrentConversation(data);
        currentConvIdRef.current = data.id;
        return data.id;
    }, [currentConversation]);

    const selectConversation = useCallback(async (id: string) => {
        const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single();

        if (conv) {
            setCurrentConversation(conv);
            currentConvIdRef.current = conv.id;

            const { data: msgs } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', id)
                .order('created_at', { ascending: true });

            if (msgs) setMessages(msgs);
        }
    }, []);

    const deleteConversation = useCallback(async (id: string) => {
        await supabase.from('conversations').delete().eq('id', id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConversation?.id === id) {
            setCurrentConversation(null);
            setMessages([]);
        }
    }, [currentConversation]);

    // ── Messaging ──────────────────────────────────────────────
    const sendMessage = useCallback(
        async (content: string, modeOverride?: ReasoningMode, imageUrl?: string, modelOverride?: string) => {
            if (!clientRef.current) return;

            // Ensure a persisted conversation exists (lazy create)
            const convId = await ensureConversation();

            // Optimistically add user message to UI
            const optimisticUserMsg: Message = {
                id: crypto.randomUUID(),
                conversation_id: convId,
                role: 'user',
                content,
                image_url: imageUrl || null,
                mode: null,
                was_escalated: false,
                confidence_score: null,
                assumptions: null,
                uncertainty_notes: null,
                intent_metadata: null,
                sources: null,
                total_thinking_time_ms: null,
                created_at: new Date().toISOString(),
            };
            if (currentConvIdRef.current === convId) {
                setMessages((prev) => [...prev, optimisticUserMsg]);
            }

            // Start streaming
            setIsStreaming(true);
            await clientRef.current.streamMessage(convId, content, modeOverride, imageUrl, modelOverride);

            // After stream completes, reload messages to get persisted versions.
            // In ultra-deep mode, the DB update may lag behind the SSE close,
            // so we poll for up to 10 seconds until the assistant message has content.
            const streamClient = clientRef.current;
            const assistantMsgId = streamClient?.getState().messageId;
            const finalState = streamClient?.getState();
            console.log(`[useDeepEx] Stream finished. assistantMsgId: ${assistantMsgId}, finalContent: ${finalState?.finalContent?.length ?? 0} chars, isComplete: ${finalState?.isComplete}, error: ${finalState?.error}`);

            let msgs: Message[] | null = null;
            for (let attempt = 0; attempt < 20; attempt++) {
                const { data } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', convId)
                    .order('created_at', { ascending: true });

                msgs = data;

                // Check if the assistant message has content
                if (assistantMsgId && msgs) {
                    const assistantMsg = msgs.find(m => m.id === assistantMsgId);
                    if (assistantMsg && assistantMsg.content) {
                        break;
                    }
                } else if (msgs && msgs.length > 0) {
                    // If we don't have an ID but have messages, just check the last one
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg.role === 'assistant' && lastMsg.content) {
                        break;
                    }
                }

                // Wait 500ms before retrying
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (msgs) {
                // If we STILL don't have the content in DB but we had it in the stream, 
                // we'll update the local message state so it doesn't look empty.
                if (assistantMsgId && finalState?.finalContent) {
                    const msgIndex = msgs.findIndex(m => m.id === assistantMsgId);
                    if (msgIndex !== -1 && !msgs[msgIndex].content) {
                        console.warn('[useDeepEx] DB message still empty after polling. Injecting stream content.');
                        msgs[msgIndex].content = finalState.finalContent;
                    }
                }

                if (currentConvIdRef.current === convId) {
                    setMessages(msgs);
                }
            }

            setIsStreaming(false);

            // Refresh conversations list (to reflect updated_at)
            loadConversations();

            return convId;
        },
        [ensureConversation, loadConversations]
    );

    const stopStream = useCallback(() => {
        clientRef.current?.cancel();
        setIsStreaming(false);
    }, []);

    // ── Thought Logs ───────────────────────────────────────────
    const loadThoughtLogs = useCallback(async (messageId: string): Promise<ThoughtLog[]> => {
        const { data } = await supabase
            .from('thought_logs')
            .select('*')
            .eq('message_id', messageId)
            .order('layer_order', { ascending: true });
        return (data || []) as ThoughtLog[];
    }, []);

    // ── UI Helpers ─────────────────────────────────────────────

    /** Fetch a fresh, AI-generated tagline from the ui-helpers Edge Function */
    const fetchTagline = useCallback(async (): Promise<string> => {
        try {
            const response = await fetch(
                `${supabaseUrl}/functions/v1/ui-helpers`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({ action: 'tagline' }),
                }
            );

            if (!response.ok) throw new Error('Tagline fetch failed');
            const data = await response.json();
            return data.tagline || 'Think Harder. Push limits.';
        } catch {
            return 'Think Harder. Push limits.';
        }
    }, []);

    /** Generate an AI-powered chat title from the first message */
    const generateChatTitle = useCallback(async (message: string, conversationId?: string): Promise<void> => {
        const convId = conversationId || currentConversation?.id;
        if (!convId) return;

        try {
            const response = await fetch(
                `${supabaseUrl}/functions/v1/ui-helpers`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({ action: 'chat_title', message }),
                }
            );

            if (!response.ok) throw new Error('Title generation failed');
            const data = await response.json();
            const title = data.title || message.slice(0, 50);

            // Update in DB
            await supabase
                .from('conversations')
                .update({ title })
                .eq('id', convId);

            // Update local state
            setConversations((prev) =>
                prev.map((c) => c.id === convId ? { ...c, title } : c)
            );
            setCurrentConversation((prev) => prev && prev.id === convId ? { ...prev, title } : prev);
        } catch {
            // Fallback: use truncated message
            const title = message.length > 50 ? message.slice(0, 50) + '...' : message;
            await supabase
                .from('conversations')
                .update({ title })
                .eq('id', convId);
            loadConversations();
        }
    }, [currentConversation, loadConversations]);

    return {
        conversations,
        currentConversation,
        messages,
        createConversation,
        selectConversation,
        deleteConversation,
        sendMessage,
        stopStream,
        streamState,
        isStreaming,
        loadThoughtLogs,
        fetchTagline,
        generateChatTitle,
    };
}
