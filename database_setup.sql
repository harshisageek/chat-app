-- Run this script in the Supabase SQL Editor to set up your database for Accredian Connect

-- 1. Create Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text not null,
  avatar_url text,
  color text default '#4f46e5',
  role text default 'Student' check (role in ('Student', 'Mentor', 'Alumni')),
  is_online boolean default false,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- 2. Create Channels table
create table public.channels (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  type text not null check (type in ('cohort', 'dm', 'overview')),
  icon_type text default 'hash' check (icon_type in ('hash', 'message', 'user', 'bell')),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 3. Create Channel Members table (for group membership and unread tracking)
create table public.channel_members (
  channel_id uuid references public.channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (channel_id, user_id)
);

-- 4. Create Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references public.channels(id) on delete cascade not null,
  author_id uuid references public.profiles(id) not null,
  text text not null,
  attachment_name text,
  attachment_size text,
  attachment_type text,
  attachment_url text,
  created_at timestamptz default now()
);

-- 5. Create Invitations table (for inviting new users)
create table public.invitations (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  invited_by uuid references public.profiles(id),
  channel_id uuid references public.channels(id),
  status text default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now()
);

-- 6. Enable Realtime on tables
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.channel_members;

-- 7. Disable Row Level Security (RLS) for rapid prototyping (Not recommended for production!)
-- To keep things simple and ensure everything works immediately for this prototype, we'll allow all authenticated users to read/write.
alter table public.profiles disable row level security;
alter table public.channels disable row level security;
alter table public.channel_members disable row level security;
alter table public.messages disable row level security;
alter table public.invitations disable row level security;

-- Insert initial Overview channel
insert into public.channels (name, description, type, icon_type) 
values ('All Activity', 'Your combined feed of all activities.', 'overview', 'message');

-- ═════════════════════════════════════════════════════════════════════
-- 8. Bot Friend Setup (Auto-reply helper)
-- ═════════════════════════════════════════════════════════════════════

-- Drop profiles foreign key reference to auth.users so we can insert mock bot profiles
DO $$
DECLARE
    const_name text;
BEGIN
    SELECT constraint_name INTO const_name
    FROM information_schema.table_constraints
    WHERE table_name = 'profiles' AND constraint_type = 'FOREIGN KEY';
    
    IF const_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || const_name;
    END IF;
END $$;

-- Insert Bot Friend profile
INSERT INTO public.profiles (id, email, full_name, role, color, is_online, last_seen)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'bot@accredian.com',
  'Bot Friend 🤖',
  'Mentor',
  '#10b981',
  true,
  now()
) ON CONFLICT (id) DO UPDATE 
SET is_online = true, last_seen = now();

-- Create trigger function for automatic bot replies in DM channels
CREATE OR REPLACE FUNCTION public.handle_bot_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if message is in DM and not written by the bot
  IF EXISTS (
    SELECT 1 FROM public.channels 
    WHERE id = NEW.channel_id AND type = 'dm'
  ) AND NEW.author_id <> '00000000-0000-0000-0000-000000000000' THEN
    
    -- Check if the bot is a member of this DM channel
    IF EXISTS (
      SELECT 1 FROM public.channel_members 
      WHERE channel_id = NEW.channel_id AND user_id = '00000000-0000-0000-0000-000000000000'
    ) THEN
      -- Insert reply message
      INSERT INTO public.messages (channel_id, author_id, text)
      VALUES (NEW.channel_id, '00000000-0000-0000-0000-000000000000', 'hello i am your friend');
    END IF;
    
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach bot reply trigger
DROP TRIGGER IF EXISTS on_message_created_bot_reply ON public.messages;
CREATE TRIGGER on_message_created_bot_reply
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_bot_reply();
