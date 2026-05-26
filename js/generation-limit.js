// ── GENERAČNÍ LIMITY — freemium model

import { supabase } from './supabase.js?v=8';
import { getCurrentUser } from './auth.js?v=8';

export const FREE_LIMIT = 3;

// Zkontroluj limit a inkrementuj počítadlo (atomicky přes Supabase RPC)
// Vrací { allowed, count, limit, premium } nebo null pokud není přihlášen
export async function checkAndIncrement() {
  const user = getCurrentUser();
  if (!user) return null; // nepřihlášen

  const { data, error } = await supabase.rpc('increment_generation', { uid: user.id });
  if (error) {
    console.error('generation-limit RPC error:', error);
    // Při chybě povol generaci (graceful degradation)
    return { allowed: true, count: 0, limit: FREE_LIMIT, premium: false };
  }
  return data;
}

// Zjisti aktuální stav bez inkrementace (pro badge)
export async function getUsageInfo() {
  const user = getCurrentUser();
  if (!user) return { count: 0, limit: FREE_LIMIT, premium: false };

  const { data, error } = await supabase
    .from('profiles')
    .select('generation_count, generation_reset, is_premium')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return { count: 0, limit: FREE_LIMIT, premium: false };

  // Reset pokud nový měsíc (jen pro zobrazení — skutečný reset dělá RPC)
  const resetDate = data.generation_reset ? new Date(data.generation_reset) : new Date();
  const now = new Date();
  const sameMonth = resetDate.getMonth() === now.getMonth() && resetDate.getFullYear() === now.getFullYear();

  return {
    count: sameMonth ? (data.generation_count || 0) : 0,
    limit: FREE_LIMIT,
    premium: data.is_premium || false,
  };
}
