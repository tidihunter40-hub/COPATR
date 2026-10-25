import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AuthConfig = { url?: string; anonKey?: string };

declare global {
  interface Window {
    __trAuthClient?: { url: string; anonKey: string; client: SupabaseClient };
  }
}

export function getAuthClient(config: AuthConfig): SupabaseClient {
  if (!config.url || !config.anonKey) throw new Error('O ambiente oficial não está configurado.');
  const cached = window.__trAuthClient;
  if (cached?.url === config.url && cached.anonKey === config.anonKey) return cached.client;
  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
  window.__trAuthClient = { url: config.url, anonKey: config.anonKey, client };
  return client;
}
