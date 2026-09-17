const { checkRateLimit, truncateInput } = require('./rateLimit');
const { verifyAppCheckToken } = require('./appCheck');

// Atwater-Faktoren: kcal pro Gramm Makronährstoff
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
// Ab dieser relativen Abweichung gilt die Kalorienangabe als unplausibel
const KCAL_TOLERANCE = 0.10;

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : 0;
  const n = parseFloat(String(value == null ? "" : value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeTotal(raw) {
  const t = raw || {};
  return {
    kcal: toNumber(t.kcal),
    protein: toNumber(t.protein),
    carbs: toNumber(t.carbs),
    fat: toNumber(t.fat),
  };
}

// Aus den Makros abgeleitete Kalorien -- das muss zur kcal-Angabe passen
function kcalFromMacros(t) {
  return t.protein * KCAL_PER_G.protein + t.carbs * KCAL_PER_G.carbs + t.fat * KCAL_PER_G.fat;
}

function checkPlausibility(t) {
  const expected = kcalFromMacros(t);
  if (expected <= 0) return { ok: t.kcal === 0, expected: 0, deviation: t.kcal > 0 ? 1 : 0 };
  const deviation = Math.abs(t.kcal - expected) / expected;
  return { ok: deviation <= KCAL_TOLERANCE, expected, deviation };
}

function parseTotal(raw) {
  let result;
  try {
    result = JSON.parse(raw);
  } catch (e) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try { result = JSON.parse(jsonMatch[0]); }
    catch (e2) { return null; }
  }
  return result && result.total ? normalizeTotal(result.total) : null;
}

async function requestTotal(apiKey, promptText) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: promptText }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    const apiError = new Error("Claude API Fehler: " + err.slice(0, 200));
    apiError.isApiError = true;
    throw apiError;
  }

  const data = await response.json();
  const raw = data.content[0].text.trim()
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return parseTotal(raw);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  // Rate limiting: uid muss vom Frontend mitgeschickt werden
  const uid = req.body?.uid;
  const rl = await checkRateLimit(uid);
  if (!rl.allowed) return res.status(429).json({ error: rl.error });

  // App Check: verifiziert dass die Anfrage von der echten Webseite kommt (nicht von einem Bot)
  const appCheckToken = req.headers["x-firebase-appcheck"];
  const isValidAppCheck = await verifyAppCheckToken(appCheckToken);
  if (!isValidAppCheck) return res.status(403).json({ error: "Zugriff verweigert (App Check fehlgeschlagen)." });

  try {
    const { ingredients, servings } = req.body;
    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({ error: "ingredients (Array) erforderlich" });
    }

    const baseServings = parseInt(servings) || 1;

    // Nur Zutaten mit Mengenangabe berücksichtigen
    const validIngredients = ingredients.filter(i => i.name && i.amount && i.amount.toString().trim() !== "");

    if (validIngredients.length === 0) {
      return res.status(200).json({
        total: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        servings: baseServings,
      });
    }

    const ingList = validIngredients
      .map(i => `- ${i.amount}${i.unit || ""} ${i.name}`)
      .join("\n");

    const prompt = `Du bist ein Ernährungsexperte. Berechne die Nährwerte für folgendes Rezept.

Zutaten:
${ingList}

Das Rezept ergibt ${baseServings} Portion(en).

Wichtige Hinweise:
- Fett/Öl NUR dann reduziert anrechnen, wenn es echtes Frittieren in einem großen Ölbad ist, bei dem der Großteil des Öls im Topf zurückbleibt und weggeschüttet wird (z.B. "1 Liter Öl zum Frittieren" -> nur ca. 5-10% aufgenommen). In ALLEN anderen Fällen wird Öl und Butter VOLLSTÄNDIG mitgezählt: Pfannen-/Bratöl, Öl zum Anbraten/Sautieren, Dressings, Marinaden, Öl über dem Gericht, Backofen-Öl usw. landen komplett im Essen. Eine normale Menge Pfannenöl (z.B. 60 ml) also zu 100% anrechnen, nicht abziehen.
- Berücksichtige offensichtliche Tippfehler in Zutatennamen (z.B. "Resissirup" = "Reissirup")
- Verwende realistische, übliche Nährwerte für die jeweiligen Zutaten (rohe Zutaten, sofern nicht anders angegeben)
- Rechne alle Mengenangaben korrekt um (TL, EL, Tasse, Stk, Zehe usw.)
- Die Kalorien müssen zu den Makronährstoffen passen: kcal = 4x Eiweiß + 4x Kohlenhydrate + 9x Fett (jeweils in Gramm). Rechne das vor dem Antworten selbst nach.
- Berechne die GESAMTEN Nährwerte für das komplette Rezept (alle Zutaten zusammen, nicht pro Portion)

Antworte NUR mit validem JSON ohne Markdown-Backticks, in folgendem Format:
{
  "total": { "kcal": 1234, "protein": 56.7, "carbs": 89.0, "fat": 45.6 }
}

Alle Werte als Zahlen (nicht als String), kcal als ganze Zahl, andere mit einer Nachkommastelle.`;

    let total;
    try {
      total = await requestTotal(ANTHROPIC_KEY, prompt);
    } catch (e) {
      if (e.isApiError) return res.status(500).json({ error: e.message });
      throw e;
    }
    if (!total) return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." });

    // Plausibilitätsprüfung: passen die Kalorien zu den Makronährstoffen?
    let check = checkPlausibility(total);
    let retried = false;
    let corrected = false;

    if (!check.ok) {
      // Einmal nachfassen und das Modell auf den Widerspruch hinweisen
      retried = true;
      const hint = `

Deine letzte Antwort war rechnerisch nicht schlüssig:
kcal: ${Math.round(total.kcal)}, Eiweiß: ${total.protein} g, Kohlenhydrate: ${total.carbs} g, Fett: ${total.fat} g.
Aus den Makronährstoffen ergeben sich ${Math.round(check.expected)} kcal (4/4/9 kcal pro Gramm), das sind ${Math.round(check.deviation * 100)} % Abweichung.
Prüfe die Mengen und Nährwerte der einzelnen Zutaten noch einmal und antworte erneut mit dem JSON. Kalorien und Makronährstoffe müssen zueinander passen.`;

      let retryTotal = null;
      try { retryTotal = await requestTotal(ANTHROPIC_KEY, prompt + hint); }
      catch (e) { retryTotal = null; }

      if (retryTotal) {
        const retryCheck = checkPlausibility(retryTotal);
        // Zweite Antwort nur übernehmen, wenn sie stimmig ist oder näher dran liegt
        if (retryCheck.ok || retryCheck.deviation < check.deviation) {
          total = retryTotal;
          check = retryCheck;
        }
      }

      if (!check.ok) {
        // Die Makros sind je Zutat belegbar, die kcal-Summe ist die daraus abgeleitete Größe.
        // Bleibt der Widerspruch, gewinnen deshalb die Makros.
        total.kcal = Math.round(check.expected);
        corrected = true;
        check = checkPlausibility(total);
      }

      console.warn("[nutrition] Unplausible Kalorienangabe: " + JSON.stringify({
        ingredients: validIngredients.length,
        servings: baseServings,
        retried,
        corrected,
        kcal: Math.round(total.kcal),
        protein: total.protein,
        carbs: total.carbs,
        fat: total.fat,
      }));
    }

    const perServing = {
      kcal: Math.round(total.kcal / baseServings),
      protein: Math.round((total.protein / baseServings) * 10) / 10,
      carbs: Math.round((total.carbs / baseServings) * 10) / 10,
      fat: Math.round((total.fat / baseServings) * 10) / 10,
    };

    return res.status(200).json({
      total: {
        kcal: Math.round(total.kcal),
        protein: Math.round(total.protein * 10) / 10,
        carbs: Math.round(total.carbs * 10) / 10,
        fat: Math.round(total.fat * 10) / 10,
      },
      perServing,
      servings: baseServings,
      check: {
        plausible: check.ok,
        retried,
        corrected,
        expectedKcal: Math.round(check.expected),
        deviationPercent: Math.round(check.deviation * 1000) / 10,
      },
    });

  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};

// Für Tests exportiert -- Vercel nutzt weiterhin die Handler-Funktion oben
module.exports.checkPlausibility = checkPlausibility;
module.exports.normalizeTotal = normalizeTotal;
