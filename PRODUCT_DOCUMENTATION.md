# DeepEx — Product Documentation

> **Adaptive Cognitive Reasoning Engine**
> *Built by Artificialyze*
> *Version 1.0 — Internal Technical Reference*

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Reasoning Pipeline — The Core Engine](#5-reasoning-pipeline--the-core-engine)
   - 5.1 [Phase 0: Cortex Classifier](#51-phase-0-cortex-classifier)
   - 5.2 [Instant Mode](#52-instant-mode)
   - 5.3 [Deep Mode (5-Layer Pipeline)](#53-deep-mode-5-layer-pipeline)
   - 5.4 [Ultra-Deep Mode (10+ Layer Pipeline)](#54-ultra-deep-mode-10-layer-pipeline)
   - 5.5 [Self-Escalation Mechanism](#55-self-escalation-mechanism)
   - 5.6 [Web Search Grounding](#56-web-search-grounding)
6. [Backend: Supabase Edge Functions](#6-backend-supabase-edge-functions)
   - 6.1 [reasoning-engine](#61-reasoning-engine)
   - 6.2 [reasoning-ultra-solve](#62-reasoning-ultra-solve)
   - 6.3 [reasoning-ultra-synth](#63-reasoning-ultra-synth)
   - 6.4 [ui-helpers](#64-ui-helpers)
   - 6.5 [Shared Modules (_shared/)](#65-shared-modules-_shared)
7. [Time-Aware Checkpointing System](#7-time-aware-checkpointing-system)
8. [SSE (Server-Sent Events) Protocol](#8-sse-server-sent-events-protocol)
9. [Database Schema](#9-database-schema)
10. [Frontend Application](#10-frontend-application)
    - 10.1 [Application Shell (App.tsx)](#101-application-shell-apptsx)
    - 10.2 [Landing Page](#102-landing-page)
    - 10.3 [Authentication Page](#103-authentication-page)
    - 10.4 [Chat Interface](#104-chat-interface)
    - 10.5 [Message Bubble](#105-message-bubble)
    - 10.6 [Thinking Block ("Glass Box")](#106-thinking-block-glass-box)
11. [State Management](#11-state-management)
    - 11.1 [SSE Stream Client](#111-sse-stream-client)
    - 11.2 [useDeepEx Hook](#112-usedeepex-hook)
12. [Type System](#12-type-system)
13. [API Key Management & Rotation](#13-api-key-management--rotation)
14. [Prompt Engineering](#14-prompt-engineering)
15. [Security Model](#15-security-model)
16. [Deployment](#16-deployment)
17. [Environment Variables](#17-environment-variables)
18. [Known Constraints & Design Decisions](#18-known-constraints--design-decisions)

---

## 1. Product Overview

**DeepEx** is a multi-layered cognitive reasoning engine that goes beyond simple AI chat. It decomposes problems, challenges assumptions, runs adversarial analysis, and synthesizes rigorous responses with transparent confidence scoring.

### Tagline
> *"Think Harder. Push Limits."*

### Core Differentiators

| Capability | Description |
|---|---|
| **Multi-Modal Reasoning** | Three reasoning modes (Instant, Deep, Ultra-Deep) selected automatically or manually |
| **Transparent Thinking** | Every reasoning step is visible in a "Glass Box" UI — users see the AI think |
| **Self-Escalation** | If confidence is too low in Deep Mode, the system automatically escalates to Ultra-Deep |
| **Adversarial Validation** | Ultra-Deep mode runs three parallel solvers and then attacks its own solutions |
| **Web Grounding** | Real-time web search integration for current facts via LangSearch API |
| **Confidence Scoring** | Every response includes a 0-100 confidence score with listed assumptions and uncertainties |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                       │
│                                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Landing  │  │   Auth   │  │    Chat       │  │  ThinkingBlock   │  │
│  │  Page    │  │   Page   │  │  Interface    │  │  ("Glass Box")   │  │
│  └─────────┘  └──────────┘  └──────┬───────┘  └────────┬─────────┘  │
│                                     │                    │            │
│                              ┌──────┴────────────────────┘            │
│                              │  useDeepEx Hook                        │
│                              │  + DeepExStreamClient (SSE)            │
│                              └──────────┬─────────────────            │
└─────────────────────────────────────────┼────────────────────────────┘
                                          │ SSE over HTTPS
                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   BACKEND (Supabase Edge Functions)                   │
│                                                                      │
│  ┌──────────────────┐   ┌────────────────────┐  ┌─────────────────┐ │
│  │ reasoning-engine │──▶│ reasoning-ultra-   │─▶│ reasoning-ultra-│ │
│  │ (Cortex + Deep)  │   │ solve (3 Solvers)  │  │ synth (Final)   │ │
│  └──────────────────┘   └────────────────────┘  └─────────────────┘ │
│                                                                      │
│  ┌──────────────┐   ┌────────────┐   ┌──────────────┐               │
│  │  ui-helpers  │   │ LongCat AI │   │  LangSearch  │               │
│  │ (tagline/    │   │   Client   │   │   Client     │               │
│  │  titles)     │   └────────────┘   └──────────────┘               │
│  └──────────────┘                                                    │
│                                                                      │
│  ┌── Shared ─────────────────────────────────────────────────────┐   │
│  │  types.ts │ prompts.ts │ sse-stream.ts │ key-rotation.ts      │   │
│  │  longcat-client.ts │ langsearch-client.ts                     │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      SUPABASE (PostgreSQL + Auth)                     │
│                                                                      │
│  ┌────────────────┐  ┌──────────┐  ┌──────────────┐                 │
│  │ conversations   │─▶│ messages │─▶│ thought_logs │                 │
│  └────────────────┘  └──────────┘  └──────────────┘                 │
│                                                                      │
│  Row Level Security │ UUID PKs │ JSONB Metadata │ Triggers            │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow (Per Request)

1. **User types a message** → frontend calls `sendMessage()` via `useDeepEx` hook
2. **SSE stream opens** → `DeepExStreamClient.streamMessage()` POSTs to `reasoning-engine`
3. **Cortex classifies** → determines domain, complexity, and recommended mode
4. **Mode executes** → Instant (single pass) / Deep (5 layers) / Ultra-Deep (10+ layers)
5. **Events stream back** → `layer_start`, `layer_chunk`, `layer_complete`, `final_chunk`, etc.
6. **UI updates in real-time** → ThinkingBlock shows each layer; final answer streams in
7. **Data persists** → messages and thought_logs saved to Supabase via service-role client

---

## 3. Technology Stack

### Frontend
| Technology | Purpose | Version |
|---|---|---|
| React | UI framework | 19.2.0 |
| TypeScript | Type safety | ~5.9.3 |
| Vite | Build tool & dev server | 7.3.1 |
| react-markdown | Markdown rendering | 10.1.0 |
| remark-gfm | GitHub Flavored Markdown | 4.0.1 |
| remark-math + rehype-katex | LaTeX math rendering | 6.0.0 / 7.0.1 |
| KaTeX | Math typesetting | 0.16.28 |
| @supabase/supabase-js | Supabase client | 2.95.3 |
| react-router-dom | Routing (available) | 7.13.0 |
| uuid | UUID generation | 13.0.0 |

### Backend
| Technology | Purpose |
|---|---|
| Supabase Edge Functions | Serverless Deno runtime |
| Supabase PostgreSQL | Persistent data storage |
| Supabase Auth | Email/password authentication |
| LongCat AI API | LLM inference (OpenAI-compatible) |
| LangSearch API | Web search grounding |

### External APIs
| API | Base URL | Models Used |
|---|---|---|
| LongCat AI | `https://api.longcat.chat/openai/v1` | Flash-Lite, Flash-Chat, Flash-Thinking, Flash-Thinking-2601 |
| LangSearch | `https://api.langsearch.com/v1/web-search` | Web search with summaries |

---

## 4. Directory Structure

```
deepex-app/
├── index.html                     # App entry point w/ SEO meta tags
├── package.json                   # Dependencies & scripts
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript project references
├── tsconfig.app.json              # App TypeScript config
├── tsconfig.node.json             # Node TypeScript config
├── .env                           # Environment variables (local)
│
├── src/
│   ├── main.tsx                   # React DOM entry point
│   ├── App.tsx                    # Root component — routing/auth gate
│   ├── index.css                  # Full design system (~2600+ lines)
│   │
│   ├── components/
│   │   ├── LandingPage.tsx        # Public landing page (760 lines)
│   │   ├── AuthPage.tsx           # Login / Signup form
│   │   ├── ChatInterface.tsx      # Main chat UI w/ sidebar
│   │   ├── MessageBubble.tsx      # Single message renderer
│   │   └── ThinkingBlock.tsx      # "Glass Box" reasoning visualizer
│   │
│   ├── hooks/
│   │   └── useDeepEx.ts           # Core state management hook
│   │
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client initialization
│   │   └── stream-client.ts       # SSE client for reasoning engine
│   │
│   └── types/
│       └── index.ts               # All TypeScript types (211 lines)
│
└── supabase/
    ├── migrations/
    │   └── 001_initial_schema.sql # Database schema + RLS + triggers
    │
    └── functions/
        ├── _shared/
        │   ├── types.ts           # Deno-compatible type mirror
        │   ├── prompts.ts         # All prompt templates (376 lines)
        │   ├── sse-stream.ts      # SSEStream class (server-side)
        │   ├── longcat-client.ts  # LongCat API client (streaming + non-streaming)
        │   ├── langsearch-client.ts # LangSearch web search client
        │   └── key-rotation.ts    # API key rotation w/ rate-limit awareness
        │
        ├── reasoning-engine/
        │   └── index.ts           # Main orchestrator (971 lines)
        │
        ├── reasoning-ultra-solve/
        │   └── index.ts           # Ultra-Deep Stage 1: 3 parallel solvers
        │
        ├── reasoning-ultra-synth/
        │   └── index.ts           # Ultra-Deep Stage 2: synthesis pipeline
        │
        └── ui-helpers/
            └── index.ts           # Tagline & chat title generation
```

---

## 5. Reasoning Pipeline — The Core Engine

### 5.1 Phase 0: Cortex Classifier

Every query begins with the **Cortex** — a fast classifier that analyzes the query across multiple dimensions.

**Model Used:** `LongCat-Flash-Chat` (temperature 0.1)

**Output Schema (JSON):**
```json
{
  "domain": "math|coding|strategy|philosophy|prediction|creative|social|science|general",
  "reasoning_modes": ["symbolic", "probabilistic", "causal", ...],
  "complexity": "low|medium|high",
  "stakes": "low|medium|high",
  "uncertainty": "low|medium|high",
  "recommended_mode": "instant|deep|ultra_deep",
  "parallelism_needed": true|false,
  "needs_web_search": true|false,
  "search_queries": ["optional query 1", "optional query 2"]
}
```

**Classification Rules:**
- **instant** → Simple rewrites, greetings, translations, factual lookups
- **deep** → Medium complexity, single solver path sufficient
- **ultra_deep** → High complexity OR high stakes OR high uncertainty
- The user can override the auto-selected mode via a dropdown

### 5.2 Instant Mode

Single-pass response using `LongCat-Flash-Thinking` with thinking enabled (budget: 2048 tokens).

**Pipeline:** `Cortex → [Web Search] → Stream Response`

If streaming yields no content, a non-streaming fallback request is made. The response is saved with a default confidence of 95.

### 5.3 Deep Mode (5-Layer Pipeline)

```
Cortex → [Web Search] → Decomposition → Primary Solver → Fast Critic → Refiner → Confidence Gate
```

| Layer | Model | Temperature | Thinking Budget | Output |
|---|---|---|---|---|
| Decomposition | Flash-Thinking | 0.3 | 2048 | ProblemMap JSON |
| Primary Solver | Flash-Thinking (streaming) | 0.3 | 4096 | Free-text solution |
| Fast Critic | Flash-Thinking | 0.3 | 1024 | CriticReport JSON |
| Refiner | Flash-Thinking (streaming) | 0.3 | 2048 | Polished answer |
| Confidence Gate | Flash-Chat | 0.3 | — | ConfidenceResult JSON |

**Layer Details:**

1. **Decomposition** — Breaks the query into: facts, intent, constraints, unknowns, output_type
2. **Primary Solver** — Produces a step-by-step reasoned solution (streamed to UI)
3. **Fast Critic** — Attacks the solution: finds logical gaps, weak assumptions, missing angles
4. **Refiner** — Takes the solution + critic feedback, produces an improved answer (streamed)
5. **Confidence Gate** — Scores confidence 0-100, lists assumptions and uncertainty notes

**Escalation Decision:**
If `confidence < 70` OR `critic.missing_angles.length > 0`, the system escalates to Ultra-Deep mode automatically.

### 5.4 Ultra-Deep Mode (10+ Layer Pipeline)

Ultra-Deep mode is split across **three chained Edge Functions** to work within Supabase's execution time limits:

```
Stage 1 (reasoning-ultra-solve):
  Deep Decomposition → [Parallel: Solver A + Solver B + Solver C]

Stage 2 (reasoning-ultra-synth):
  Skeptic Agent → Verifier Agent → Synthesizer → Meta-Critic → [Re-Synthesizer] → Final Confidence
```

#### Stage 1: Triple Parallel Solvers

| Solver | Perspective | Temperature | Model |
|---|---|---|---|
| Solver A | Standard/Mainstream | 0.3 | Flash-Thinking |
| Solver B | Pessimist/Failure Mode | 0.5 | Flash-Thinking |
| Solver C | Creative/Contrarian | 0.8 | Flash-Thinking |

All three run via `Promise.all()` for true parallelism. Each has a 4096-token thinking budget.

#### Stage 2: Adversarial Synthesis

1. **Skeptic Agent** — Attacks all three solutions: finds contradictions, weak points, unresolved questions
2. **Verifier Agent** — Checks logical validity: flow, assumptions, consistency
3. **Synthesizer** — Merges the best elements from all sources into one definitive answer
4. **Meta-Critic** — Final quality check: does it fully answer the user? What's missing?
5. **Re-Synthesis** (conditional) — If meta-critic finds gaps, re-synthesizes with feedback
6. **Final Confidence** — Ultra-Deep confidence assessment (0-100)

### 5.5 Self-Escalation Mechanism

When Deep Mode's confidence gate returns a score below 70, or the critic identifies missing angles, the system:

1. Emits an `escalation` SSE event
2. Updates the message record (`was_escalated: true`, `mode: 'ultra_deep'`)
3. Emits `stage_data` with `stage: 'needs_ultra'`
4. The frontend's SSE client captures this and automatically chains to `reasoning-ultra-solve`

### 5.6 Web Search Grounding

**Trigger:** The Cortex sets `needs_web_search: true`, or the `shouldSearch()` heuristic detects temporal/factual patterns (regex-based).

**No-Search Domains:** mathematics, logic, philosophy, creative_writing, coding, abstract_reasoning

**Search Indicators (regex):**
- Temporal: `latest`, `recent`, `current`, `today`, `2024`, `2025`, `2026`
- Factual: `who is`, `what is`, `price of`, `cost of`
- Verification: `is it true`, `fact check`, `verify`
- Entities: `company`, `stock`, `weather`, `election`

**Process:**
1. Execute 1-2 search queries via LangSearch (max 4 results each)
2. Deduplicate results by URL
3. Build a formatted search context string injected into subsequent prompts
4. Store sources in the message record

---

## 6. Backend: Supabase Edge Functions

### 6.1 reasoning-engine

**File:** `supabase/functions/reasoning-engine/index.ts` (971 lines)

**Responsibilities:**
- Cortex classification
- Web search execution
- Instant mode (full pipeline)
- Deep mode (full pipeline)
- Deep mode checkpoint continuation
- Decides whether to escalate to Ultra-Deep
- Emits `stage_data` for frontend to chain to Ultra functions

**Endpoints handled:**
- Fresh request: `{ conversation_id, message, mode_override }`
- Continuation: `{ stage: 'continue_deep', checkpoint: { continue_from, ... } }`

### 6.2 reasoning-ultra-solve

**File:** `supabase/functions/reasoning-ultra-solve/index.ts` (320 lines)

**Responsibilities:**
- Deep Decomposition (extended problem analysis)
- Triple parallel solvers (A: Standard, B: Pessimist, C: Creative)
- Emits solver results as `stage_data` for the synth function

### 6.3 reasoning-ultra-synth

**File:** `supabase/functions/reasoning-ultra-synth/index.ts` (716 lines)

**Responsibilities:**
- Skeptic Agent
- Verifier Agent
- Synthesizer (with streaming + fallback)
- Meta-Critic (with conditional re-synthesis loop)
- Final Confidence Assessment
- Persists the final answer to the database

### 6.4 ui-helpers

**File:** `supabase/functions/ui-helpers/index.ts` (63 lines)

**Actions:**
- `tagline` — Generates a fresh hero tagline (Flash-Chat, temp 0.9)
- `chat_title` — Generates a conversation title from the first message (Flash-Chat, temp 0.5)

### 6.5 Shared Modules (_shared/)

| File | Purpose |
|---|---|
| `types.ts` | Deno-compatible mirror of `src/types/index.ts` |
| `prompts.ts` | All prompt templates (376 lines, 17 prompt constants) |
| `sse-stream.ts` | `SSEStream` class — server-side event emitter |
| `longcat-client.ts` | `longcatComplete()` and `longcatStream()` — LLM API client |
| `langsearch-client.ts` | `webSearch()`, `buildSearchContext()`, `shouldSearch()` |
| `key-rotation.ts` | `KeyRotator` class + singleton instances for LongCat and LangSearch |

---

## 7. Time-Aware Checkpointing System

Supabase Edge Functions have a ~150-second execution limit. DeepEx implements **time-aware checkpointing** to gracefully handle long-running pipelines.

**Budget:** `TIMEOUT_BUDGET_MS = 120_000` (80% of 150s limit)

**Mechanism:**
1. After each layer completes, the function checks: `(Date.now() - startTime) > TIMEOUT_BUDGET_MS`
2. If "running hot," it emits a `stage_data` event containing a `checkpoint` object
3. The checkpoint includes: `continue_from` (layer name) + all accumulated state
4. The frontend captures this and re-invokes the same function with the checkpoint data
5. The function resumes from exactly where it left off

**Checkpoint Types:**

| Function | Stage Name | Continue-From Values |
|---|---|---|
| reasoning-engine | `continue_deep` | `primary_solver`, `fast_critic`, `refiner`, `confidence_gate` |
| reasoning-ultra-solve | `continue_ultra_solve` | `solvers` |
| reasoning-ultra-synth | `continue_ultra_synth` | `verifier`, `synthesizer`, `meta_critic`, `confidence` |

**Safety Limit:** The frontend caps at 10 continuations per stage to prevent infinite loops.

---

## 8. SSE (Server-Sent Events) Protocol

### Event Types

| Event | Purpose | Key Fields |
|---|---|---|
| `classification` | Cortex result | `metadata: IntentMetadata` |
| `mode_selected` | Mode chosen | `mode: ReasoningMode` |
| `layer_start` | Layer begins | `layer, layer_label, parallel_group?` |
| `layer_chunk` | Streaming text | `layer, content, parallel_group?` |
| `layer_artifact` | Structured JSON | `layer, artifact` |
| `layer_complete` | Layer finishes | `layer, layer_label` |
| `escalation` | Deep → Ultra | `content: reason` |
| `parallel_start` | Triple solvers begin | `parallel_group: 'ultra_solvers'` |
| `stage_data` | Chaining data | Full state for next function |
| `final_start` | Answer begins | `message_id` |
| `final_chunk` | Answer streaming | `content` |
| `final_complete` | Response done | `confidence, assumptions, uncertainty_notes, sources` |
| `error` | Error occurred | `error: message` |

### Wire Format
```
data: {"type":"layer_start","layer":"decomposition","layer_label":"Decomposing Problem","timestamp":1234567890}\n\n
```

---

## 9. Database Schema

### Tables

#### `conversations`
| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (FK → auth.users) | Owner |
| title | TEXT | Conversation title (AI-generated or default) |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger |
| is_archived | BOOLEAN | Soft archive flag |

#### `messages`
| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| conversation_id | UUID (FK) | Parent conversation |
| role | ENUM | `user`, `assistant`, `system` |
| content | TEXT | Message text |
| mode | ENUM | `instant`, `deep`, `ultra_deep` |
| was_escalated | BOOLEAN | Deep → Ultra-Deep flag |
| confidence_score | INTEGER | 0-100 |
| assumptions | JSONB | Array of assumption strings |
| uncertainty_notes | JSONB | Array of uncertainty strings |
| intent_metadata | JSONB | Full Cortex classification |
| sources | JSONB | Web search sources array |
| total_thinking_time_ms | INTEGER | End-to-end processing time |
| created_at | TIMESTAMPTZ | Creation time |

#### `thought_logs`
| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| message_id | UUID (FK) | Parent message |
| layer | ENUM | See ThoughtLayer enum |
| layer_label | TEXT | Human-readable name |
| layer_order | INTEGER | Sequential order |
| content | TEXT | Reasoning text |
| artifact | JSONB | Structured output |
| parallel_group | TEXT | e.g., `ultra_solvers` |
| status | ENUM | `pending`, `streaming`, `complete`, `error` |
| started_at | TIMESTAMPTZ | Layer start time |
| completed_at | TIMESTAMPTZ | Layer end time |
| duration_ms | INTEGER | Auto-calculated via trigger |
| created_at | TIMESTAMPTZ | Row creation time |

### Database Triggers
1. **`trigger_update_conversation_timestamp`** — After INSERT on messages, updates `conversations.updated_at`
2. **`trigger_calculate_thought_duration`** — Before UPDATE on thought_logs, calculates `duration_ms` from timestamps

### Indexes
- `idx_conversations_user_id` — Fast user lookup
- `idx_conversations_updated` — Sort by recent
- `idx_messages_conversation` — Messages by conversation + time
- `idx_thought_logs_message` — Thought logs by message + order
- `idx_thought_logs_parallel` — Parallel group queries

---

## 10. Frontend Application

### 10.1 Application Shell (App.tsx)

Three-state view controller:
- **`landing`** → `LandingPage` (unauthenticated default)
- **`auth`** → `AuthPage` (login/signup)
- **`app`** → `ChatInterface` (authenticated)

Session management uses `supabase.auth.onAuthStateChange()` for reactive auth state.

### 10.2 Landing Page

A 760-line marketing page featuring:
- Hero section with animated tagline
- Feature showcase (Instant, Deep, Ultra-Deep modes)
- Architecture visualization
- "How it Works" section
- 4-column footer with Artificialyze branding
- "Get Started" CTA → navigates to auth

### 10.3 Authentication Page

- Email/password auth via Supabase
- Sign Up captures `full_name` stored in `user_metadata`
- Sign In uses `signInWithPassword()`
- Toggle between Sign Up / Sign In modes
- Error display for validation failures
- Scoped CSS via inline `<style>` tag

### 10.4 Chat Interface

Two-state UI:
1. **Hero Landing** — Centered tagline + input field (pre-chat)
2. **Chat View** — Messages area + bottom input bar (in-chat)

**Features:**
- Sidebar drawer with conversation history (hamburger toggle)
- Conversation CRUD: create, select, delete
- Mode selector dropdown (Auto, Instant, Deep, Ultra-Deep)
- Auto-growing textarea
- Stop generation button (square icon)
- Profile popover (bottom of sidebar): name, email, sign out
- Auto-scroll on new messages
- Random tagline rotation per session

### 10.5 Message Bubble

Renders individual messages with:
- Markdown rendering (react-markdown + remark-gfm)
- LaTeX math support (remark-math + rehype-katex)
- Copy button (clipboard API)
- Classification tags (domain, mode, reasoning types)
- Confidence badge (color-coded: green ≥90, yellow ≥70, red <70)
- "View Thinking" expandable section (loads thought_logs from DB)
- "View Sources" button (links to web search results)
- Thinking time display

### 10.6 Thinking Block ("Glass Box")

Real-time visualization of the AI's reasoning process:
- Collapsible header with step count
- Classification tags (domain, mode, reasoning types, escalation badge)
- Sequential steps with status indicators (pending/active/complete)
- Duration display per step
- Parallel solver view (triple-column layout for Ultra-Deep)
- Content preview for each step (text or JSON artifact)

---

## 11. State Management

### 11.1 SSE Stream Client

**File:** `src/lib/stream-client.ts` (464 lines)

**Class:** `DeepExStreamClient`

**Responsibilities:**
- Opens SSE connections to Edge Functions
- Processes incoming events and updates internal state
- Orchestrates chained function calls (multi-stage Ultra-Deep)
- Handles checkpoint/continuation loops
- Provides observable state via listener pattern

**Key State (`StreamState`):**
```typescript
{
  messageId, mode, classification,    // Identity
  steps: ThinkingStep[],              // All reasoning layers
  finalContent,                       // Accumulated answer text
  isThinking, isFinalizing, isComplete, // Progress flags
  wasEscalated,                       // Escalation flag
  confidence, assumptions, uncertaintyNotes, sources, // Metadata
  error                               // Error state
}
```

**Orchestration Flow in `streamMessage()`:**
1. POST to `reasoning-engine` → capture stage_data
2. Loop: while `stage === 'continue_deep'` → re-call `reasoning-engine`
3. If `stage === 'needs_ultra'` → POST to `reasoning-ultra-solve`
4. Loop: while `stage === 'continue_ultra_solve'` → re-call solve
5. If solver results present → POST to `reasoning-ultra-synth`
6. Loop: while `stage === 'continue_ultra_synth'` → re-call synth

### 11.2 useDeepEx Hook

**File:** `src/hooks/useDeepEx.ts` (315 lines)

**Bridges** `DeepExStreamClient` ↔ React component state.

**Responsibilities:**
- Conversation CRUD (lazy creation on first send)
- Message management with optimistic UI updates
- Stream state subscription and forwarding
- Thought log loading
- Chat title generation (AI-powered)
- Tagline fetching
- Post-stream polling for DB consistency

**Lazy Conversation Creation:**
Conversations are NOT created in the database until the first message is sent. `createConversation()` only resets local state; `ensureConversation()` actually persists.

**Post-Stream Polling:**
After the stream completes, the hook polls up to 5 times (500ms intervals) waiting for the assistant message to have content in the database, handling the case where DB writes lag behind SSE close.

---

## 12. Type System

Types are defined in two mirrored files:
- **Frontend:** `src/types/index.ts` (211 lines)
- **Backend:** `supabase/functions/_shared/types.ts` (142 lines)

### Key Type Enumerations

| Type | Values |
|---|---|
| `ReasoningMode` | `instant`, `deep`, `ultra_deep` |
| `Domain` | `math`, `coding`, `strategy`, `philosophy`, `prediction`, `creative`, `social`, `science`, `general` |
| `ReasoningType` | `symbolic`, `probabilistic`, `causal`, `strategic`, `temporal`, `creative`, `social`, `abductive`, `optimization`, `meta` |
| `Severity` | `low`, `medium`, `high` |
| `ThoughtLayer` | 17 values covering Cortex, Deep, Ultra-Deep, and Special layers |
| `ThoughtStatus` | `pending`, `streaming`, `complete`, `error` |
| `SSEEventType` | 13 event types (see Section 8) |

### Structured Artifacts

| Interface | Used By | Fields |
|---|---|---|
| `ProblemMap` | Decomposition | facts, intent, constraints, unknowns, output_type |
| `CriticReport` | Fast Critic | issues, confidence_flags, missing_angles |
| `SkepticReport` | Skeptic Agent | contradictions, weak_points, unresolved_questions |
| `VerificationReport` | Verifier | logical_flow_valid, assumption_issues, consistency_issues, overall_validity |
| `ConfidenceResult` | Confidence Gates | score, assumptions, uncertainty_notes |
| `MetaCriticReport` | Meta-Critic | fully_answers_user, missing_elements, quality_assessment |

---

## 13. API Key Management & Rotation

**File:** `supabase/functions/_shared/key-rotation.ts`

**Class:** `KeyRotator`

**Algorithm:** Round-robin with rate-limit awareness.

**Features:**
- Tracks per-key state: `lastUsed`, `errorCount`, `isRateLimited`, `rateLimitedUntil`
- On 429 errors: marks key as rate-limited with configurable cooldown (default 60s)
- On success: resets error count
- If all keys are rate-limited: returns the one recovering soonest
- Automatic retry on rate limit (recursive call with next key)

**Key Discovery:**
Keys are loaded dynamically from environment variables:
- `LONGCAT_API_KEY_1`, `LONGCAT_API_KEY_2`, ... (sorted numerically)
- `LANGSEARCH_API_KEY_1`, `LANGSEARCH_API_KEY_2`, ...
- Fallback to `LONGCAT_API_KEY` / `LANGSEARCH_API_KEY` if numbered keys absent

**Singleton Instances:**
- `longcatRotator` — Used by all LongCat API calls
- `langsearchRotator` — Used by all LangSearch API calls

---

## 14. Prompt Engineering

**File:** `supabase/functions/_shared/prompts.ts` (376 lines)

Every prompt includes the **DeepEx Identity Preamble** (`DEEPEX_IDENTITY`), which instructs the LLM to:
- Identify as "DeepEx, built by Artificialyze"
- Never claim to be another AI (LongCat, Claude, ChatGPT, Gemini)
- Never mention the underlying model or API provider
- Describe its multi-layer reasoning architecture when asked

### Prompt Catalog

| Constant | Layer | Output Format |
|---|---|---|
| `CORTEX_SYSTEM` | Classification | JSON (IntentMetadata) |
| `DECOMPOSITION_SYSTEM` | Problem Decomposition | JSON (ProblemMap) |
| `PRIMARY_SOLVER_SYSTEM` | Primary Solver | Free text |
| `FAST_CRITIC_SYSTEM` | Fast Critic | JSON (CriticReport) |
| `REFINER_SYSTEM` | Answer Refiner | Free text |
| `CONFIDENCE_SYSTEM` | Confidence Gate | JSON (ConfidenceResult) |
| `DEEP_DECOMPOSITION_SYSTEM` | Ultra Decomposition | JSON (extended ProblemMap) |
| `SOLVER_A_SYSTEM` | Standard Solver | Free text |
| `SOLVER_B_SYSTEM` | Pessimist Solver | Free text |
| `SOLVER_C_SYSTEM` | Creative Solver | Free text |
| `SKEPTIC_SYSTEM` | Skeptic Agent | JSON (SkepticReport) |
| `VERIFIER_SYSTEM` | Verifier Agent | JSON (VerificationReport) |
| `SYNTHESIZER_SYSTEM` | Answer Synthesizer | Free text |
| `META_CRITIC_SYSTEM` | Meta-Critic | JSON (MetaCriticReport) |
| `INSTANT_SYSTEM` | Instant Mode | Free text |
| `TAGLINE_SYSTEM` | Hero Tagline | Plain text (3-6 words) |
| `CHAT_TITLE_SYSTEM` | Chat Title | Plain text (3-6 words) |

### Conversation History

All reasoning prompts receive conversation history (up to 16 turns, 2000 chars per turn) appended to the system prompt. This ensures contextual awareness across multi-turn conversations.

---

## 15. Security Model

### Row Level Security (RLS)

All three tables have RLS enabled:

| Policy | Table | Effect |
|---|---|---|
| Users see own conversations | conversations | SELECT where `user_id = auth.uid()` |
| Users create own conversations | conversations | INSERT where `user_id = auth.uid()` |
| Users update own conversations | conversations | UPDATE where `user_id = auth.uid()` |
| Users delete own conversations | conversations | DELETE where `user_id = auth.uid()` |
| Users see messages in own convos | messages | SELECT via subquery on conversations |
| Users insert messages in own convos | messages | INSERT via subquery on conversations |
| Users see thought logs for own messages | thought_logs | SELECT via join through messages → conversations |
| Service role full access | all tables | ALL operations (for Edge Functions) |

### API Key Security
- LongCat and LangSearch API keys are stored as Supabase secrets (environment variables)
- Keys never reach the frontend
- The frontend uses only the Supabase anon key for authenticated requests
- Service role key is used exclusively in Edge Functions

### Authentication
- Email/password via Supabase Auth
- Sign-up stores `full_name` and `display_name` in user metadata
- Session managed via `supabase.auth.onAuthStateChange()`

---

## 16. Deployment

### Target Platform
- **Frontend:** Vercel (static SPA build via `vite build`)
- **Backend:** Supabase Cloud (Edge Functions + PostgreSQL)

### Build Command
```bash
npm run build   # Runs: tsc -b && vite build
```

### Required Vercel Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Supabase Secrets (Edge Function Env)
- `SUPABASE_URL` (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)
- `LONGCAT_API_KEY` or `LONGCAT_API_KEY_1`, `LONGCAT_API_KEY_2`, ...
- `LANGSEARCH_API_KEY` or `LANGSEARCH_API_KEY_1`, `LANGSEARCH_API_KEY_2`, ...

---

## 17. Environment Variables

### Frontend (.env)
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

### Backend (Supabase Secrets)
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase |
| `LONGCAT_API_KEY_N` | LongCat AI API keys (N = 1, 2, 3...) |
| `LANGSEARCH_API_KEY_N` | LangSearch API keys (N = 1, 2, 3...) |

---

## 18. Known Constraints & Design Decisions

### 1. Edge Function Time Limit
Supabase Edge Functions have a ~150s execution limit. The checkpointing system (Section 7) solves this by splitting long pipelines into a resumable invocation chain.

### 2. Frontend-Driven Orchestration
The frontend (not the backend) orchestrates the multi-stage Ultra-Deep pipeline. The SSE client captures `stage_data` events and makes sequential calls to the next Edge Function. This avoids the need for function-to-function calls in Supabase.

### 3. Lazy Conversation Creation
Conversations are not persisted until the first message is sent. This prevents empty conversation rows in the database.

### 4. Optimistic UI
User messages are displayed immediately (before the backend confirms). After the stream completes, messages are reloaded from the database for consistency.

### 5. Post-Stream Polling
After an SSE stream closes, the hook polls the database up to 5 times (500ms interval) for the assistant message content. This handles cases where the DB write lags behind the SSE close event (especially in Ultra-Deep mode).

### 6. Type Duplication
Types are maintained in two files (`src/types/index.ts` and `supabase/functions/_shared/types.ts`) because the frontend uses TypeScript (Node/browser) and the backend uses Deno. They must be kept in sync manually.

### 7. LLM Model Selection Strategy
| Use Case | Model | Rationale |
|---|---|---|
| Cortex Classification | Flash-Chat | Fast, accurate classification |
| Confidence Gates (Deep) | Flash-Chat | Simple scoring task |
| Instant Mode | Flash-Thinking | Balanced reasoning |
| All Deep/Ultra layers | Flash-Thinking-2601 | Latest thinking model for deep reasoning |
| Taglines | Flash-Chat (temp 0.9) | High creativity |
| Chat Titles | Flash-Chat (temp 0.5) | Balanced creativity/accuracy |

### 8. Streaming with Fallback
Both Instant Mode and Ultra-Deep Synthesizer implement a dual strategy: try streaming first, and if the stream yields no content, fall back to a non-streaming request. This handles edge cases where the streaming API returns empty.

### 9. Identity Enforcement
Every system prompt includes `DEEPEX_IDENTITY`, ensuring the LLM always identifies as "DeepEx" and never breaks character, regardless of which underlying model is used.

### 10. CSS Design System
The application uses a comprehensive vanilla CSS design system (~69KB, `src/index.css`) with CSS custom properties for theming, responsive breakpoints, and extensive component styles for the chat interface, thinking blocks, sidebar, and landing page.

---

*Document generated from source code analysis. Last updated: February 2026.*
