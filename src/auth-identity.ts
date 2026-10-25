import type { User } from '@supabase/supabase-js';

export type IdentityProfile = {
  nickname?: string | null;
  display_name?: string | null;
  name?: string | null;
};

export function preferredAccountName(profile: IdentityProfile | null, user: User): string {
  const metadata = user.user_metadata || {};
  const options = [
    profile?.nickname,
    profile?.display_name,
    profile?.name,
    metadata.nickname,
    metadata.display_name,
    metadata.name,
    user.email?.split('@')[0],
  ];
  return options.find((value) => typeof value === 'string' && value.trim())?.trim() || 'Minha conta';
}
