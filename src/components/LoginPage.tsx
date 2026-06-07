import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [inviterName, setInviterName] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    if (inviteId) {
      console.log('[LoginPage] Found invite token:', inviteId);
      supabase
        .from('invitations')
        .select('email, invited_by')
        .eq('id', inviteId)
        .eq('status', 'pending')
        .single()
        .then(({ data: invite, error }) => {
          if (invite && !error) {
            supabase
              .from('profiles')
              .select('full_name')
              .eq('id', invite.invited_by)
              .single()
              .then(({ data: profile }) => {
                if (profile) {
                  setInviterName(profile.full_name);
                }
              });
          }
        });
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setMessage({ type: 'error', text: error.message });
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'An error occurred';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon-large">
            <BookOpen size={32} color="white" />
          </div>
          <h1>Chat App</h1>
          <p>Sign in to join the conversation</p>
        </div>

        {inviterName && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)', 
            border: '1px solid rgba(99, 102, 241, 0.2)', 
            borderRadius: '12px', padding: '12px 16px', 
            marginBottom: '20px', fontSize: '0.88rem', 
            color: '#c7d2fe', textAlign: 'center', lineHeight: '1.4'
          }}>
            <strong>{inviterName}</strong> has invited you to join them on <strong>Chat App</strong>.
          </div>
        )}

        <div className="login-form">
          <button type="button" className="google-login-btn" disabled={loading} onClick={handleGoogleSignIn}>
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <span className="google-icon" aria-hidden="true">G</span>
                Continue with Google
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`login-message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};
