import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthPageProps {
  onBack?: () => void;
}

export function AuthPage({ onBack }: AuthPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          setError('Please enter your full name.');
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              display_name: fullName.trim(),
            },
          },
        });
        if (error) throw error;
        setError('Check your email for the confirmation link!');
        setLoading(false);
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container auth-page-root">
      <div className="auth-box">
        {onBack && (
          <button className="auth-back" onClick={onBack}>
            ← Back
          </button>
        )}
        <h1 className="auth-title">DeepEx</h1>
        <p className="auth-subtitle">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </p>

        <form onSubmit={handleAuth} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          {/* Full Name — only on Sign Up */}
          {isSignUp && (
            <div className="input-group">
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="auth-input"
                autoComplete="name"
              />
            </div>
          )}

          <div className="input-group">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="auth-input"
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="auth-input"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="auth-footer">
          <button
            className="auth-switch"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>

      <style>{`
        .auth-container {
          height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
          animation: authFadeIn 0.4s ease-out;
        }
        @keyframes authFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-box {
          width: 100%;
          max-width: 400px;
          padding: 40px;
          text-align: center;
          position: relative;
        }
        .auth-back {
          position: absolute;
          top: 0;
          left: 40px;
          background: none;
          border: none;
          color: var(--text-tertiary);
          font-size: 13px;
          cursor: pointer;
          font-family: var(--font-sans);
        }
        .auth-back:hover {
          color: var(--text-primary);
        }
        .auth-title {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 28px;
          margin-bottom: 6px;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        .auth-subtitle {
          font-family: var(--font-serif);
          font-size: 18px;
          color: var(--text-secondary);
          margin-bottom: 32px;
          font-style: italic;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .auth-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          border: 1px solid var(--surface-border);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
          transition: all var(--transition-fast);
          font-family: var(--font-sans);
        }
        .auth-input:focus {
          border-color: var(--text-primary);
          box-shadow: 0 0 0 3px rgba(10,10,10,0.05);
        }
        .auth-button {
          width: 100%;
          padding: 12px;
          background: var(--text-primary);
          color: var(--bg-primary);
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all var(--transition-fast);
          font-family: var(--font-sans);
          letter-spacing: -0.01em;
        }
        .auth-button:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .auth-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .auth-error {
          padding: 10px 14px;
          background: rgba(200, 50, 50, 0.06);
          color: #b33;
          border: 1px solid rgba(200, 50, 50, 0.12);
          border-radius: var(--radius-md);
          font-size: 13px;
          text-align: left;
        }
        .auth-footer {
          margin-top: 20px;
        }
        .auth-switch {
          background: none;
          border: none;
          color: var(--text-tertiary);
          font-size: 13px;
          cursor: pointer;
          font-family: var(--font-sans);
          transition: color var(--transition-fast);
        }
        .auth-switch:hover {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
