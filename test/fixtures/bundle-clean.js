// Fixture. Every value below is invented and none of it is a working credential.
// This is what a normal AI-built app ships to the browser: keys that are meant
// to be public. None of it should ever be reported as a finding.
(() => {
  const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3BxcnN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMDAwMDAsImV4cCI6MjA1MDAwMDAwMH0.ZmFrZS1zaWduYXR1cmUtZm9yLXRlc3RzLW9ubHktbm90LXJlYWw";

  const firebaseConfig = {
    apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    authDomain: "demo-app.firebaseapp.com",
    projectId: "demo-app",
    appId: "1:123456789012:web:abc123def456",
  };

  const stripe = Stripe("pk_live_51NxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxYY");
  const SENTRY_DSN = "https://0123456789abcdef0123456789abcdef@o123456.ingest.sentry.io/1234567";
  const POSTHOG_KEY = "phc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  async function loadDashboard() {
    const res = await fetch("/api/projects");
    const items = await res.json();
    await fetch("/api/auth/session");
    return items;
  }

  window.__app = { SUPABASE_URL, SUPABASE_ANON_KEY, firebaseConfig, stripe, SENTRY_DSN, POSTHOG_KEY, loadDashboard };
})();
