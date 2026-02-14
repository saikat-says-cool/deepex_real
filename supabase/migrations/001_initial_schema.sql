-- ============================================================
-- DeepEx Database Schema
-- Adaptive Cognitive Reasoning Engine
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CONVERSATIONS TABLE
-- Top-level container for a user's chat session
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- Index for fast user lookup
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- ============================================================
-- 2. MESSAGES TABLE
-- Each message in a conversation (user or assistant)
-- Stores the final output + metadata about HOW it was generated
-- ============================================================
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE reasoning_mode AS ENUM ('instant', 'deep', 'ultra_deep');

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  
  -- Reasoning metadata (only for assistant messages)
  mode reasoning_mode DEFAULT NULL,
  was_escalated BOOLEAN DEFAULT FALSE,           -- Did it auto-escalate from Deep → Ultra-Deep?
  confidence_score INTEGER DEFAULT NULL,          -- 0-100
  assumptions JSONB DEFAULT NULL,                 -- ["assumption 1", "assumption 2"]
  uncertainty_notes JSONB DEFAULT NULL,           -- ["note 1", "note 2"]
  
  -- The Cortex classification output
  intent_metadata JSONB DEFAULT NULL,
  -- Schema: {
  --   domain: string,
  --   reasoning_modes: string[],
  --   complexity: "low" | "medium" | "high",
  --   stakes: "low" | "medium" | "high",
  --   uncertainty: "low" | "medium" | "high",
  --   recommended_mode: "instant" | "deep" | "ultra_deep",
  --   parallelism_needed: boolean
  -- }
  
  -- Web search sources (if grounding was used)
  sources JSONB DEFAULT NULL,
  -- Schema: [{ title: string, url: string, snippet: string }]
  
  -- Timing
  total_thinking_time_ms INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ============================================================
-- 3. THOUGHT LOGS TABLE
-- Every single layer of reasoning is stored here
-- This is what powers the "View Thinking" button
-- ============================================================
CREATE TYPE thought_layer AS ENUM (
  -- Cortex
  'classification',
  
  -- Deep Mode layers
  'decomposition',
  'primary_solver',
  'fast_critic',
  'refiner',
  'confidence_gate',
  
  -- Ultra-Deep Mode layers
  'deep_decomposition',
  'solver_a_standard',
  'solver_b_pessimist',
  'solver_c_creative',
  'skeptic_agent',
  'verifier_agent',
  'synthesizer',
  'meta_critic',
  'ultra_confidence',
  
  -- Special
  'escalation_trigger',
  'web_search'
);

CREATE TYPE thought_status AS ENUM ('pending', 'streaming', 'complete', 'error');

CREATE TABLE thought_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  
  -- What layer is this?
  layer thought_layer NOT NULL,
  layer_label TEXT NOT NULL,                      -- Human-readable label: "Skeptic Agent"
  layer_order INTEGER NOT NULL,                   -- Sequential order: 1, 2, 3...
  
  -- Content
  content TEXT DEFAULT '',                        -- The reasoning text
  artifact JSONB DEFAULT NULL,                    -- Structured output (problem_map, critic_report, etc.)
  
  -- Parallel solver grouping
  parallel_group TEXT DEFAULT NULL,               -- e.g., "ultra_solvers" to link A, B, C together
  
  -- Status tracking
  status thought_status DEFAULT 'pending',
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  duration_ms INTEGER DEFAULT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_thought_logs_message ON thought_logs(message_id, layer_order);
CREATE INDEX idx_thought_logs_parallel ON thought_logs(message_id, parallel_group);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE thought_logs ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see their own
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Messages: Users can see messages in their conversations
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

-- Thought logs: Users can see thought logs for their messages
CREATE POLICY "Users can view thought logs for own messages"
  ON thought_logs FOR SELECT
  USING (
    message_id IN (
      SELECT m.id FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access on conversations"
  ON conversations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on messages"
  ON messages FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on thought_logs"
  ON thought_logs FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 5. HELPER FUNCTIONS
-- ============================================================

-- Auto-update the conversation's updated_at when a message is added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Calculate thought log duration on completion
CREATE OR REPLACE FUNCTION calculate_thought_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'complete' AND NEW.started_at IS NOT NULL THEN
    NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_thought_duration
  BEFORE UPDATE ON thought_logs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_thought_duration();
