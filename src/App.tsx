import { useState, useEffect } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { AuthPage } from './components/AuthPage';
import { LandingPage } from './components/LandingPage';
import { supabase } from './lib/supabase';

type AppView = 'landing' | 'auth' | 'app';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>('landing');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)'
      }}>
        Initializing DeepEx...
      </div>
    );
  }

  // Authenticated → always show the chat
  if (session) {
    return <ChatInterface />;
  }

  // Not authenticated → show landing or auth
  if (view === 'auth') {
    return <AuthPage onBack={() => setView('landing')} />;
  }

  return <LandingPage onGetStarted={() => setView('auth')} />;
}

export default App;
