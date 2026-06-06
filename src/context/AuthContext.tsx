import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  color: string;
  role: 'Student' | 'Mentor' | 'Alumni';
};

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const COLORS = [
  '#4f46e5', '#7c3aed', '#db2777', '#dc2626',
  '#ea580c', '#d97706', '#16a34a', '#0d9488',
  '#0284c7', '#2563eb', '#4338ca', '#7e22ce',
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] Initializing AuthProvider...');
    
    // Check active session
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

    // Listen for auth changes
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
  }, []);

  const fetchProfile = async (user: User) => {
    console.log(`[AuthContext] fetchProfile starting for user ID: ${user.id}, Email: ${user.email}`);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('[AuthContext] fetchProfile database error:', error);
        if (error.code === 'PGRST116') {
          console.log('[AuthContext] Profile does not exist (PGRST116). Attempting to create profile...');
          await createProfile(user);
        } else {
          console.error('[AuthContext] Unexpected database error fetching profile:', error.message, error);
        }
      } else if (data) {
        console.log('[AuthContext] Profile fetched successfully:', data);
        setProfile(data as UserProfile);
        
        // Update online status
        console.log('[AuthContext] Updating profile online status...');
        const { error: updateError } = await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id);
        if (updateError) {
          console.error('[AuthContext] Error updating profile online status:', updateError);
        }
        
        // Handle pending invitations
        console.log('[AuthContext] Processing channel invitations...');
        await processInvitations(user.email, data.id);
        
        // Ensure DM with Bot Friend exists
        await ensureBotDm(data.id);
      } else {
        console.warn('[AuthContext] fetchProfile returned no data and no error.');
      }
    } catch (err) {
      console.error('[AuthContext] Caught exception in fetchProfile:', err);
    } finally {
      console.log('[AuthContext] fetchProfile finished. Setting loading to false.');
      setLoading(false);
    }
  };

  const createProfile = async (user: User) => {
    const defaultName = user.email ? user.email.split('@')[0] : 'New User';
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    const newProfile = {
      id: user.id,
      email: user.email,
      full_name: defaultName,
      color: randomColor,
      role: 'Student',
      is_online: true,
      last_seen: new Date().toISOString()
    };

    console.log('[AuthContext] Inserting new profile in database:', newProfile);
    const { data, error } = await supabase.from('profiles').insert([newProfile]).select();
    if (!error) {
      console.log('[AuthContext] Profile created successfully in database!');
      setProfile(newProfile as UserProfile);
      if (user.email) {
        console.log('[AuthContext] Processing channel invitations for new user...');
        await processInvitations(user.email, user.id);
      }
      // Ensure DM with Bot Friend exists
      await ensureBotDm(user.id);
    } else {
      console.error('[AuthContext] Error inserting profile in database:', error.message, error);
    }
  };

  const ensureBotDm = async (userId: string) => {
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
          .select('channel_id, channels(type)')
          .in('channel_id', userChannelIds)
          .eq('user_id', botId);
          
        if (!err2 && commonMembers) {
          const hasBotDm = commonMembers.some(m => m.channels && (m.channels as any).type === 'dm');
          if (hasBotDm) {
            console.log('[AuthContext] DM with bot already exists.');
            return;
          }
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
  };

  const processInvitations = async (email: string | undefined, userId: string) => {
    if (!email) return;
    
    // Check if user was invited to any channels
    const { data: invites } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', email)
      .eq('status', 'pending');

    if (invites && invites.length > 0) {
      for (const invite of invites) {
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
  };

  const signInWithEmail = async (email: string) => {
    return await supabase.auth.signInWithOtp({
      email,
      options: {
        // Redirect to same URL we're on
        emailRedirectTo: window.location.origin
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
    <AuthContext.Provider value={{ user, profile, session, loading, signInWithEmail, signOut, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
