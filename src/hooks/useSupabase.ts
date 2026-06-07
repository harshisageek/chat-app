import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Channel, ChannelMember, Message, UserProfile } from '../types/chat';

export const useChannels = (userId: string | undefined) => {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!userId) return;

    // Fetch initial channels (overview, cohort, and DMs involving this user)
    const fetchChannels = async () => {
      // Get channels and their members using a left join
      const { data, error } = await supabase
        .from('channels')
        .select(`
          *,
          channel_members(channel_id, user_id, last_read_at)
        `);

      if (!error && data) {
         // Filter: overview/cohort (visible to all), or DM where user is a member
         const validChannels = (data as Channel[]).filter(c =>
            c.type !== 'dm' || c.channel_members?.some((m: ChannelMember) => m.user_id === userId)
         );
         setChannels(validChannels);
      } else {
         // Fallback if the join fails due to RLS or schema issues
         const { data: allChannels } = await supabase.from('channels').select('*');
         if (allChannels) setChannels(allChannels as Channel[]);
      }
    };

    fetchChannels();

    // Subscribe to channel changes
    const subscription = supabase
      .channel('channels_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        fetchChannels(); // refetch to handle joins properly
      })
      .subscribe();

    // Subscribe to channel_members changes so DMs show up immediately after creation
    const memberSubscription = supabase
      .channel('channel_members_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_members' }, () => {
        fetchChannels();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      memberSubscription.unsubscribe();
    };
  }, [userId]);

  return { channels };
};

