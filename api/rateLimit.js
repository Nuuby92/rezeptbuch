// ── Gemeinsame Rate-Limit-Funktion für alle KI-Endpunkte ────────────────────
// Nutzt Firestore direkt über REST API (kein Admin SDK nötig, funktioniert in Vercel Functions)

const FIREBASE_PROJECT_ID = "rezeptbuch-253bc";
const RATE_LIMIT_PER_HOUR = 30; // Max. KI-Anfragen pro Nutzer und Stunde (über alle Endpunkte zusammen)
const MAX_INPUT_LENGTH = 20000; // Max. Zeichen für Texteingaben (Import etc.)

async function checkRateLimit(uid) {
  if (!uid) return { allowed: false, error: "Nicht angemeldet." };

  const now = Date.now();
  const hourBucket = Math.floor(now / (60 * 60 * 1000)); // Stunden-Fenster
  const docPath = `ratelimits/${uid}_${hourBucket}`;
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}`;

  try {
    // Aktuellen Zähler lesen
    const getRes = await fetch(url);
    let count = 0;
    if (getRes.ok) {
      const data = await getRes.json();
      count = parseInt(data.fields?.count?.integerValue || "0");
    }

    if (count >= RATE_LIMIT_PER_HOUR) {
      return { allowed: false, error: `Limit erreicht: Max. ${RATE_LIMIT_PER_HOUR} KI-Anfragen pro Stunde. Bitte später erneut versuchen.` };
    }

    // Zähler erhöhen (upsert via PATCH mit updateMask)
    const patchUrl = `${url}?updateMask.fieldPaths=count&updateMask.fieldPaths=updatedAt`;
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          count: { integerValue: String(count + 1) },
          updatedAt: { integerValue: String(now) },
        },
      }),
    });

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
