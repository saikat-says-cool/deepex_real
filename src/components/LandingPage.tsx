import { useState, useEffect } from 'react';

interface LandingPageProps {
    onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
    const [visible, setVisible] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeFaq, setActiveFaq] = useState<number | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(t);
    }, []);

    const scrollTo = (id: string) => {
        setMobileMenuOpen(false);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className={`landing ${visible ? 'visible' : ''}`}>
            {/* ── Ambient background ──────────────────────────────── */}
            <div className="landing-bg">
                <div className="landing-glow glow-1" />
                <div className="landing-glow glow-2" />
                <div className="landing-glow glow-3" />
                <div className="landing-grid" />
            </div>

            {/* ══════════════════════════════════════════════════════
                NAV
               ══════════════════════════════════════════════════════ */}
            <nav className="landing-nav">
                <div className="landing-nav-left">
                    <span className="landing-logo">DeepEx</span>
                    <span className="landing-logo-tag">by Artificialyze</span>
                </div>
                <div className="landing-nav-links">
                    <button onClick={() => scrollTo('how-it-works')}>How It Works</button>
                    <button onClick={() => scrollTo('architecture')}>Architecture</button>
                    <button onClick={() => scrollTo('features')}>Features</button>
                    <button onClick={() => scrollTo('use-cases')}>Use Cases</button>
                    <button onClick={() => scrollTo('faq')}>FAQ</button>
                </div>
                <button className="landing-nav-cta" onClick={onGetStarted}>
                    Get Started
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </button>
                {/* Mobile hamburger */}
                <button className="landing-mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                    {mobileMenuOpen ? '✕' : '☰'}
                </button>
            </nav>

            {/* Mobile menu */}
            {mobileMenuOpen && (
                <div className="landing-mobile-menu">
                    <button onClick={() => scrollTo('how-it-works')}>How It Works</button>
                    <button onClick={() => scrollTo('architecture')}>Architecture</button>
                    <button onClick={() => scrollTo('features')}>Features</button>
                    <button onClick={() => scrollTo('use-cases')}>Use Cases</button>
                    <button onClick={() => scrollTo('faq')}>FAQ</button>
                    <button onClick={onGetStarted} className="landing-mobile-cta">Get Started</button>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                HERO
               ══════════════════════════════════════════════════════ */}
            <section className="landing-hero">
                <div className="landing-badge">Adaptive Cognitive Reasoning Engine</div>
                <h1 className="landing-h1">
                    Think Harder.<br />
                    <span className="landing-h1-accent">Push Limits.</span>
                </h1>
                <p className="landing-sub">
                    DeepEx is not another chatbot. It is a structured, multi-layered reasoning engine
                    that decomposes your hardest questions, challenges its own assumptions, deploys
                    adversarial validators, and synthesizes answers with transparent confidence scoring.
                    Every thinking step is visible. Every conclusion is earned.
                </p>
                <div className="landing-hero-actions">
                    <button className="landing-btn-primary" onClick={onGetStarted}>
                        Start Reasoning — Free
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                    <button className="landing-btn-ghost" onClick={() => scrollTo('how-it-works')}>See How It Works</button>
                </div>
            </section>

            {/* ── Stats Bar ─────────────────────────────────────── */}
            <section className="landing-stats">
                <div className="landing-stats-inner">
                    <div className="stat-item">
                        <span className="stat-number">12</span>
                        <span className="stat-label">Reasoning Layers</span>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <span className="stat-number">3</span>
                        <span className="stat-label">Parallel Solvers</span>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <span className="stat-number">100%</span>
                        <span className="stat-label">Transparent Reasoning</span>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <span className="stat-number">0–100</span>
                        <span className="stat-label">Confidence Scoring</span>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                THE PROBLEM
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section">
                <div className="landing-section-header">
                    <span className="landing-section-tag">The Problem</span>
                    <h2 className="landing-h2">Most AI gives you an answer.<br />Nobody tells you if it's right.</h2>
                </div>
                <div className="problem-grid">
                    <div className="problem-card">
                        <h3>Single-Pass Thinking</h3>
                        <p>
                            Traditional AI generates responses in a single forward pass. There is no
                            self-review, no adversarial challenge, no second opinion. The first draft
                            is the final draft. And first drafts are rarely the best drafts.
                        </p>
                    </div>
                    <div className="problem-card">
                        <h3>Black-Box Confidence</h3>
                        <p>
                            You receive an answer delivered with unwavering certainty, but you have no
                            way to know whether the AI is ninety percent sure or wildly guessing. There
                            is no confidence metric, no list of assumptions, no uncertainty disclosure.
                        </p>
                    </div>
                    <div className="problem-card">
                        <h3>No Self-Correction</h3>
                        <p>
                            When a traditional model makes an error in reasoning, that error propagates
                            through the entire response unchecked. There is no critic, no verifier, no
                            mechanism to catch and repair flawed logic before it reaches you.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                HOW IT WORKS
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section" id="how-it-works">
                <div className="landing-section-header">
                    <span className="landing-section-tag">How It Works</span>
                    <h2 className="landing-h2">Three reasoning modes.<br />One relentless pursuit of truth.</h2>
                    <p className="landing-section-sub">
                        DeepEx automatically selects the right depth of reasoning for your question,
                        or you can choose manually. Simple questions get instant answers. Complex
                        questions get the full cognitive pipeline.
                    </p>
                </div>

                <div className="modes-showcase">
                    {/* Instant */}
                    <div className="mode-showcase-card">
                        <div className="mode-showcase-header">
                            <div className="mode-dot mode-dot-instant" />
                            <div>
                                <h3>Instant Mode</h3>
                                <span className="mode-showcase-speed">Under 2 seconds</span>
                            </div>
                        </div>
                        <p className="mode-showcase-desc">
                            For straightforward queries — greetings, translations, simple lookups,
                            factual questions with clear answers. DeepEx responds with a single,
                            high-quality pass. Fast, precise, no overhead. When you don't need depth,
                            you shouldn't have to wait for it.
                        </p>
                        <div className="mode-showcase-pipeline">
                            <span className="mode-step">Query</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Single-Pass Solver</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step active">Answer</span>
                        </div>
                    </div>

                    {/* Deep */}
                    <div className="mode-showcase-card">
                        <div className="mode-showcase-header">
                            <div className="mode-dot mode-dot-deep" />
                            <div>
                                <h3>Deep Mode</h3>
                                <span className="mode-showcase-speed">10–30 seconds</span>
                            </div>
                        </div>
                        <p className="mode-showcase-desc">
                            For questions that demand structured thinking. DeepEx breaks the problem
                            down into its components, solves it methodically, then deploys a fast critic
                            to attack its own solution. The refiner integrates the critique and produces
                            a polished answer. Finally, a confidence gate scores the result and
                            determines whether to escalate to Ultra-Deep.
                        </p>
                        <div className="mode-showcase-pipeline">
                            <span className="mode-step">Decompose</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Solve</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Critique</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Refine</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step active">Confidence Gate</span>
                        </div>
                    </div>

                    {/* Ultra-Deep */}
                    <div className="mode-showcase-card mode-showcase-ultra">
                        <div className="mode-showcase-header">
                            <div className="mode-dot mode-dot-ultra" />
                            <div>
                                <h3>Ultra-Deep Mode</h3>
                                <span className="mode-showcase-speed">30–90 seconds</span>
                            </div>
                        </div>
                        <p className="mode-showcase-desc">
                            The full cognitive arsenal. Three independent solvers attack the problem from
                            completely different angles: Standard logic, Pessimist failure-mode analysis,
                            and Creative lateral thinking. A Skeptic Agent attacks all three solutions
                            looking for contradictions and weak logic. A Verifier checks logical validity.
                            A Synthesizer merges the strongest elements into a unified answer. A Meta-Critic
                            performs a final quality check. And a Confidence Gate scores the result with
                            full transparency — assumptions listed, uncertainties flagged.
                        </p>
                        <div className="mode-showcase-pipeline ultra-pipeline">
                            <div className="pipeline-parallel">
                                <span className="mode-step">Solver A — Standard</span>
                                <span className="mode-step">Solver B — Pessimist</span>
                                <span className="mode-step">Solver C — Creative</span>
                            </div>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Skeptic</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Verifier</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step">Synthesizer</span>
                            <span className="mode-arrow">→</span>
                            <span className="mode-step active">Meta-Critic</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                ARCHITECTURE DEEP-DIVE
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section" id="architecture">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Architecture</span>
                    <h2 className="landing-h2">Every layer exists for a reason.</h2>
                    <p className="landing-section-sub">
                        DeepEx is not a single model with a clever prompt. It is a multi-agent
                        orchestration system where each layer has a distinct cognitive role.
                        Here is what happens inside.
                    </p>
                </div>

                <div className="arch-timeline">
                    <div className="arch-line" />

                    <div className="arch-item">
                        <div className="arch-marker">0</div>
                        <div className="arch-content">
                            <h3>Cortex Classifier</h3>
                            <p>
                                The first layer to receive your query. In under 300 milliseconds, it
                                classifies the problem across multiple dimensions — domain, complexity,
                                ambiguity, reasoning type, time sensitivity, and required output format.
                                This classification determines which reasoning mode to engage and how
                                much cognitive budget to allocate.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">1</div>
                        <div className="arch-content">
                            <h3>Problem Decomposer</h3>
                            <p>
                                Before solving anything, DeepEx takes the problem apart. It identifies
                                known facts, user intent, explicit and implicit constraints, unknowns,
                                hidden requirements, edge cases, and the ideal output format. This
                                structured decomposition becomes the foundation for everything that follows.
                                You cannot solve a problem well if you do not understand it deeply first.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">2</div>
                        <div className="arch-content">
                            <h3>Primary Solver / Parallel Solvers</h3>
                            <p>
                                In Deep Mode, a single primary solver generates a thorough, step-by-step
                                solution using the problem map as its blueprint. In Ultra-Deep Mode,
                                three independent solvers work in parallel — each approaching the problem
                                from a fundamentally different perspective. The Standard solver uses
                                conventional best practices. The Pessimist assumes everything that can
                                go wrong will go wrong. The Creative solver looks for lateral,
                                non-obvious solutions that a conventional thinker would miss entirely.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">3</div>
                        <div className="arch-content">
                            <h3>Fast Critic / Skeptic Agent</h3>
                            <p>
                                Every solution gets attacked. The Critic is adversarial by design — it
                                looks for logical gaps, weak assumptions, missing edge cases,
                                oversimplifications, factual errors, and missing perspectives. In
                                Ultra-Deep Mode, the Skeptic Agent receives all three solutions and
                                actively looks for contradictions between them, attacking each one
                                and surfacing unresolved questions. This is not polite feedback.
                                This is structured demolition of weak reasoning.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">4</div>
                        <div className="arch-content">
                            <h3>Verifier Agent</h3>
                            <p>
                                Exclusive to Ultra-Deep Mode. The Verifier performs independent logical
                                validation — checking whether the reasoning chain holds, whether
                                assumptions are justified, and whether there are internal consistency
                                issues across the multiple solutions and the skeptic's critique. It
                                produces a formal validity assessment before synthesis begins.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">5</div>
                        <div className="arch-content">
                            <h3>Refiner / Synthesizer</h3>
                            <p>
                                In Deep Mode, the Refiner takes the draft solution and the critic's
                                feedback and produces an improved, polished answer that addresses every
                                identified issue while preserving the strong parts of the original. In
                                Ultra-Deep Mode, the Synthesizer merges the best elements from all three
                                solvers, integrates the skeptic's valid concerns, and incorporates the
                                verifier's findings — all into a single, coherent, definitive answer
                                that speaks with one unified voice.
                            </p>
                        </div>
                    </div>

                    <div className="arch-item">
                        <div className="arch-marker">6</div>
                        <div className="arch-content">
                            <h3>Confidence Gate</h3>
                            <p>
                                The final checkpoint. Every answer receives a confidence score from 0 to
                                100, along with a list of key assumptions and uncertainty notes. Scores
                                above 90 indicate high confidence with well-supported reasoning. Scores
                                between 70 and 89 indicate reasonable confidence with some caveats.
                                Below 70, the answer has notable uncertainties. And if DeepEx is in Deep
                                Mode and confidence falls below the threshold, it automatically escalates
                                to Ultra-Deep — deploying the full cognitive arsenal without you needing
                                to ask.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                FEATURES
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section" id="features">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Features</span>
                    <h2 className="landing-h2">Built for people who refuse to take<br />the first answer at face value.</h2>
                </div>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                        </div>
                        <h3>Transparent Reasoning</h3>
                        <p>
                            Every thinking layer unfolds in real-time in the interface. You see the
                            problem decomposition. You see the solver working. You see the critic
                            tearing the answer apart. You see the refiner putting it back together.
                            There are no black boxes in DeepEx. Every step is visible, auditable,
                            and understandable. If you want to know why DeepEx reached a conclusion,
                            the entire reasoning trace is right there.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
                        </div>
                        <h3>Automatic Self-Escalation</h3>
                        <p>
                            Low confidence is not a dead end — it is a trigger. When DeepEx detects
                            that its Deep Mode answer falls below the confidence threshold, it
                            automatically escalates to Ultra-Deep Mode. Three parallel solvers deploy.
                            A skeptic attacks. A verifier validates. A synthesizer merges. You get
                            the deepest possible analysis without lifting a finger.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                        </div>
                        <h3>Web-Grounded Answers</h3>
                        <p>
                            When your question requires current information — live data, recent events,
                            real-time facts — DeepEx automatically searches the web, retrieves relevant
                            context, and grounds its reasoning in actual data. Sources are cited and
                            displayed alongside the answer so you can verify independently. No
                            hallucinated facts. No outdated information presented as current.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        </div>
                        <h3>Confidence Scoring</h3>
                        <p>
                            Every answer comes with a numerical confidence score between 0 and 100.
                            But numbers alone are not enough. DeepEx also lists its key assumptions
                            explicitly — the things it took as given — and flags its uncertainty notes,
                            the areas where it knows its answer could be wrong. This level of epistemic
                            honesty is rare in AI. DeepEx tells you not just what it thinks, but how
                            sure it is and why it might be wrong.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        </div>
                        <h3>Multi-Perspective Solvers</h3>
                        <p>
                            In Ultra-Deep Mode, three solvers approach your problem simultaneously.
                            The Standard solver applies mainstream logic and best practices. The
                            Pessimist assumes worst-case scenarios, hidden risks, and failure modes.
                            The Creative solver thinks laterally, draws analogies from other domains,
                            and proposes counterintuitive solutions. By combining all three perspectives,
                            DeepEx produces answers that no single approach could achieve alone.
                        </p>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon-box">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        </div>
                        <h3>Adversarial Validation</h3>
                        <p>
                            DeepEx does not trust its own first answer. Every solution is attacked by
                            purpose-built adversarial agents — the Fast Critic in Deep Mode and the
                            Skeptic Agent in Ultra-Deep Mode. These agents are designed to find flaws,
                            not confirm conclusions. They look for contradictions, weak logic, unsupported
                            claims, and conflicts in reasoning. Only answers that survive this adversarial
                            gauntlet make it to you.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                COMPARISON
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Why DeepEx</span>
                    <h2 className="landing-h2">Not all thinking is created equal.</h2>
                </div>
                <div className="comparison-table">
                    <div className="comparison-header">
                        <div className="comparison-col label-col" />
                        <div className="comparison-col">Traditional AI</div>
                        <div className="comparison-col highlight-col">DeepEx</div>
                    </div>
                    {[
                        ['Reasoning approach', 'Single forward pass', 'Multi-layer pipeline with up to 12 agents'],
                        ['Self-correction', 'None', 'Built-in critic, skeptic, and verifier agents'],
                        ['Confidence scoring', 'Not available', '0–100 score with assumptions and uncertainty notes'],
                        ['Transparency', 'Black box', 'Full reasoning trace visible in real-time'],
                        ['Perspective diversity', 'Single viewpoint', 'Three parallel solvers with distinct strategies'],
                        ['Automatic escalation', 'Not available', 'Self-escalates from Deep to Ultra-Deep on low confidence'],
                        ['Web grounding', 'Varies', 'Automatic search with cited sources'],
                        ['Adversarial testing', 'None', 'Every answer attacked by adversarial agents before delivery'],
                    ].map(([label, traditional, deepex], i) => (
                        <div className="comparison-row" key={i}>
                            <div className="comparison-col label-col">{label}</div>
                            <div className="comparison-col dim-col">{traditional}</div>
                            <div className="comparison-col highlight-col">{deepex}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                USE CASES
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section" id="use-cases">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Use Cases</span>
                    <h2 className="landing-h2">For anyone whose work demands<br />more than a surface-level answer.</h2>
                </div>
                <div className="use-cases-grid">
                    <div className="use-case-card">
                        <h3>Researchers and Academics</h3>
                        <p>
                            When you need to evaluate a hypothesis from multiple angles, identify weaknesses
                            in an argument, or explore the implications of a theory, DeepEx provides the
                            structured adversarial analysis that peer review demands. It decomposes complex
                            questions, attacks its own conclusions, and surfaces edge cases you might not
                            have considered. The confidence scoring tells you exactly where the reasoning
                            is strong and where it needs more evidence.
                        </p>
                    </div>
                    <div className="use-case-card">
                        <h3>Engineers and Technical Leaders</h3>
                        <p>
                            Architecture decisions, system design tradeoffs, debugging complex systems,
                            evaluating technical approaches — these are problems where the first answer
                            is rarely the best answer. DeepEx's parallel solvers give you mainstream best
                            practices, worst-case failure analysis, and creative alternatives all at once.
                            The skeptic agent catches the blind spots that confirmation bias would normally hide.
                        </p>
                    </div>
                    <div className="use-case-card">
                        <h3>Strategists and Decision Makers</h3>
                        <p>
                            High-stakes decisions deserve more than a single perspective. DeepEx's Ultra-Deep
                            Mode gives you the conventional analysis, the pessimist's risk assessment, and
                            the contrarian's alternative — then synthesizes them into a unified recommendation
                            with quantified confidence. You see not just what to do, but how sure the reasoning
                            is and what assumptions underpin it.
                        </p>
                    </div>
                    <div className="use-case-card">
                        <h3>Students and Lifelong Learners</h3>
                        <p>
                            Understanding a concept deeply means seeing it from multiple angles, understanding
                            where the common explanations fall short, and knowing what the edge cases are.
                            DeepEx doesn't just answer your question — it shows you the entire thinking
                            process. You learn not just the answer but how to reason about the problem.
                            The transparent reasoning trace is, in effect, a masterclass in structured thinking.
                        </p>
                    </div>
                    <div className="use-case-card">
                        <h3>Writers and Content Creators</h3>
                        <p>
                            Whether you are crafting an argument, researching a topic, or exploring a narrative
                            idea, DeepEx provides depth and nuance that flat AI outputs cannot. The Creative
                            solver in Ultra-Deep Mode draws unexpected analogies and proposes non-obvious
                            angles. The web grounding ensures factual accuracy. The adversarial validation
                            ensures your arguments hold up under scrutiny before you publish them.
                        </p>
                    </div>
                    <div className="use-case-card">
                        <h3>Analysts and Consultants</h3>
                        <p>
                            Client work demands rigorous, defensible analysis. DeepEx provides exactly that —
                            structured problem decomposition, multi-perspective evaluation, adversarial
                            testing, and confidence-scored conclusions with explicit assumptions. Every
                            reasoning step is documented in the thinking trace, giving you an audit trail
                            that supports your recommendations.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                DESIGN PHILOSOPHY
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section">
                <div className="landing-section-header">
                    <span className="landing-section-tag">Philosophy</span>
                    <h2 className="landing-h2">The principles behind every layer.</h2>
                </div>
                <div className="philosophy-grid">
                    <div className="philosophy-item">
                        <h3>Depth Over Speed</h3>
                        <p>
                            Speed matters, but correctness matters more. When a question demands deep
                            analysis, DeepEx invests the time — deploying multiple reasoning layers,
                            running adversarial challenges, and validating logic — because a fast wrong
                            answer is worse than a thoughtful right one. For simple questions, Instant
                            Mode delivers in under two seconds. But when depth is needed, DeepEx
                            takes the time to think properly.
                        </p>
                    </div>
                    <div className="philosophy-item">
                        <h3>Epistemic Honesty</h3>
                        <p>
                            DeepEx does not pretend to know things it does not know. When confidence
                            is low, it says so. When assumptions are required, it lists them explicitly.
                            When uncertainty exists, it flags it. This commitment to intellectual honesty
                            means you always know the difference between a well-supported conclusion
                            and an educated guess.
                        </p>
                    </div>
                    <div className="philosophy-item">
                        <h3>Adversarial Integrity</h3>
                        <p>
                            The easiest way to produce wrong answers confidently is to never challenge
                            them. DeepEx is built on the principle that every answer must survive
                            structured opposition before it earns the right to be delivered. The critic,
                            skeptic, and verifier agents exist specifically to destroy weak reasoning.
                            What survives is stronger for having been tested.
                        </p>
                    </div>
                    <div className="philosophy-item">
                        <h3>Radical Transparency</h3>
                        <p>
                            You should never have to wonder what an AI is doing or why it reached a
                            particular conclusion. DeepEx shows you everything — the problem decomposition,
                            the solver's reasoning, the critic's objections, the refiner's improvements,
                            and the confidence assessment. Trust is built on transparency, and transparency
                            requires showing the work.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                FAQ
               ══════════════════════════════════════════════════════ */}
            <section className="landing-section" id="faq">
                <div className="landing-section-header">
                    <span className="landing-section-tag">FAQ</span>
                    <h2 className="landing-h2">Questions you might have.</h2>
                </div>
                <div className="faq-list">
                    {[
                        {
                            q: 'How is DeepEx different from ChatGPT, Claude, or Gemini?',
                            a: 'Those systems generate responses in a single pass — one model, one attempt, one output. DeepEx is a multi-agent orchestration system that decomposes problems, deploys multiple independent solvers, attacks its own answers with adversarial agents, validates logic through a verification layer, and synthesizes everything into a confidence-scored response. The architecture is fundamentally different. The depth of reasoning is fundamentally different.'
                        },
                        {
                            q: 'What does "transparent reasoning" actually mean?',
                            a: 'It means you see everything. In the DeepEx interface, each reasoning layer unfolds in real-time as a "thinking block." You watch the problem get decomposed. You see the solver working. You see the critic attacking the solution. You see the refiner incorporating the feedback. And at the end, you see the confidence score with its assumptions and uncertainties. There is no hidden process. The entire cognitive pipeline is visible.'
                        },
                        {
                            q: 'When should I use Ultra-Deep Mode versus Deep Mode?',
                            a: 'Deep Mode is excellent for most complex questions — it handles structured reasoning with self-critique and refinement efficiently. Ultra-Deep Mode is for questions where you need multiple independent perspectives, adversarial validation from a skeptic agent, formal logical verification, and synthesis from three different approaches. You can also set the mode to Auto and let DeepEx decide based on the question\'s complexity. If Deep Mode produces a low-confidence result, it will self-escalate to Ultra-Deep automatically.'
                        },
                        {
                            q: 'What is the confidence score and how should I interpret it?',
                            a: 'The confidence score is a 0-to-100 rating that DeepEx assigns to its own answer, along with a list of assumptions it made and uncertainties it identified. Scores of 90 to 100 indicate well-supported, logically sound reasoning. Scores of 70 to 89 indicate reasonable confidence with some caveats. Scores of 50 to 69 indicate notable uncertainties. Below 50 means significant gaps or speculative elements. The score is calibrated to be honest, not inflated — a 75 from DeepEx genuinely means there are open questions.'
                        },
                        {
                            q: 'Does DeepEx search the web?',
                            a: 'Yes, when your question requires current information, DeepEx automatically determines whether a web search is needed, runs the search, retrieves relevant context, and integrates that information into its reasoning pipeline. Sources are cited and displayed alongside the answer. You can see exactly what web context was used and verify it independently.'
                        },
                        {
                            q: 'How long does a response take?',
                            a: 'Instant Mode responds in under two seconds. Deep Mode typically takes 10 to 30 seconds, depending on problem complexity. Ultra-Deep Mode takes 30 to 90 seconds because it runs three parallel solvers, a skeptic agent, a verifier, a synthesizer, and a meta-critic — each performing genuine reasoning work. The thinking trace is streamed in real-time, so you see progress throughout.'
                        },
                        {
                            q: 'Is DeepEx free to use?',
                            a: 'DeepEx offers free access to get started. Create an account and start reasoning immediately. We believe the best way to understand what DeepEx offers is to use it on a question you actually care about.'
                        },
                    ].map((item, i) => (
                        <div className={`faq-item ${activeFaq === i ? 'active' : ''}`} key={i}>
                            <button className="faq-question" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                                <span>{item.q}</span>
                                <span className="faq-toggle">{activeFaq === i ? '−' : '+'}</span>
                            </button>
                            {activeFaq === i && (
                                <div className="faq-answer">
                                    <p>{item.a}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                FINAL CTA
               ══════════════════════════════════════════════════════ */}
            <section className="landing-cta-section">
                <div className="cta-inner">
                    <h2 className="landing-h2">Stop settling for the first answer.</h2>
                    <p className="landing-section-sub" style={{ marginBottom: '16px' }}>
                        Your hardest questions deserve structured reasoning, adversarial validation,
                        multi-perspective analysis, and transparent confidence scoring.
                    </p>
                    <p className="landing-section-sub" style={{ marginBottom: '40px' }}>
                        DeepEx gives you all of that. Create your account and start thinking deeper.
                    </p>
                    <button className="landing-btn-primary landing-btn-lg" onClick={onGetStarted}>
                        Get Started — Free
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>
                    </button>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════
                FOOTER
               ══════════════════════════════════════════════════════ */}
            <footer className="landing-footer">
                <div className="landing-footer-inner">
                    <div className="landing-footer-brand">
                        <span className="landing-footer-logo">DeepEx</span>
                        <p className="landing-footer-desc">
                            An Adaptive Cognitive Reasoning Engine by Artificialyze.
                            Built to think harder and push past surface-level answers.
                        </p>
                    </div>
                    <div className="landing-footer-links">
                        <div className="footer-col">
                            <h4>Product</h4>
                            <button onClick={() => scrollTo('how-it-works')}>How It Works</button>
                            <button onClick={() => scrollTo('architecture')}>Architecture</button>
                            <button onClick={() => scrollTo('features')}>Features</button>
                        </div>
                        <div className="footer-col">
                            <h4>Resources</h4>
                            <button onClick={() => scrollTo('use-cases')}>Use Cases</button>
                            <button onClick={() => scrollTo('faq')}>FAQ</button>
                            <button onClick={onGetStarted}>Get Started</button>
                        </div>
                        <div className="footer-col">
                            <h4>Connect</h4>
                            <a href="https://x.com/DeepEx_Ai" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
                            <a href="https://www.instagram.com/try_deepex/" target="_blank" rel="noopener noreferrer">Instagram</a>
                            <a href="mailto:inquiries@artificialyze.com">inquiries@artificialyze.com</a>
                        </div>
                        <div className="footer-col">
                            <h4>Company</h4>
                            <a href="https://artificialyze.com" target="_blank" rel="noopener noreferrer">Artificialyze</a>
                        </div>
                    </div>
                </div>
                <div className="landing-footer-bottom">
                    <span className="landing-footer-copy">&copy; {new Date().getFullYear()} Artificialyze. All rights reserved.</span>
                </div>
            </footer>
        </div>
    );
}
