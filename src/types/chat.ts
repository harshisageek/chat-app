export type UserRole = 'Student' | 'Mentor' | 'Alumni';

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  color: string;
  role: UserRole;
  is_online?: boolean;
  last_seen?: string;
  created_at?: string;
};

export type ChannelType = 'cohort' | 'dm' | 'overview';
export type ChannelIconType = 'hash' | 'message' | 'user' | 'bell';

export type ChannelMember = {
  channel_id?: string;
  user_id: string;
  last_read_at?: string;
};

export type Channel = {
  id: string;
  name: string;
  description: string | null;
  type: ChannelType;
  icon_type: ChannelIconType;
  created_by: string | null;
  created_at: string;
  channel_members?: ChannelMember[];
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  text: string;
  attachment_name: string | null;
  attachment_size: string | null;
  attachment_type: string | null;
  attachment_url: string | null;
  created_at: string;
};

export type AttachedFile = {
  name: string;
  size: string;
  type: string;
  url?: string;
};

export type Invitation = {
  id: string;
  email: string;
  invited_by: string | null;
  channel_id: string | null;
  status: 'pending' | 'accepted';
  created_at: string;
};
