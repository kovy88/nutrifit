// ── AUTENTIZACE (Supabase) + AUTH UI + GOOGLE SIGN-IN

import { supabase } from './supabase.js';

const GOOGLE_CLIENT_ID = '671016135738-rl5fj7fhvvljjo3ppc9edh53hvtv5sg3.apps.googleusercontent.com';

// ── CURRENT USER
// Synchronní přístup — proměnná je naplněna přes initAuthListener v state.js
let _currentUser = null;
export function _setCurrentUser(u) { _currentUser = u; }
export function getCurrentUser()   { return _currentUser; }

// ── SUPABASE AUTH

export async function signUp(name, email, password) {
  if (!name || !email || !password) return { error: 'Vyplň všechna pole' };
  if (password.length < 6)          return { error: 'Heslo musí mít alespoň 6 znaků' };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) return { error: error.message };
  return { ok: true, user: data.user };
}

export async function signIn(email, password) {
  if (!email || !password) return { error: 'Vyplň e-mail a heslo' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { ok: true, user: data.user };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ── AUTH UI

export function updateNavAuth() {
  const user = getCurrentUser();
  if (user) {
    document.body.classList.add('logged-in');
    const name     = user.user_metadata?.full_name || user.email;
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarEl = document.getElementById('nav-user-avatar');
    const nameEl   = document.getElementById('nav-user-name');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = name;
  } else {
    document.body.classList.remove('logged-in');
  }
}

export function openAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

export function closeAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) { m.style.display = 'none'; document.body.style.overflow = ''; }
}

export async function handleLogin() {
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const errEl    = document.getElementById('auth-login-error');
  const res = await signIn(email, password);
  if (res.error) { errEl.textContent = res.error; return; }
  errEl.textContent = '';
  closeAuthModal();
  updateNavAuth();
  window.dispatchEvent(new CustomEvent('auth:login'));
}

export async function handleRegister() {
  const name     = document.getElementById('reg-name')?.value.trim();
  const email    = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const consent  = document.getElementById('reg-consent')?.checked;
  const errEl    = document.getElementById('auth-register-error');
  if (!consent) { errEl.textContent = 'Pro registraci je nutný souhlas s podmínkami.'; return; }
  const res = await signUp(name, email, password);
  if (res.error) { errEl.textContent = res.error; return; }
  errEl.textContent = '';
  document.getElementById('reg-name').value     = '';
  document.getElementById('reg-email').value    = '';
  document.getElementById('reg-password').value = '';

  // Pokud Supabase vyžaduje ověření emailu (user nemá session hned)
  if (res.user && !res.user.confirmed_at && res.user.identities?.length === 0) {
    errEl.style.color = 'var(--green)';
    errEl.textContent = 'Ověřovací email odeslán! Zkontroluj svou schránku a klikni na odkaz.';
    return;
  }
  closeAuthModal();
  updateNavAuth();
  window.dispatchEvent(new CustomEvent('auth:login'));
}

export async function handleLogout() {
  await signOut();
  updateNavAuth();
  document.getElementById('btn-profile')?.classList.remove('has-profile');
}

// ── GOOGLE SIGN-IN
// Používá GSI popup (zachována původní UX) — credential se předá Supabase přes signInWithIdToken

async function handleGoogleCredential(response) {
  try {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential,   // JWT přímo z GSI popup
    });
    if (error) throw error;
    closeAuthModal();
    updateNavAuth();
    window.dispatchEvent(new CustomEvent('auth:login'));
  } catch (e) {
    const errEl = document.getElementById('auth-login-error');
    if (errEl) errEl.textContent = 'Chyba při přihlášení přes Google.';
  }
}

window.onGoogleLibraryLoad = function () {
  const isPlaceholder = GOOGLE_CLIENT_ID.startsWith('TVUJ_');
  if (isPlaceholder) {
    const note = document.getElementById('google-setup-note');
    if (note) note.style.display = 'block';
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme: 'outline', size: 'large', width: 320, locale: 'cs', text: 'signin_with' }
  );
};