export const useMessages = (channelId: string, visibleChannelIds: string[] = [], isOverview = false) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const visibleChannelKey = useMemo(() => visibleChannelIds.join(','), [visibleChannelIds]);

  useEffect(() => {
    if (!channelId) return;
    const channelIds = visibleChannelKey ? visibleChannelKey.split(',') : [];

    const fetchMessages = async () => {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (isOverview) {
        if (channelIds.length === 0) {
          setMessages([]);
          return;
        }
        query = query.in('channel_id', channelIds);
      } else {
        query = query.eq('channel_id', channelId);
      }

      const { data } = await query;
      if (data) setMessages(data);
    };

    fetchMessages();

    const messageFilter = isOverview ? undefined : `channel_id=eq.${channelId}`;
    const subscription = supabase
      .channel(isOverview ? `messages_overview_${visibleChannelKey}` : `messages_${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: messageFilter }, payload => {
        const message = payload.new as Message;
        if (isOverview && !channelIds.includes(message.channel_id)) return;
        setMessages(prev => prev.some(existing => existing.id === message.id) ? prev : [...prev, message]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: messageFilter }, payload => {
        const deleted = payload.old as Pick<Message, 'id' | 'channel_id'>;
        if (isOverview && !channelIds.includes(deleted.channel_id)) return;
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [channelId, isOverview, visibleChannelKey]);

  return { messages };
};

export const useUsers = () => {
  const [users, setUsers] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        const userMap: Record<string, UserProfile> = {};
        (data as UserProfile[]).forEach(u => userMap[u.id] = u);
        setUsers(userMap);
      }
    };

    fetchUsers();

    const subscription = supabase
      .channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
           const profile = payload.new as UserProfile;
           setUsers(prev => ({ ...prev, [profile.id]: profile }));
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { users };
};

// ─────────────── TYPING INDICATOR ───────────────
export const useTypingIndicator = (channelId: string, userId: string | undefined, userName: string | undefined) => {
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!channelId || !userId) return;

    const presenceChannel = supabase.channel(`typing:${channelId}`, {
      config: { presence: { key: userId } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const typers: { id: string; name: string }[] = [];
        
        Object.entries(state).forEach(([key, presences]) => {
          if (key !== userId && Array.isArray(presences)) {
            const p = presences[0] as { is_typing?: boolean; name?: string };
            if (p?.is_typing) {
              typers.push({ id: key, name: p.name || 'Someone' });
            }
          }
        });
        
        setTypingUsers(typers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ is_typing: false, name: userName || 'User' });
        }
      });

    channelRef.current = presenceChannel;

    return () => {
      presenceChannel.unsubscribe();
      channelRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [channelId, userId, userName]);

  const startTyping = useCallback(() => {
    if (!channelRef.current) return;
    
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      channelRef.current.track({ is_typing: true, name: userName || 'User' });
    }
    
    // Auto-stop typing after 3 seconds of inactivity
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      channelRef.current?.track({ is_typing: false, name: userName || 'User' });
    }, 3000);
  }, [userName]);

  const stopTyping = useCallback(() => {
    if (!channelRef.current) return;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      channelRef.current.track({ is_typing: false, name: userName || 'User' });
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [userName]);

  return { typingUsers, startTyping, stopTyping };
};

// ─────────────── UNREAD COUNTS ───────────────
const LAST_READ_KEY = 'chat_last_read';

const getLastReadMap = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) || '{}');
  } catch {
    return {};
  }
};

const setLastRead = (channelId: string, timestamp: string) => {
  const map = getLastReadMap();
  map[channelId] = timestamp;
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
};

const getChannelLastRead = (channel: Channel, userId: string | undefined) => {
  return channel.channel_members?.find(member => member.user_id === userId)?.last_read_at;
};

export const useUnreadCounts = (channels: Channel[], activeChannelId: string, userId: string | undefined) => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const lastOverviewReadKeyRef = useRef('');

  const persistChannelsAsRead = useCallback(async (channelIds: string[]) => {
    if (channelIds.length === 0) return;
    const readAt = new Date().toISOString();
    channelIds.forEach(channelId => setLastRead(channelId, readAt));

    if (!userId) return;

    const { error } = await supabase
      .from('channel_members')
      .upsert(
        channelIds.map(channelId => ({ channel_id: channelId, user_id: userId, last_read_at: readAt })),
        { onConflict: 'channel_id,user_id' }
      );

    if (error) {
      console.warn('[useUnreadCounts] Could not persist read state:', error.message);
    }
  }, [userId]);

  const markAsRead = useCallback(async (channelId: string) => {
    if (!channelId) return;

    setUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
    await persistChannelsAsRead([channelId]);
  }, [persistChannelsAsRead]);

  // Mark active channel as read
  useEffect(() => {
    if (!activeChannelId) return;

    const activeChannel = channels.find(channel => channel.id === activeChannelId);
    if (activeChannel?.type === 'overview') {
      const channelIds = channels.map(channel => channel.id);
      const overviewReadKey = `${userId || 'anonymous'}:${channelIds.join(',')}`;
      if (overviewReadKey !== lastOverviewReadKeyRef.current) {
        lastOverviewReadKeyRef.current = overviewReadKey;
        persistChannelsAsRead(channelIds);
      }
      return;
    }

    persistChannelsAsRead([activeChannelId]);
  }, [activeChannelId, channels, persistChannelsAsRead, userId]);

  // Fetch unread counts for all channels
  useEffect(() => {
    if (!userId || channels.length === 0) return;

    const fetchUnreads = async () => {
      const lastReadMap = getLastReadMap();
      const activeChannel = channels.find(channel => channel.id === activeChannelId);
      const activeIsOverview = activeChannel?.type === 'overview';
      const counts: Record<string, number> = {};

      for (const ch of channels) {
        if (ch.id === activeChannelId || activeIsOverview) {
          counts[ch.id] = 0;
          continue;
        }
        
        const lastRead = getChannelLastRead(ch, userId) || lastReadMap[ch.id];
        if (!lastRead) {
          // Never read — count all messages
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('channel_id', ch.id);
          counts[ch.id] = count || 0;
        } else {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('channel_id', ch.id)
            .gt('created_at', lastRead);
          counts[ch.id] = count || 0;
        }
      }

      setUnreadCounts(counts);
    };

    fetchUnreads();

    // Listen for new messages across all channels to update counts
    const sub = supabase
      .channel('unread_messages_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msgChannelId = (payload.new as Message).channel_id;
        const activeChannel = channels.find(channel => channel.id === activeChannelId);
        const messageIsVisible = channels.some(channel => channel.id === msgChannelId);
        const shouldIncrement = messageIsVisible && msgChannelId !== activeChannelId && activeChannel?.type !== 'overview';

        if (shouldIncrement) {
          setUnreadCounts(prev => ({
            ...prev,
            [msgChannelId]: (prev[msgChannelId] || 0) + 1
          }));
        }
      })
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, [channels, activeChannelId, userId]);

  const visibleUnreadCounts = useMemo(
    () => activeChannelId ? { ...unreadCounts, [activeChannelId]: 0 } : unreadCounts,
    [unreadCounts, activeChannelId]
  );

  return { unreadCounts: visibleUnreadCounts, markAsRead };
};

// ─────────────── NOTIFICATION SOUND ───────────────
let audioCtx: AudioContext | null = null;

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export const playNotificationSound = () => {
  try {
    if (!audioCtx) {
      const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
      if (!AudioContextCtor) return;
      audioCtx = new AudioContextCtor();
    }
    
    const now = audioCtx.currentTime;
    
    // Create a pleasant two-tone chime
    const playTone = (freq: number, start: number, duration: number, gain: number) => {
      const osc = audioCtx!.createOscillator();
      const gainNode = audioCtx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      
      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(gain, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx!.destination);
      
      osc.start(start);
      osc.stop(start + duration);
    };
    
    // Two-note chime: E5 → G5
    playTone(659.25, now, 0.15, 0.12);
    playTone(783.99, now + 0.12, 0.2, 0.10);
  } catch {
    // Audio not available, fail silently
  }
};
