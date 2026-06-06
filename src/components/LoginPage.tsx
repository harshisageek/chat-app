import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Mail, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const LoginPage: React.FC = () => {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
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
            setEmail(invite.email);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const { error } = await signInWithEmail(email);
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Check your email for the login link!' });
        setEmail('');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An error occurred' });
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
            👋 <strong>{inviterName}</strong> has invited you to join them on <strong>Chat App</strong>! We've prefilled your email below.
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <Mail className="login-input-icon" size={20} />
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading || !email.trim()}>
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Send Link <Send size={18} />
              </>
            )}
          </button>
        </form>

        {message && (
          <div className={`login-message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};
