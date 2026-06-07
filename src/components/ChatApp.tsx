import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useChannels, useMessages, useUsers, useTypingIndicator, useUnreadCounts, playNotificationSound } from '../hooks/useSupabase';
import { supabase } from '../lib/supabase';
import {
  MessageSquare, Hash, Users, FileText, Paperclip, Smile, Send, BookOpen,
  X, CheckCircle2, LogOut, Plus, Trash2, UserPlus, MessageCircle,
  Volume2, VolumeX, CheckCheck, Search, Reply, Edit2
} from 'lucide-react';
import type { AttachedFile, Channel, ChannelMember, Message, UserProfile, UserRole } from '../types/chat';

const MOCK_EMOJIS = ['😀', '😂', '😍', '👍', '🎉', '🚀', '👀', '🔥', '💡', '✅', '👏', '🤔', '💪', '🌟', '❤️', '😎'];

export const ChatApp: React.FC = () => {
  const { user, profile, signOut, setProfile } = useAuth();
  const { users } = useUsers();
  const { channels } = useChannels(user?.id);
  
  const overviewChannel = channels.find(c => c.type === 'overview');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const activeChannelId = selectedChannelId || overviewChannel?.id || '';
  const activeChannel = channels.find(c => c.id === activeChannelId) || overviewChannel;
  const visibleChannelIds = channels.map(channel => channel.id);
  const { messages } = useMessages(activeChannelId, visibleChannelIds, activeChannel?.type === 'overview');

  // ─── NEW: Typing indicators ───
  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(
    activeChannelId, user?.id, profile?.full_name
  );

  // ─── NEW: Unread message counts ───
  const { unreadCounts, markAsRead } = useUnreadCounts(channels, activeChannelId, user?.id);

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

  // ─── TIER 2: Search ───
  const [searchQuery, setSearchQuery] = useState('');

  // ─── TIER 2: Reply & Edit ───
  const [replyToMsgId, setReplyToMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState('');

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
  }, [messages, user?.id, isMuted]);

  // ─── NEW: Play sound for messages in OTHER channels ───
  useEffect(() => {
    const sub = supabase
      .channel('global_msg_notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.channel_id !== activeChannelId && msg.author_id !== user?.id && !isMuted) {
          playNotificationSound();
        }
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [activeChannelId, user?.id, isMuted]);

  // ─── Channel switch handler with read tracking ───
  const handleChannelSwitch = useCallback((channelId: string) => {
    stopTyping();
    markAsRead(channelId);
    setSelectedChannelId(channelId);
  }, [stopTyping, markAsRead]);

  const [messageText, setMessageText] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showPeersModal, setShowPeersModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  // ─── NEW STATES ───
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState(profile?.full_name || '');
  const [profileRole, setProfileRole] = useState<UserRole>(profile?.role || 'Student');
  const [profileColor, setProfileColor] = useState(profile?.color || '#4f46e5');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChannelId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const openProfileModal = () => {
    setProfileName(profile?.full_name || '');
    setProfileRole(profile?.role || 'Student');
    setProfileColor(profile?.color || '#4f46e5');
    setShowProfileModal(true);
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !attachedFile) || !user || !activeChannel) return;
    if (activeChannel.type === 'overview') {
      showToast("You cannot post directly to 'All Activity'.");
      return;
    }
    
    let finalAttachmentUrl = attachedFile?.url || null;
    let finalAttachmentName = attachedFile?.name || null;
    let finalAttachmentSize = attachedFile?.size || null;
    let finalAttachmentType = attachedFile?.type || null;

    if (attachedFile?.rawFile) {
      setIsUploading(true);
      const fileExt = attachedFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, attachedFile.rawFile);

      setIsUploading(false);

      if (uploadError) {
        showToast(`Upload failed: ${uploadError.message} (Did you create the 'attachments' bucket?)`);
        return;
      }

      const { data } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      finalAttachmentUrl = data.publicUrl;
    }

    const text = messageText;
    
    setMessageText('');
    setAttachedFile(null);
    setShowEmojiPicker(false);

    const messagePayload: any = {
      channel_id: activeChannelId,
      author_id: user.id,
      text: text || `Sent an attachment: ${finalAttachmentName}`,
      attachment_name: finalAttachmentName,
      attachment_size: finalAttachmentSize,
      attachment_type: finalAttachmentType,
      attachment_url: finalAttachmentUrl
    };

    if (replyToMsgId) {
      messagePayload.reply_to = replyToMsgId;
    }

    const { error } = await supabase.from('messages').insert([messagePayload]);
    
    if (error) {
      showToast(`Failed to send: ${error.message}`);
    } else {
      setReplyToMsgId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be less than 10MB');
      return;
    }

    setAttachedFile({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      type: file.type,
      url: URL.createObjectURL(file),
      rawFile: file
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          role: profileRole,
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

  const handleSaveEdit = async (msgId: string) => {
    if (!editMessageText.trim()) return;
    const { error } = await supabase.from('messages').update({ 
      text: editMessageText, 
      edited_at: new Date().toISOString() 
    }).eq('id', msgId);
    
    if (error) {
      showToast(`Edit failed: ${error.message} (Did you add the SQL column?)`);
    } else {
      setEditingMsgId(null);
    }
  };

  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const handleGenerateUniversalLink = () => {
    if (!user) return;
    const link = `${window.location.origin}/?inviter=${user.id}`;
    setGeneratedInviteLink(link);
    navigator.clipboard.writeText(link);
    showToast("Universal invite link copied to clipboard!");
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
       setSelectedChannelId(data.id);
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
       c.channel_members?.some((m: ChannelMember) => m.user_id === peerId)
    );

    if (existingDm) {
      setSelectedChannelId(existingDm.id);
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
        setSelectedChannelId(newDm.id);
      }
    }

    setShowPeersModal(false);
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDateDivider = (isoString: string) => {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const highlightText = (text: string, highlight: string) => {
    if (!text) return '';
    if (!highlight.trim()) return text;
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <span key={i} className="search-highlight">{part}</span> : part
    );
  };

  const getDmPeer = (channel: Channel) => {
     if (channel.type !== 'dm' || !user) return null;
     const peerMember = channel.channel_members?.find((m: ChannelMember) => m.user_id !== user.id);
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

  const renderNavIcon = (channel: Channel) => {
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
  
  const filteredMessages = messages.filter(msg => 
    (msg.text || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            onClick={openProfileModal}
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
            <div className="search-input-container">
              <Search size={14} color="var(--text-faint)" />
              <input 
                type="text" 
                placeholder="Search messages..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
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
          {filteredMessages.length === 0 ? (
            <div className="empty-state">
              <MessageCircle size={48} className="empty-state-icon" />
              <h3>{searchQuery ? 'No matching messages' : 'No messages yet'}</h3>
              <p>{searchQuery ? 'Try a different search term.' : 'Be the first to start the conversation!'}</p>
            </div>
          ) : (
            filteredMessages.map((msg, index) => {
              const author = users[msg.author_id];
              const msgReactions = reactions[msg.id] || {};
              
              // Date Divider logic
              const currentDate = new Date(msg.created_at).toDateString();
              const prevDate = index > 0 ? new Date(filteredMessages[index - 1].created_at).toDateString() : null;
              const showDateDivider = currentDate !== prevDate;
              
              // Quoted message
              const quotedMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null;
              const quotedAuthor = quotedMsg ? users[quotedMsg.author_id]?.full_name : 'Unknown';

              return (
                <React.Fragment key={msg.id}>
                  {showDateDivider && (
                    <div className="date-divider">
                      <span>{formatDateDivider(msg.created_at)}</span>
                    </div>
                  )}
                  <div className="message" style={{ position: 'relative' }}>
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
                      {msg.edited_at && <span className="edited-label">(edited)</span>}
                    </div>
                    
                    {quotedMsg && (
                      <div className="quoted-message" onClick={() => {
                        // In a real app, this would scroll to the message
                      }}>
                        <div className="quoted-author">{quotedAuthor}</div>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{quotedMsg.text}</div>
                      </div>
                    )}

                    {editingMsgId === msg.id ? (
                      <div className="edit-message-container">
                        <input 
                          type="text" 
                          className="edit-message-input"
                          value={editMessageText}
                          onChange={e => setEditMessageText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveEdit(msg.id);
                            if (e.key === 'Escape') setEditingMsgId(null);
                          }}
                          autoFocus
                        />
                        <div className="edit-message-actions">
                          <button className="cancel" onClick={() => setEditingMsgId(null)}>Cancel</button>
                          <button className="save" onClick={() => handleSaveEdit(msg.id)}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <p className="msg-text">{highlightText(msg.text, searchQuery)}</p>
                    )}
                    
                    {/* Render attachment if exists */}
                    {msg.attachment_name && (
                      msg.attachment_type?.startsWith('image/') ? (
                        <div className="msg-image-attachment" style={{ cursor: 'pointer', marginTop: 8 }} onClick={() => msg.attachment_url && window.open(msg.attachment_url, '_blank')}>
                          <img src={msg.attachment_url || ''} alt={msg.attachment_name} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                        </div>
                      ) : (
                        <div className="msg-attachment" style={{ marginTop: 8 }} onClick={() => msg.attachment_url && window.open(msg.attachment_url, '_blank')}>
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

                    <button 
                      onClick={() => setReplyToMsgId(msg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                      title="Reply"
                    >
                      <Reply size={14} />
                    </button>

                    {msg.author_id === user?.id && (
                      <>
                        <button 
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditMessageText(msg.text);
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                          title="Edit message"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteMessage(msg.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                          title="Delete message"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                </React.Fragment>
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
            {/* Reply banner */}
            {replyToMsgId && (
              <div className="reply-banner">
                <div>
                  <span style={{ fontWeight: 650, color: 'var(--primary-600)' }}>Replying to </span>
                  {users[messages.find(m => m.id === replyToMsgId)?.author_id || '']?.full_name}
                </div>
                <button className="cancel-btn" onClick={() => setReplyToMsgId(null)}>
                  <X size={16} />
                </button>
              </div>
            )}
            
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
                disabled={(!messageText.trim() && !attachedFile) || activeChannel.type === 'overview' || isUploading} 
                onClick={handleSendMessage}
              >
                {isUploading ? (
                  <div style={{width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto'}} />
                ) : (
                  <>Send <Send size={16} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => { setShowInviteModal(false); setGeneratedInviteLink(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite via Link</h3>
              <X className="modal-close" onClick={() => { setShowInviteModal(false); setGeneratedInviteLink(null); }} />
            </div>
            <div className="modal-body">
              {!generatedInviteLink ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    Generate a universal link that anyone can click to instantly start a direct message with you!
                  </p>
                  <button className="form-submit-btn" onClick={handleGenerateUniversalLink} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                    Generate & Copy Link
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    Share this unique link with anyone. Once they open it, they can register and chat with you in real-time!
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
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label>Channel Description</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="What should this channel be used for?"
                  value={newChannelDesc}
                  onChange={e => setNewChannelDesc(e.target.value)}
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
                  onChange={e => setProfileRole(e.target.value as UserRole)}
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
                {Object.values(users).map((u: UserProfile) => {
                  const isMember = activeChannel.type === 'overview' || 
                    (activeChannel.channel_members && activeChannel.channel_members.some((m: ChannelMember) => m.user_id === u.id)) ||
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
              {Object.values(users).filter(u => u.id !== user?.id).map((u: UserProfile) => (
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
