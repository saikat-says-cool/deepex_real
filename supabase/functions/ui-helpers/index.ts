// ============================================================
// DeepEx UI Helpers — Lightweight Edge Function
// Generates taglines and chat titles using Flash-Lite
// ============================================================

import { longcatComplete, MODELS } from '../_shared/longcat-client.ts';
import * as prompts from '../_shared/prompts.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, message } = await req.json();

        if (action === 'tagline') {
            const result = await longcatComplete(
                [
                    { role: 'system', content: prompts.TAGLINE_SYSTEM },
                    { role: 'user', content: prompts.TAGLINE_USER },
                ],
                { model: MODELS.FLASH_CHAT, temperature: 0.9, maxTokens: 50 }
            );

            return new Response(
                JSON.stringify({ tagline: result.content.trim() }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'chat_title' && message) {
            const result = await longcatComplete(
                [
                    { role: 'system', content: prompts.CHAT_TITLE_SYSTEM },
                    { role: 'user', content: prompts.chatTitleUserPrompt(message) },
                ],
                { model: MODELS.FLASH_CHAT, temperature: 0.5, maxTokens: 30 }
            );

            return new Response(
                JSON.stringify({ title: result.content.trim() }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action. Use "tagline" or "chat_title".' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
