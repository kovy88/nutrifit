// ── AUTENTIZACE (localStorage) + AUTH UI + GOOGLE SIGN-IN

const USERS_KEY   = 'nutriplan-users';
const SESSION_KEY = 'nutriplan-session';

// 1. Jdi na console.cloud.google.com
// 2. Vytvoř projekt → APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)
// 3. Přidej svou doménu do Authorized JavaScript origins
// 4. Zkopíruj Client ID sem:
const GOOGLE_CLIENT_ID = '671016135738-rl5fj7fhvvljjo3ppc9edh53hvtv5sg3.apps.googleusercontent.com';

// ── STORAGE AUTH

export function hashPassword(pwd) {
  return btoa(encodeURIComponent(pwd));
}

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function getProfileKey() {
  const u = getCurrentUser();
  return u ? `nutriplan-profile-${u.email}` : 'nutriplan-profile';
}

export function getHistoryKey() {
  const u = getCurrentUser();
  return u ? `nutriplan-history-${u.email}` : 'nutriplan-history';
}

export function register(name, email, password) {
  if (!name || !email || !password) return { error: 'Vyplň všechna pole' };
  if (password.length < 6) return { error: 'Heslo musí mít alespoň 6 znaků' };
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  if (users.find(u => u.email === email)) return { error: 'Tento e-mail je již registrován' };
  users.push({ name, email, password: hashPassword(password) });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return { ok: true };
}

export function login(email, password) {
  if (!email || !password) return { error: 'Vyplň e-mail a heslo' };
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  const user = users.find(u => u.email === email && u.password === hashPassword(password));
  if (!user) return { error: 'Nesprávný e-mail nebo heslo' };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email: user.email, name: user.name }));
  return { ok: true, user };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

// ── AUTH UI

export function updateNavAuth() {
  const user = getCurrentUser();
  if (user) {
    document.body.classList.add('logged-in');
    const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarEl = document.getElementById('nav-user-avatar');
    const nameEl   = document.getElementById('nav-user-name');
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
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

export function handleLogin() {
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  const errEl    = document.getElementById('auth-login-error');
  const res = login(email, password);
  if (res.error) { errEl.textContent = res.error; return; }
  errEl.textContent = '';
  closeAuthModal();
  updateNavAuth();
  // loadProfileOnStart je importován a volán z main.js, proto použijeme event
  window.dispatchEvent(new CustomEvent('auth:login'));
}

export function handleRegister() {
  const name     = document.getElementById('reg-name')?.value.trim();
  const email    = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const errEl    = document.getElementById('auth-register-error');
  const res = register(name, email, password);
  if (res.error) { errEl.textContent = res.error; return; }
  login(email, password);
  errEl.textContent = '';
  closeAuthModal();
  updateNavAuth();
  window.dispatchEvent(new CustomEvent('auth:login'));
}

export function handleLogout() {
  logout();
  updateNavAuth();
  document.getElementById('btn-profile')?.classList.remove('has-profile');
}

// ── GOOGLE SIGN-IN

function handleGoogleCredential(response) {
  try {
    const b64  = response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '=');
    const bytes  = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const { name, email } = payload;
    if (!email) throw new Error('Chybí email');

    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (!users.find(u => u.email === email)) {
      users.push({ name, email, password: null, provider: 'google' });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, name, provider: 'google' }));

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
