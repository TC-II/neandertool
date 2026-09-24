/**
 * Neandertool - Leaderboard API (Cloudflare Worker + D1)
 *
 *   GET  /scores  → top 10 [{ name, score, date }]
 *   POST /scores  ← { name, score }  → 201 | 400 | 429
 */

const TOP_N = 10;
const NAME_MAX = 12;           // matches #high-score-name maxlength
const SCORE_MAX = 10_000_000;  // sanity cap
const RATE_LIMIT_MS = 15_000;  // one submission per IP per window

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS }
    });
}

async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listScores(env) {
    const { results } = await env.DB
        .prepare('SELECT name, score, date FROM scores ORDER BY score DESC, created_at ASC LIMIT ?')
        .bind(TOP_N)
        .all();
    return json(results);
}

async function submitScore(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'invalid json' }, 400);
    }

    const name = typeof body.name === 'string'
        ? body.name.replace(/[\u0000-\u001f<>]/g, '').trim().toUpperCase().slice(0, NAME_MAX)
        : '';
    const score = Number(body.score);

    if (!name) return json({ error: 'invalid name' }, 400);
    if (!Number.isInteger(score) || score <= 0 || score > SCORE_MAX) {
        return json({ error: 'invalid score' }, 400);
    }

    const now = Date.now();
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await sha256(ip + (env.IP_SALT || 'neandertool'));

    const recent = await env.DB
        .prepare('SELECT 1 FROM scores WHERE ip_hash = ? AND created_at > ? LIMIT 1')
        .bind(ipHash, now - RATE_LIMIT_MS)
        .first();
    if (recent) return json({ error: 'too many requests' }, 429);

    const date = new Date(now).toISOString().split('T')[0];
    await env.DB
        .prepare('INSERT INTO scores (name, score, date, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(name, score, date, ipHash, now)
        .run();

    return json({ ok: true }, 201);
}

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

        try {
            if (pathname === '/scores' && request.method === 'GET') return await listScores(env);
            if (pathname === '/scores' && request.method === 'POST') return await submitScore(request, env);
        } catch (e) {
            console.error(e);
            return json({ error: 'internal error' }, 500);
        }

        return json({ error: 'not found' }, 404);
    }
};
