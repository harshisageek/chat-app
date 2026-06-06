import { useEffect, useState } from 'react';
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, payload => {
        fetchChannels(); // refetch to handle joins properly
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
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
