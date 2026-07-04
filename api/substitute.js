const { checkRateLimit, truncateInput } = require('./rateLimit');
const { verifyAppCheckToken } = require('./appCheck');

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
    const { ingredient, amount, unit, recipeName, recipeIngredients } = req.body;
    if (!ingredient) return res.status(400).json({ error: "Zutat erforderlich." });

    const context = recipeIngredients
      ? "Das Rezept \"" + recipeName + "\" enthält außerdem: " + recipeIngredients.join(", ") + "."
      : "";

    const prompt = "Ich koche \"" + recipeName + "\" und habe keine " + [amount, unit, ingredient].filter(Boolean).join(" ") + " zur Hand. "
      + context
      + "\n\nSchlage mir 3 konkrete Alternativen vor mit denen ich die Zutat ersetzen kann. "
      + "Für jede Alternative erkläre kurz wie viel ich nehmen soll und ob sich Geschmack oder Textur leicht verändert. "
      + "Antworte auf Deutsch, kurz und praktisch. Formatiere als JSON-Array:\n"
      + '[{"name":"Alternativname","amount":"Menge","note":"Kurze Erklärung"}]';

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Claude API Fehler: " + err.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/^```json?\s*/i,"").replace(/```\s*$/i,"").trim();

    let alternatives;
    try { alternatives = JSON.parse(raw); }
    catch(e) { return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." }); }

    return res.status(200).json({ alternatives });
  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
