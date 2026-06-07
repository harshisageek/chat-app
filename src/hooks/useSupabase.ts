import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const useChannels = (userId: string | undefined) => {
  const [channels, setChannels] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;

    // Fetch initial channels (overview, cohort, and DMs involving this user)
    const fetchChannels = async () => {
      // Get channels and their members using a left join
      const { data, error } = await supabase
        .from('channels')
        .select(`
          *,
          channel_members(user_id)
        `);

      if (!error && data) {
         // Filter: overview/cohort (visible to all), or DM where user is a member
         const validChannels = data.filter(c => 
            c.type !== 'dm' || (c.channel_members && c.channel_members.some((m: any) => m.user_id === userId))
         );
         setChannels(validChannels);
      } else {
         // Fallback if the join fails due to RLS or schema issues
         const { data: allChannels } = await supabase.from('channels').select('*');
         if (allChannels) setChannels(allChannels);
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

export const useMessages = (channelId: string) => {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!channelId) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };

    fetchMessages();

    const subscription = supabase
      .channel(`messages_${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, payload => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [channelId]);

  return { messages };
};

export const useUsers = () => {
  const [users, setUsers] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        const userMap: Record<string, any> = {};
        data.forEach(u => userMap[u.id] = u);
        setUsers(userMap);
      }
    };

    fetchUsers();

    const subscription = supabase
      .channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
           setUsers(prev => ({ ...prev, [payload.new.id]: payload.new }));
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
  const channelRef = useRef<any>(null);
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
            const p = presences[0] as any;
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

export const useUnreadCounts = (channels: any[], activeChannelId: string) => {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // Mark active channel as read
  useEffect(() => {
    if (activeChannelId) {
      setLastRead(activeChannelId, new Date().toISOString());
      setUnreadCounts(prev => ({ ...prev, [activeChannelId]: 0 }));
    }
  }, [activeChannelId]);

  // Fetch unread counts for all channels
  useEffect(() => {
    if (channels.length === 0) return;

    const fetchUnreads = async () => {
      const lastReadMap = getLastReadMap();
      const counts: Record<string, number> = {};

      for (const ch of channels) {
        if (ch.id === activeChannelId) {
          counts[ch.id] = 0;
          continue;
        }
        
        const lastRead = lastReadMap[ch.id];
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
        const msgChannelId = (payload.new as any).channel_id;
        if (msgChannelId !== activeChannelId) {
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
  }, [channels.length, activeChannelId]);

  const markAsRead = useCallback((channelId: string) => {
    setLastRead(channelId, new Date().toISOString());
    setUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
  }, []);

  return { unreadCounts, markAsRead };
};

// ─────────────── NOTIFICATION SOUND ───────────────
let audioCtx: AudioContext | null = null;

export const playNotificationSound = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch (e) {
    // Audio not available, fail silently
  }
};
