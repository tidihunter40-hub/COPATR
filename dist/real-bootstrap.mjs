import { supabaseConfig } from './runtime-config.mjs';
import { startRealApp } from './real-app.js';

startRealApp(supabaseConfig).catch((error) => {
  const mount = document.querySelector('#real-app') || document.querySelector('#account-status');
  if (mount) mount.textContent = error?.message || 'Não foi possível carregar o ambiente real.';
});
