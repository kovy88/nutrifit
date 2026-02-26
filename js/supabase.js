// js/supabase.js — Supabase client (žádné lokální importy)
// SUPABASE_ANON_KEY je veřejný klíč — bezpečný v klientském kódu

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'https://gjkbtpfpgigifapjpaci.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kFJf4C7N7fOIMmAjpBfpnA_HitElk7P';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,  // session přežije reload stránky (uložena do localStorage)
    autoRefreshToken:   true,  // automaticky obnoví JWT před vypršením
    detectSessionInUrl: true,  // potřeba pro OAuth redirect flow (Google)
  },
});
