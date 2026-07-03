// ── Google OAuth2 Access Token für authentifizierte Firestore-REST-Aufrufe ──
// Signiert ein JWT mit dem Service-Account-Key und tauscht es gegen ein
// kurzlebiges OAuth2-Access-Token (Server-zu-Server-Flow, RFC 7523).
// So greift rateLimit.js mit echten Rechten auf Firestore zu, statt anonym
// (was von den Firestore-Security-Rules zu Recht abgelehnt wird).

const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

let cachedToken = null;
let cachedUntil = 0;

function base64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Service-Account nicht konfiguriert.");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`OAuth2-Token-Abruf fehlgeschlagen: ${res.status}`);
  const data = await res.json();

  cachedToken = data.access_token;
  cachedUntil = Date.now() + (data.expires_in - 60) * 1000; // 60s Sicherheitspuffer
  return cachedToken;
}

module.exports = { getAccessToken };
