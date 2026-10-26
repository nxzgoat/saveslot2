export type Platform = 'steam' | 'playstation' | 'xbox' | 'nintendo' | 'pc' | 'mobile' | 'retro' | 'other';
export type Status = 'playing' | 'completed' | 'backlog' | 'dropped';

export interface Profile {
  id: string;
  user_id: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_public: boolean;
  show_library: boolean;
  show_achievements: boolean;
  is_demo: boolean;
  created_at: string;
  location: string | null;
  show_activity: boolean;
  show_friends: boolean;
  allow_messages: boolean;
  show_in_rankings: boolean;
  notif_prefs: Record<string, boolean>;
}

export interface Game {
  id: string;
  title: string;
  cover_url: string | null;
}

export interface LibraryEntry {
  profile_id: string;
  game_id: string;
  platform: Platform;
  status: Status;
  hours: number | null;
  rating: number | null;
  is_favorite: boolean;
  last_played_at: string | null;
  game: Game;
}

export interface UnlockedAchievement {
  unlocked_at: string | null;
  achievement: { id: string; title: string; description: string | null; game: { title: string } | null };
}

export interface LinkedAccount {
  id: string;
  profile_id: string;
  platform: string;
  username: string | null;
  url: string | null;
  external_id?: string | null;
  verified?: boolean;
  last_synced_at?: string | null;
  is_demo?: boolean;
}

export const PLATFORMS: Record<Platform, string> = {
  steam: 'Steam',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  nintendo: 'Nintendo',
  pc: 'PC',
  mobile: 'Mobile',
  retro: 'Retrô',
  other: 'Outra',
};

export const STATUS: Record<Status, string> = {
  playing: 'Jogando',
  completed: 'Zerado',
  backlog: 'Na fila',
  dropped: 'Abandonado',
};

export const LINK_PLATFORMS = ['steam', 'playstation', 'xbox', 'nintendo', 'retroachievements', 'discord', 'twitch', 'youtube', 'outro'];

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type PostKind = 'text' | 'achievement' | 'platinum' | 'review';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}
export interface Message { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }
export interface AppNotification { id: string; profile_id: string; type: string; actor_id: string | null; link: string | null; text: string; read_at: string | null; created_at: string }
export interface Group {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  avatar_url: string | null;
  visibility: 'public' | 'private';
  created_by: string | null;
  created_at: string;
}
export type GroupRole = 'admin' | 'moderator' | 'member';
export interface GroupMember { group_id: string; profile_id: string; role: GroupRole; joined_at: string }
export interface GroupMessage { id: string; group_id: string; sender_id: string; body: string; created_at: string }
export interface Post {
  id: string;
  author_id: string;
  kind: PostKind;
  body: string | null;
  image_url: string | null;
  group_id: string | null;
  game_id: string | null;
  achievement_id: string | null;
  review_id: string | null;
  repost_of: string | null;
  platform: string | null;
  created_at: string;
}
export interface Review {
  id: string;
  game_id: string;
  profile_id: string;
  rating: number;
  body: string | null;
  platform: string | null;
  hours: number | null;
  has_spoiler: boolean;
  created_at: string;
  updated_at: string;
}
export interface GameStat {
  game_id: string;
  title: string;
  cover_url: string | null;
  description: string | null;
  is_demo: boolean;
  created_at: string;
  avg_rating: number | null;
  review_count: number;
  platforms: string[];
}
export interface Rarity { achievement_id: string; percent: number | null; percent_source: 'platform' | 'site' | 'unknown'; tier: Tier }
export interface ProfileStats { profile_id: string; show_in_rankings: boolean; bronze: number; silver: number; gold: number; platinum: number; points: number; level: number }
export interface GameLite { id: string; title: string; cover_url: string | null }

export interface DiaryItem {
  key: string;
  type: 'achievement' | 'platinum' | 'review';
  at: string;
  platform: string | null;
  game: GameLite;
  title: string;
  text: string | null;
  tier?: Tier;
  percent?: number | null;
  percentSource?: string;
  rating?: number;
  hasSpoiler?: boolean;
  hours?: number | null;
  achievementId?: string;
  reviewId?: string;
}
