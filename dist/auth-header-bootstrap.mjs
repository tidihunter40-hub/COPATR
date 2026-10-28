import { supabaseConfig } from './runtime-config.mjs';

const hasStoredSession = () => {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      if (/^sb-.*-auth-token$/.test(localStorage.key(index) || '')) return true;
    }
    return false;
  } catch { return true; }
};

let started = false;
const start = async () => {
  if (started || !supabaseConfig.url || !supabaseConfig.anonKey) return;
  started = true;
  const { startAuthHeader } = await import('./auth-header.js');
  startAuthHeader(supabaseConfig);
};

if (hasStoredSession() || /(?:[?#&])(?:code|access_token|refresh_token)=/.test(location.href)) {
  void start();
} else {
  window.addEventListener('storage', () => { if (hasStoredSession()) void start(); });
  window.addEventListener('pageshow', () => { if (hasStoredSession()) void start(); });
}
