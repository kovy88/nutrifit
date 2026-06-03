import { inject } from 'https://esm.sh/@vercel/analytics@2.0.1';

window.loadVercelAnalytics = function loadVercelAnalytics() {
  if (window.__vercelAnalyticsLoaded) return;
  window.__vercelAnalyticsLoaded = true;
  inject({ mode: 'production' });
};

if (localStorage.getItem('nutriplan-consent') === 'accepted') {
  window.loadVercelAnalytics();
}
