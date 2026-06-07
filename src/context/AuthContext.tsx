import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { AuthContext } from './auth';
import type { Invitation, UserProfile } from '../types/chat';

const COLORS = [
  '#4f46e5', '#7c3aed', '#db2777', '#dc2626',
  '#ea580c', '#d97706', '#16a34a', '#0d9488',
  '#0284c7', '#2563eb', '#4338ca', '#7e22ce',
];

const pickProfileColor = (seed: string) => {
  const hash = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureBotDm = useCallback(async (userId: string) => {
    try {
      const botId = '00000000-0000-0000-0000-000000000000';
      
      // Get all DM channel IDs that the user is in
      const { data: userMembers, error: err1 } = await supabase
        .from('channel_members')
        .select('channel_id')
        .eq('user_id', userId);
        
      if (err1 || !userMembers) return;
      const userChannelIds = userMembers.map(m => m.channel_id);
      
      if (userChannelIds.length > 0) {
        // Find if the bot is in any of these same channels, and confirm it's a DM
        const { data: commonMembers, error: err2 } = await supabase
          .from('channel_members')
          .select('channel_id, channels!inner(type)')
          .in('channel_id', userChannelIds)
          .eq('user_id', botId)
          .eq('channels.type', 'dm');
          
        if (!err2 && commonMembers && commonMembers.length > 0) {
          console.log('[AuthContext] DM with bot already exists.');
          return;
        }
      }

      // Create a new DM channel with the bot
      console.log('[AuthContext] Creating automatic DM with Bot Friend...');
      const { data: newDm, error: dmError } = await supabase
        .from('channels')
        .insert([{
          name: 'Direct Message',
          type: 'dm',
          icon_type: 'user',
          created_by: userId
        }])
        .select()
        .single();

      if (dmError || !newDm) {
        console.error('[AuthContext] Error creating DM channel with bot:', dmError);
        return;
      }

      // Add user and bot to the DM channel members list
      const { error: memberError } = await supabase
        .from('channel_members')
        .insert([
          { channel_id: newDm.id, user_id: userId },
          { channel_id: newDm.id, user_id: botId }
        ]);

      if (memberError) {
        console.error('[AuthContext] Error adding members to bot DM:', memberError);
      } else {
        console.log('[AuthContext] Bot DM created successfully!');
      }
    } catch (err) {
      console.error('[AuthContext] Exception in ensureBotDm:', err);
    }
  }, []);

  const processInvitations = useCallback(async (email: string | undefined, userId: string) => {
    if (!email) return;
    
    // Check if user was invited to any channels
    const { data: invites } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', email)
      .eq('status', 'pending');

    if (invites && invites.length > 0) {
      for (const invite of invites as Invitation[]) {
        if (invite.channel_id) {
          // Add to channel
          await supabase.from('channel_members').insert([
            { channel_id: invite.channel_id, user_id: userId }
          ]);
        } else if (invite.invited_by) {
          // It was a direct invite, ensure DM exists
          // Check if DM already exists
          const { data: dms } = await supabase
            .from('channels')
            .select('*, channel_members!inner(user_id)')
            .eq('type', 'dm')
            .in('channel_members.user_id', [userId, invite.invited_by]);

          let dmExists = false;
          if (dms) {
            for (const dm of dms) {
               // Validate it's a DM between exactly these two
               const { data: members } = await supabase.from('channel_members').select('user_id').eq('channel_id', dm.id);
               if (members && members.length === 2 && members.some(m => m.user_id === userId) && members.some(m => m.user_id === invite.invited_by)) {
                  dmExists = true;
                  break;
               }
            }
          }

          if (!dmExists) {
             const { data: newDm } = await supabase.from('channels').insert([{
               name: 'Direct Message',
               type: 'dm',
               icon_type: 'user',
               created_by: invite.invited_by
             }]).select().single();

             if (newDm) {
               await supabase.from('channel_members').insert([
                 { channel_id: newDm.id, user_id: userId },
                 { channel_id: newDm.id, user_id: invite.invited_by }
               ]);
             }
          }
        }
        
        // Mark invite as accepted
        await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id);
      }
    }
  }, []);

  const processUniversalInvite = useCallback(async (currentUserId: string) => {
    const inviterId = localStorage.getItem('pending_inviter');
    if (!inviterId || inviterId === currentUserId) {
       localStorage.removeItem('pending_inviter');
       return;
    }
    
    // Check if DM exists
    const { data: myChannels } = await supabase.from('channel_members').select('channel_id').eq('user_id', currentUserId);
    const myChannelIds = myChannels?.map(m => m.channel_id) || [];
    
    if (myChannelIds.length > 0) {
      const { data: commonMembers } = await supabase.from('channel_members').select('channel_id').eq('user_id', inviterId).in('channel_id', myChannelIds);
      if (commonMembers && commonMembers.length > 0) {
         // They already have a channel together (we assume DM)
         localStorage.removeItem('pending_inviter');
         return;
      }
    }
    
    // Create new DM
    const { data: newDm } = await supabase.from('channels').insert([{
      name: 'Direct Message',
      type: 'dm',
      icon_type: 'user',
      created_by: inviterId
    }]).select().single();
    
    if (newDm) {
      await supabase.from('channel_members').insert([
        { channel_id: newDm.id, user_id: currentUserId },
        { channel_id: newDm.id, user_id: inviterId }
      ]);
    }
    
    localStorage.removeItem('pending_inviter');
  }, []);

  const createProfile = useCallback(async (authUser: User) => {
    const defaultName = authUser.email ? authUser.email.split('@')[0] : 'New User';
    const newProfile: UserProfile = {
      id: authUser.id,
      email: authUser.email || '',
      full_name: defaultName,
      avatar_url: null,
      color: pickProfileColor(authUser.id || authUser.email || defaultName),
      role: 'Student',
      is_online: true,
      last_seen: new Date().toISOString()
    };

    console.log('[AuthContext] Inserting new profile in database:', newProfile);
    const { error } = await supabase.from('profiles').insert([newProfile]);
    if (!error) {
      console.log('[AuthContext] Profile created successfully in database!');
      setProfile(newProfile);
      if (authUser.email) {
        console.log('[AuthContext] Processing channel invitations for new user...');
        await processInvitations(authUser.email, authUser.id);
      }
      await processUniversalInvite(authUser.id);
      await ensureBotDm(authUser.id);
    } else {
      console.error('[AuthContext] Error inserting profile in database:', error.message, error);
    }
  }, [ensureBotDm, processInvitations, processUniversalInvite]);

  const fetchProfile = useCallback(async (authUser: User) => {
    console.log(`[AuthContext] fetchProfile starting for user ID: ${authUser.id}, Email: ${authUser.email}`);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) {
        console.warn('[AuthContext] fetchProfile database error:', error);
        if (error.code === 'PGRST116') {
          console.log('[AuthContext] Profile does not exist (PGRST116). Attempting to create profile...');
          await createProfile(authUser);
        } else {
          console.error('[AuthContext] Unexpected database error fetching profile:', error.message, error);
        }
      } else if (data) {
        const loadedProfile = data as UserProfile;
        console.log('[AuthContext] Profile fetched successfully:', loadedProfile);
        setProfile(loadedProfile);
        
        console.log('[AuthContext] Updating profile online status...');
        const { error: updateError } = await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', authUser.id);
        if (updateError) {
          console.warn('[AuthContext] Failed to update online status:', updateError.message);
        }

        if (authUser.email) {
          await processInvitations(authUser.email, authUser.id);
        }
        await processUniversalInvite(authUser.id);
        await ensureBotDm(authUser.id);
      }
    } catch (err) {
      console.error('[AuthContext] Unexpected error in fetchProfile:', err);
    } finally {
      console.log('[AuthContext] fetchProfile finished. Setting loading to false.');
      setLoading(false);
    }
  }, [createProfile, ensureBotDm, processInvitations]);

  useEffect(() => {
    console.log('[AuthContext] Initializing AuthProvider...');
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthContext] getSession result:', session ? `User ID: ${session.user.id}` : 'No active session');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        console.log('[AuthContext] No user in initial session, setting loading to false');
        setLoading(false);
      }
    }).catch(err => {
      console.error('[AuthContext] getSession error:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AuthContext] onAuthStateChange event: ${event}`, session ? `User ID: ${session.user.id}` : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        setProfile(null);
        console.log('[AuthContext] No user in auth change event, setting loading to false');
        setLoading(false);
      }
    });

    return () => {
      console.log('[AuthContext] Cleaning up AuthProvider subscription...');
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithEmail = async (email: string) => {
    return await supabase.auth.signInWithOtp({
      email,
      options: {
        // Redirect to same URL we're on
        emailRedirectTo: window.location.origin
      }
    });
  };

  const signInWithGoogle = async () => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    const redirectTo = inviteId
      ? `${window.location.origin}/?invite=${encodeURIComponent(inviteId)}`
      : window.location.origin;

    return await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });
  };

  const signOut = async () => {
    if (user) {
      await supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signInWithEmail, signInWithGoogle, signOut, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
