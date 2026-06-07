import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChannels, useMessages, useUsers, useTypingIndicator, useUnreadCounts, playNotificationSound } from '../hooks/useSupabase';
import { supabase } from '../lib/supabase';
import {
  MessageSquare, Hash, Users, FileText, Paperclip, Smile, Send, BookOpen,
  X, CheckCircle2, LogOut, Plus, Trash2, UserPlus, MessageCircle, Mail,
  Volume2, VolumeX, CheckCheck
} from 'lucide-react';

const MOCK_EMOJIS = ['😀', '😂', '😍', '👍', '🎉', '🚀', '👀', '🔥', '💡', '✅', '👏', '🤔', '💪', '🌟', '❤️', '😎'];

export const ChatApp: React.FC = () => {
  const { user, profile, signOut, setProfile } = useAuth();
  const { users } = useUsers();
  const { channels } = useChannels(user?.id);
  
  const overviewChannel = channels.find(c => c.type === 'overview');
  const initialChannelId = overviewChannel?.id || '';
  
  const [activeChannelId, setActiveChannelId] = useState<string>(initialChannelId);
  const { messages } = useMessages(activeChannelId);

  // ─── NEW: Typing indicators ───
  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    activeChannelId, user?.id, profile?.full_name
  );

  // ─── NEW: Unread message counts ───
  const { unreadCounts, markAsRead } = useUnreadCounts(channels, activeChannelId);

  // ─── NEW: Notification sound mute toggle ───
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('chat_muted') === 'true';
  });
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newVal = !prev;
      localStorage.setItem('chat_muted', String(newVal));
      return newVal;
    });
  }, []);

  // ─── NEW: Listen for incoming messages globally for notification sound ───
  const prevMsgCountRef = useRef<number>(0);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      const latestMsg = messages[messages.length - 1];
      if (latestMsg && latestMsg.author_id !== user?.id && !isMuted) {
        playNotificationSound();
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, user?.id, isMuted]);

  // ─── NEW: Play sound for messages in OTHER channels ───
  useEffect(() => {
    const sub = supabase
      .channel('global_msg_notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        if (msg.channel_id !== activeChannelId && msg.author_id !== user?.id && !isMuted) {
          playNotificationSound();
        }
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [activeChannelId, user?.id, isMuted]);

  useEffect(() => {
     if (!activeChannelId && overviewChannel) {
        setActiveChannelId(overviewChannel.id);
     }
  }, [channels, activeChannelId, overviewChannel]);

  // ─── Channel switch handler with read tracking ───
  const handleChannelSwitch = useCallback((channelId: string) => {
    stopTyping();
    markAsRead(channelId);
    setActiveChannelId(channelId);
  }, [stopTyping, markAsRead]);

  const [messageText, setMessageText] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showPeersModal, setShowPeersModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  // ─── NEW STATES ───
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState(profile?.full_name || '');
  const [profileRole, setProfileRole] = useState(profile?.role || 'Student');
  const [profileColor, setProfileColor] = useState(profile?.color || '#4f46e5');
  const [attachedFile, setAttachedFile] = useState<{ name: string, size: string, type: string, url?: string } | null>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  // Sync profile details when profile loads
  useEffect(() => {
    if (profile) {
      setProfileName(profile.full_name);
      setProfileRole(profile.role);
      setProfileColor(profile.color);
    }
  }, [profile]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId) || overviewChannel;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChannelId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !attachedFile) || !user || !activeChannel) return;
    if (activeChannel.type === 'overview') {
      showToast("You cannot post directly to 'All Activity'.");
      return;
    }

    const text = messageText;
    const file = attachedFile;
    
    setMessageText('');
    setAttachedFile(null);
    setShowEmojiPicker(false);

    await supabase.from('messages').insert([{
      channel_id: activeChannelId,
      author_id: user.id,
      text: text || `Sent an attachment: ${file?.name}`,
      attachment_name: file?.name || null,
      attachment_size: file?.size || null,
      attachment_type: file?.type || null,
      attachment_url: file?.url || null
    }]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeInKb = file.size / 1024;
    const formattedSize = sizeInKb > 1024 
      ? `${(sizeInKb / 1024).toFixed(1)} MB`
      : `${sizeInKb.toFixed(0)} KB`;

    // Mock an attachment URL using standard unsplash images or object URL
    let fileUrl = '';
    if (file.type.startsWith('image/')) {
      fileUrl = URL.createObjectURL(file);
    } else {
      fileUrl = '#';
    }

    setAttachedFile({
      name: file.name,
      size: formattedSize,
      type: file.type,
      url: fileUrl
    });
  };

  const handleToggleReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const msgReactions = prev[msgId] ? { ...prev[msgId] } : {};
      if (msgReactions[emoji]) {
        delete msgReactions[emoji];
      } else {
        msgReactions[emoji] = 1;
      }
      return { ...prev, [msgId]: msgReactions };
    });
  };

  const handleUpdateProfile = async () => {
    if (!user || !profileName.trim()) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profileName.trim(),
        role: profileRole,
        color: profileColor
      })
      .eq('id', user.id);

    if (!error) {
      showToast("Profile updated successfully!");
      if (profile) {
        setProfile({
          ...profile,
          full_name: profileName.trim(),
          role: profileRole as any,
          color: profileColor
        });
      }
      setShowProfileModal(false);
    } else {
      showToast("Error updating profile: " + error.message);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
    showToast('Message deleted');
  };

  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const handleInviteUser = async () => {
    if (!inviteEmail.trim() || !user) return;
    
    const { data, error } = await supabase
      .from('invitations')
      .insert([{
        email: inviteEmail.trim().toLowerCase(),
        invited_by: user.id
      }])
      .select()
      .single();
      
    if (error) {
      showToast("Error creating invitation: " + error.message);
      return;
    }

    if (data) {
      const link = `${window.location.origin}/?invite=${data.id}`;
      setGeneratedInviteLink(link);
      showToast("Invitation link generated!");
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !user) return;

    const { data } = await supabase.from('channels').insert([{
      name: newChannelName.trim(),
      description: newChannelDesc.trim() || `Discussion in ${newChannelName.trim()}`,
      type: 'cohort',
      icon_type: 'hash',
      created_by: user.id
    }]).select().single();

    if (data) {
       await supabase.from('channel_members').insert([{ channel_id: data.id, user_id: user.id }]);
       setActiveChannelId(data.id);
    }
    
    setShowCreateChannelModal(false);
    setNewChannelName('');
    setNewChannelDesc('');
    showToast(`#${newChannelName} created!`);
  };

  const startDirectMessage = async (peerId: string) => {
    if (!user) return;
    
    // Find existing DM
    const existingDm = channels.find(c => 
       c.type === 'dm' && 
       c.channel_members?.some((m: any) => m.user_id === peerId)
    );

    if (existingDm) {
      setActiveChannelId(existingDm.id);
    } else {
      // Create new DM
      const { data: newDm } = await supabase.from('channels').insert([{
        name: 'Direct Message',
        type: 'dm',
        icon_type: 'user',
        created_by: user.id
      }]).select().single();

      if (newDm) {
        await supabase.from('channel_members').insert([
          { channel_id: newDm.id, user_id: user.id },
          { channel_id: newDm.id, user_id: peerId }
        ]);
        setActiveChannelId(newDm.id);
      }
    }

    setShowPeersModal(false);
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDmPeer = (channel: any) => {
     if (channel.type !== 'dm' || !user) return null;
     const peerMember = channel.channel_members?.find((m: any) => m.user_id !== user.id);
     return peerMember ? users[peerMember.user_id] : null;
  };

  const renderUserAvatar = (userId: string, size = 40) => {
    const u = users[userId];
    if (!u) {
      return <div className="msg-avatar" style={{ width: size, height: size, backgroundColor: '#e2e8f0' }} />;
    }
    if (u.avatar_url) {
      return <img src={u.avatar_url} alt={u.full_name} className="msg-avatar" style={{ width: size, height: size }} />;
    }
    const initials = u.full_name ? u.full_name.substring(0, 2).toUpperCase() : '??';
    return (
      <div className="msg-avatar" style={{
          width: size, height: size, backgroundColor: u.color || '#4f46e5',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700
      }}>
        {initials}
      </div>
    );
  };

  const renderNavIcon = (channel: any) => {
    if (channel.type === 'dm') {
       const peer = getDmPeer(channel);
       if (peer?.avatar_url) return <img src={peer.avatar_url} alt="" className="nav-item-avatar" />;
       if (peer) return (
         <div className="nav-item-avatar-fallback" style={{ backgroundColor: peer.color || '#4f46e5' }}>
           {peer.full_name.substring(0, 2).toUpperCase()}
         </div>
       );
       return <Users className="nav-icon" />;
    }
    if (channel.icon_type === 'message') return <MessageSquare className="nav-icon" />;
    return <Hash className="nav-icon" />;
  };

  if (!activeChannel) return <div className="app-layout" style={{alignItems:'center', justifyContent:'center'}}>Loading...</div>;

  const dmPeer = getDmPeer(activeChannel);
  const headerName = activeChannel.type === 'dm' && dmPeer ? dmPeer.full_name : activeChannel.name;

  return (
    <div className="app-layout">
      {/* ═══════ SIDEBAR ═══════ */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon"><BookOpen size={20} /></div>
          <span className="brand-name">Chat App</span>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-section">
            <div className="section-title">Overview</div>
            {channels.filter(c => c.type === 'overview').map(ch => (
              <a key={ch.id} className={`nav-item ${activeChannelId === ch.id ? 'active' : ''}`} onClick={() => handleChannelSwitch(ch.id)}>
                {renderNavIcon(ch)}<span>{ch.name}</span>
                {unreadCounts[ch.id] > 0 && <span className="unread-badge">{unreadCounts[ch.id]}</span>}
              </a>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="section-title">
              Cohorts & Courses
              <button className="section-title-btn" onClick={() => setShowCreateChannelModal(true)} title="Create Channel">
                <Plus size={14} />
              </button>
            </div>
            {channels.filter(c => c.type === 'cohort').map(ch => (
              <a key={ch.id} className={`nav-item ${activeChannelId === ch.id ? 'active' : ''}`} onClick={() => handleChannelSwitch(ch.id)}>
                {renderNavIcon(ch)}<span>{ch.name}</span>
                {unreadCounts[ch.id] > 0 && <span className="unread-badge">{unreadCounts[ch.id]}</span>}
              </a>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="section-title">
              Direct Messages
              <button className="section-title-btn" onClick={() => setShowInviteModal(true)} title="Invite User">
                <UserPlus size={14} />
              </button>
            </div>
            {channels.filter(c => c.type === 'dm').map(ch => {
              const peer = getDmPeer(ch);
              if (!peer) return null;
              return (
                <a key={ch.id} className={`nav-item ${activeChannelId === ch.id ? 'active' : ''}`} onClick={() => handleChannelSwitch(ch.id)}>
                  {renderNavIcon(ch)}
                  <div className="nav-dm-info">
                    <span className="nav-dm-name">{peer.full_name}</span>
                    <span className={`status-dot ${peer.is_online ? 'online' : 'offline'}`} />
                  </div>
                  {unreadCounts[ch.id] > 0 && <span className="unread-badge">{unreadCounts[ch.id]}</span>}
                </a>
              );
            })}
            <a className="nav-item" onClick={() => setShowPeersModal(true)}>
              <Users className="nav-icon" /><span>Find Peers...</span>
            </a>
          </div>
        </div>

        <div className="sidebar-footer" style={{ cursor: 'default' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1, minWidth: 0 }}
            onClick={() => setShowProfileModal(true)}
            title="Edit Profile"
          >
            {user && renderUserAvatar(user.id, 36)}
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <span className="user-name">{profile?.full_name}</span>
              <span className="user-role">{profile?.role}</span>
            </div>
          </div>
          <button 
            onClick={signOut} 
            title="Sign Out"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', padding: '6px', 
              borderRadius: '6px', color: '#64748b', transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <main className="main-content">
        <header className="chat-header">
          <div className="channel-info">
            <h2>
              {activeChannel.type === 'dm' && dmPeer && renderUserAvatar(dmPeer.id, 28)}
              {activeChannel.type !== 'dm' && renderNavIcon(activeChannel)}
              <span>{headerName}</span>
              {activeChannel.type === 'dm' && dmPeer && (
                <span className={`status-dot ${dmPeer.is_online ? 'online' : 'offline'}`} />
              )}
            </h2>
            <p className="channel-desc">{activeChannel.description}</p>
          </div>
          
          <div className="header-actions">
            <button 
              aria-label={isMuted ? 'Unmute notifications' : 'Mute notifications'} 
              onClick={toggleMute}
              title={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              className={isMuted ? 'muted' : ''}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button aria-label="Channel members" onClick={() => setShowMembersModal(true)}>
              <Users size={20} />
            </button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <MessageCircle size={48} className="empty-state-icon" />
              <h3>No messages yet</h3>
              <p>Be the first to start the conversation!</p>
            </div>
          ) : (
            messages.map(msg => {
              const author = users[msg.author_id];
              const msgReactions = reactions[msg.id] || {};
              
              return (
                <div key={msg.id} className="message" style={{ position: 'relative' }}>
                  {renderUserAvatar(msg.author_id)}
                  <div className="msg-content">
                    <div className="msg-header">
                      <span className="msg-author">{author?.full_name || 'Unknown'}</span>
                      {author?.role === 'Mentor' && <span className="msg-role-tag font-bold">Mentor</span>}
                      {author?.role === 'Alumni' && <span className="msg-role-tag alumni font-bold">Alumni</span>}
                      <span className="msg-time">{formatTime(msg.created_at)}</span>
                      {/* Read receipt for own messages */}
                      {msg.author_id === user?.id && (
                        <span className="read-receipt" title="Sent">
                          <CheckCheck size={14} />
                        </span>
                      )}
                    </div>
                    <p className="msg-text">{msg.text}</p>
                    
                    {/* Render attachment if exists */}
                    {msg.attachment_name && (
                      msg.attachment_type?.startsWith('image/') ? (
                        <div className="msg-image-attachment" style={{ cursor: 'pointer', marginTop: 8 }} onClick={() => window.open(msg.attachment_url, '_blank')}>
                          <img src={msg.attachment_url || ''} alt={msg.attachment_name} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                        </div>
                      ) : (
                        <div className="msg-attachment" style={{ marginTop: 8 }} onClick={() => window.open(msg.attachment_url, '_blank')}>
                          <FileText className="msg-attachment-icon" size={24} />
                          <div className="msg-attachment-info">
                            <h4>{msg.attachment_name}</h4>
                            <p>{msg.attachment_size || 'Unknown size'}</p>
                          </div>
                        </div>
                      )
                    )}

                    {/* Reactions list */}
                    {Object.keys(msgReactions).length > 0 && (
                      <div className="msg-reactions-list" style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <button 
                            key={emoji} 
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', 
                              borderRadius: '12px', background: 'rgba(99, 102, 241, 0.08)', 
                              border: '1px solid rgba(99, 102, 241, 0.2)', fontSize: '0.78rem',
                              color: 'var(--primary-600)', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                          >
                            <span>{emoji}</span>
                            <span style={{ fontWeight: 650 }}>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions overlay (Smile reaction & delete) */}
                  <div className="msg-actions" style={{
                    position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, 
                    background: '#fff', border: '1px solid var(--border-color)', 
                    borderRadius: '8px', padding: '2px 4px', boxShadow: 'var(--shadow-sm)',
                    opacity: 0, transition: 'opacity 0.2s', zIndex: 10
                  }}>
                    <div style={{ position: 'relative' }}>
                      <button 
                        onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                        title="React"
                      >
                        <Smile size={14} />
                      </button>
                      
                      {activeReactionMsgId === msg.id && (
                        <div style={{
                          position: 'absolute', bottom: '100%', right: 0, background: '#fff', 
                          border: '1px solid var(--border-color)', borderRadius: '18px', padding: '4px 8px', 
                          display: 'flex', gap: 6, boxShadow: 'var(--shadow-md)', zIndex: 50
                        }}>
                          {['👍', '❤️', '🔥', '😂', '🎉'].map(emoji => (
                            <button 
                              key={emoji} 
                              onClick={() => {
                                handleToggleReaction(msg.id, emoji);
                                setActiveReactionMsgId(null);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px' }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.author_id === user?.id && (
                      <button 
                        onClick={() => handleDeleteMessage(msg.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                        title="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* ─── Typing Indicator ─── */}
          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              <div className="typing-dots">
                <span /><span /><span />
              </div>
              <span>
                {typingUsers.length === 1
                  ? `${typingUsers[0].name} is typing...`
                  : typingUsers.length === 2
                    ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`
                    : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`
                }
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="input-container">
            {/* Attachment preview */}
            {attachedFile && (
              <div className="attachment-preview" style={{ marginBottom: 8 }}>
                {attachedFile.type.startsWith('image/') && attachedFile.url ? (
                  <img src={attachedFile.url} alt="" className="attachment-preview-img" style={{ width: 36, height: 36, borderRadius: '4px', objectFit: 'cover' }} />
                ) : (
                  <FileText size={20} className="msg-attachment-icon" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: 200 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachedFile.name}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{attachedFile.size}</span>
                </div>
                <button onClick={() => setAttachedFile(null)} title="Remove attachment" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', marginLeft: 8 }}>
                  <X size={14} />
                </button>
              </div>
            )}
            
            <textarea
              placeholder={`Message ${activeChannel.type === 'dm' ? '' : '#'}${headerName}...`}
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                if (e.target.value.trim()) startTyping();
              }}
              disabled={activeChannel.type === 'overview'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  stopTyping();
                  handleSendMessage();
                }
              }}
              onBlur={() => stopTyping()}
            />
            <div className="input-actions">
              <div className="action-buttons">
                {/* Paperclip file attacher */}
                <button 
                  onClick={() => document.getElementById('file-input')?.click()} 
                  disabled={activeChannel.type === 'overview'}
                  title="Attach File"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '7px', display: 'flex' }}
                >
                  <Paperclip size={18} />
                </button>
                <input 
                  type="file" 
                  id="file-input" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange} 
                />

                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} disabled={activeChannel.type === 'overview'} title="Insert Emoji">
                    <Smile size={18} />
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker">
                      {MOCK_EMOJIS.map(emoji => (
                        <button key={emoji} className="emoji-btn" onClick={() => setMessageText(prev => prev + emoji)}>{emoji}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                className="send-button" 
                disabled={(!messageText.trim() && !attachedFile) || activeChannel.type === 'overview'} 
                onClick={handleSendMessage}
              >
                Send <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => { setShowInviteModal(false); setGeneratedInviteLink(null); setInviteEmail(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite via Link</h3>
              <X className="modal-close" onClick={() => { setShowInviteModal(false); setGeneratedInviteLink(null); setInviteEmail(''); }} />
            </div>
            <div className="modal-body">
              {!generatedInviteLink ? (
                <>
                  <div className="form-group">
                    <label style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>Email Address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="abc@gmail.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleInviteUser(); }}
                      autoFocus
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', backgroundColor: '#f8fafc', color: '#0f172a', marginTop: 4 }}
                    />
                  </div>
                  <button className="form-submit-btn" disabled={!inviteEmail.trim()} onClick={handleInviteUser} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                    <Mail size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Generate Invite Link
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    Share this unique link with them. Once they open it, they can register and chat with you in real-time!
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input"
                      type="text"
                      readOnly
                      value={generatedInviteLink}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: '#f1f5f9', color: '#334155', outline: 'none', fontSize: '0.82rem' }}
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInviteLink);
                        showToast("Link copied to clipboard!");
                      }}
                      style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'var(--primary-600)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Copy
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setInviteEmail('');
                    }}
                    style={{ padding: '8px', border: 'none', background: 'none', color: 'var(--primary-600)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', alignSelf: 'center' }}
                  >
                    Create another invite
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateChannelModal && (
        <div className="modal-overlay" onClick={() => setShowCreateChannelModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Channel</h3>
              <X className="modal-close" onClick={() => setShowCreateChannelModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Channel Name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Machine Learning Q&A"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  autoFocus
                />
              </div>
              <button className="form-submit-btn" disabled={!newChannelName.trim()} onClick={handleCreateChannel}>
                <Hash size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Create Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Profile Details</h3>
              <X className="modal-close" onClick={() => setShowProfileModal(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>Display Name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Your Name"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', backgroundColor: '#f8fafc', color: '#0f172a', marginTop: 4 }}
                />
              </div>
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>Your Role</label>
                <select
                  value={profileRole}
                  onChange={e => setProfileRole(e.target.value as any)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', backgroundColor: '#f8fafc', color: '#0f172a', marginTop: 4 }}
                >
                  <option value="Student">Student</option>
                  <option value="Mentor">Mentor</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>Avatar Color Theme</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 8 }}>
                  {[
                    '#4f46e5', '#7c3aed', '#db2777', '#dc2626',
                    '#ea580c', '#d97706', '#16a34a', '#0d9488',
                    '#0284c7', '#2563eb', '#4338ca', '#7e22ce'
                  ].map(color => (
                    <button
                      key={color}
                      onClick={() => setProfileColor(color)}
                      style={{
                        width: '100%', height: '36px', borderRadius: '6px', backgroundColor: color, 
                        border: profileColor === color ? '3px solid #0f172a' : 'none', cursor: 'pointer',
                        boxShadow: profileColor === color ? '0 0 8px rgba(99,102,241,0.5)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    />
                  ))}
                </div>
              </div>
              <button 
                className="form-submit-btn" 
                disabled={!profileName.trim()} 
                onClick={handleUpdateProfile}
                style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Profile Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showMembersModal && (
        <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Channel Members - #{activeChannel?.name || 'Channel'}</h3>
              <X className="modal-close" onClick={() => setShowMembersModal(false)} />
            </div>
            <div className="modal-body">
              <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.values(users).map((u: any) => {
                  const isMember = activeChannel.type === 'overview' || 
                    (activeChannel.channel_members && activeChannel.channel_members.some((m: any) => m.user_id === u.id)) ||
                    u.id === '00000000-0000-0000-0000-000000000000'; // bot is always member
                  
                  if (!isMember) return null;
                  
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      {renderUserAvatar(u.id, 32)}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {u.full_name}
                          <span className={`status-dot ${u.is_online ? 'online' : 'offline'}`} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPeersModal && (
        <div className="modal-overlay" onClick={() => setShowPeersModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Find Peers</h3>
              <X className="modal-close" onClick={() => setShowPeersModal(false)} />
            </div>
            <div className="modal-body">
              {Object.values(users).filter(u => u.id !== user?.id).map((u: any) => (
                  <div key={u.id} className="member-item" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {renderUserAvatar(u.id, 36)}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {u.full_name}
                          <span className={`status-dot ${u.is_online ? 'online' : 'offline'}`} />
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.role}</div>
                      </div>
                    </div>
                    <button className="peer-msg-btn" onClick={() => startDirectMessage(u.id)}>Message</button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="toast">
          <CheckCircle2 size={18} color="#34d399" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
