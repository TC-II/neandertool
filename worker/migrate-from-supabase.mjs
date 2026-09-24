/**
 * One-off: export scores from the old Supabase project into SQL for D1.
 *
 *   node migrate-from-supabase.mjs > seed.sql
 *   npx wrangler d1 execute neandertool-leaderboard --remote --file=seed.sql
 *
 * The Supabase project must be active (restore it from the dashboard if paused).
 */

const SUPABASE_URL = 'https://iwwckvwdxdmdupxtplpv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
    console.error('Set SUPABASE_KEY (the anon key) in the environment.');
    process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?select=name,score,date&order=score.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
});
if (!res.ok) {
    console.error(`Supabase returned HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
}

const rows = await res.json();
const esc = s => String(s).replace(/'/g, "''");
const now = Date.now();

for (const r of rows) {
    const score = parseInt(r.score, 10);
    if (!r.name || !Number.isInteger(score) || score <= 0) continue;
    const name = esc(String(r.name).toUpperCase().slice(0, 12));
    const date = esc(r.date || new Date(now).toISOString().split('T')[0]);
    console.log(`INSERT INTO scores (name, score, date, ip_hash, created_at) VALUES ('${name}', ${score}, '${date}', NULL, ${now});`);
}
console.error(`Exported ${rows.length} rows.`);
