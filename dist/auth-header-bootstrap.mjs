import { supabaseConfig } from './runtime-config.mjs';
import { startAuthHeader } from './auth-header.js';

startAuthHeader(supabaseConfig);
