// ── Gemeinsame Rate-Limit-Funktion für alle KI-Endpunkte ────────────────────
// Nutzt Firestore direkt über REST API, authentifiziert über einen Service-Account
// (siehe googleAuth.js). Ohne Authentifizierung lehnen die Firestore-Security-Rules
// die Zugriffe ab, wodurch das Limit sonst wirkungslos bliebe.

const { getAccessToken } = require('./googleAuth');

const FIREBASE_PROJECT_ID = "rezeptbuch-253bc";
const RATE_LIMIT_PER_HOUR = 100; // Max. KI-Anfragen pro Nutzer und Stunde (über alle Endpunkte zusammen)
const MAX_INPUT_LENGTH = 20000; // Max. Zeichen für Texteingaben (Import etc.)

async function checkRateLimit(uid) {
  if (!uid) return { allowed: false, error: "Nicht angemeldet." };

  const now = Date.now();
  const hourBucket = Math.floor(now / (60 * 60 * 1000)); // Stunden-Fenster
  const docPath = `ratelimits/${uid}_${hourBucket}`;
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}`;

  try {
    const accessToken = await getAccessToken();
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Aktuellen Zähler lesen
    const getRes = await fetch(url, { headers: authHeader });
    let count = 0;
    if (getRes.ok) {
      const data = await getRes.json();
      count = parseInt(data.fields?.count?.integerValue || "0");
    } else if (getRes.status !== 404) {
      throw new Error(`Firestore GET fehlgeschlagen: ${getRes.status}`);
    }

    if (count >= RATE_LIMIT_PER_HOUR) {
      return { allowed: false, error: `Limit erreicht: Max. ${RATE_LIMIT_PER_HOUR} KI-Anfragen pro Stunde. Bitte später erneut versuchen.` };
    }

    // Zähler erhöhen (upsert via PATCH mit updateMask)
    const patchUrl = `${url}?updateMask.fieldPaths=count&updateMask.fieldPaths=updatedAt`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        fields: {
          count: { integerValue: String(count + 1) },
          updatedAt: { integerValue: String(now) },
        },
      }),
    });
    if (!patchRes.ok) throw new Error(`Firestore PATCH fehlgeschlagen: ${patchRes.status}`);

    return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - count - 1 };
  } catch (e) {
    // Bei Fehlern im Rate-Limit-System selbst: Anfrage sicherheitshalber durchlassen,
    // damit ein Firestore-Ausfall nicht die ganze App lahmlegt
    console.error("Rate limit check failed:", e.message);
    return { allowed: true, remaining: null };
  }
}

function truncateInput(text, maxLen) {
  maxLen = maxLen || MAX_INPUT_LENGTH;
  if (!text) return text;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

module.exports = { checkRateLimit, truncateInput, MAX_INPUT_LENGTH };
