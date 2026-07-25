// Fixture. Every value below is invented and none of it is a working credential.
// This is the shape of a bundle that has real problems in it: server-side keys
// that were pasted into frontend code because it made the feature work.
(() => {
  const supabase = createClient(
    "https://abcdefghijklmnopqrst.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3BxcnN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDAwMDAwMCwiZXhwIjoyMDUwMDAwMDAwfQ.ZmFrZS1zaWduYXR1cmUtZm9yLXRlc3RzLW9ubHktbm90LXJlYWw",
  );

  const STRIPE_SECRET = "sk_live_51NabcdefghijklmnopqrstuvwxyzABCDEFGH";
  const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
  const GH_TOKEN = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const DB = "postgresql://appuser:hunter2correct@db.internal-host.example:5432/production";

  async function sendReceipt(email) {
    await fetch("https://api.resend.com/emails", {
      headers: { Authorization: "Bearer re_abcdefghijklmnopqrstuvwxyz012345" },
    });
    await fetch("/api/customers");
  }

  window.__app = { supabase, STRIPE_SECRET, AWS_KEY, GH_TOKEN, DB, sendReceipt };
})();
