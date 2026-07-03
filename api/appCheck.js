// ── Firebase App Check Verifizierung ─────────────────────────────────────────
// Prüft das X-Firebase-AppCheck Token (JWT) gegen Google's öffentliche Schlüssel (JWKS).
// Verhindert dass Bots die API direkt ansprechen, ohne über die echte Webseite zu gehen.

const crypto = require("crypto");

const FIREBASE_PROJECT_NUMBER = "324939912260"; // aus firebaseConfig messagingSenderId
const JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks";
const JWKS_CACHE_MS = 6 * 60 * 60 * 1000; // 6h, wie von Google empfohlen

let cachedKeys = null;
let cachedAt = 0;

async function getJwks() {
  if (cachedKeys && Date.now() - cachedAt < JWKS_CACHE_MS) return cachedKeys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("JWKS-Abruf fehlgeschlagen");
  const data = await res.json();
  cachedKeys = data.keys;
  cachedAt = Date.now();
  return cachedKeys;
}

function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function verifyAppCheckToken(token) {
  if (!token || typeof token !== "string") return false;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;

    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));

    if (header.alg !== "RS256") return false;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return false;
    if (payload.iss !== `https://firebaseappcheck.googleapis.com/${FIREBASE_PROJECT_NUMBER}`) return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(`projects/${FIREBASE_PROJECT_NUMBER}`)) return false;

    const keys = await getJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;

    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const signature = base64UrlDecode(sigB64);
    const signedData = Buffer.from(`${headerB64}.${payloadB64}`);

    return crypto.verify("RSA-SHA256", signedData, publicKey, signature);
  } catch (e) {
    return false;
  }
}

module.exports = { verifyAppCheckToken };
