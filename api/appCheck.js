// ── Firebase App Check Verifizierung ─────────────────────────────────────────
// Prüft das X-Firebase-AppCheck Token gegen Google's Verifizierungs-Endpunkt.
// Verhindert dass Bots die API direkt ansprechen, ohne über die echte Webseite zu gehen.

const FIREBASE_PROJECT_NUMBER = "324939912260"; // aus firebaseConfig messagingSenderId
const FIREBASE_APP_ID = "1:324939912260:web:9e3daf8c3365d6305a5811";

async function verifyAppCheckToken(token) {
  if (!token) return false;

  try {
    const url = `https://firebaseappcheck.googleapis.com/v1/projects/${FIREBASE_PROJECT_NUMBER}/apps/${encodeURIComponent(FIREBASE_APP_ID)}:verifyAppCheckToken`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_check_token: token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    // Gültiges Token enthält eine ttl (time to live)
    return !!data.ttl;
  } catch (e) {
    return false;
  }
}

module.exports = { verifyAppCheckToken };
