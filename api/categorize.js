module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  try {
    const { name, description, ingredients } = req.body;
    if (!name) return res.status(400).json({ error: "name erforderlich" });

    const ingList = (ingredients || []).filter(i => i.name).map(i => i.name).join(", ");

    const prompt = `Kategorisiere dieses Rezept und vergib passende Tags.

Rezept: "${name}"
Beschreibung: "${description || ""}"
Zutaten: ${ingList}

Vergib Tags aus diesen Kategorien:

MAHLZEIT (genau eine wählen):
- Hauptgericht (warme, vollständige Mahlzeit)
- Beilage (Salate, Gemüse, Dips, Brot als Beilage)
- Frühstück (Müsli, Eier, Toast, Smoothie Bowl)
- Snack (kleine Zwischenmahlzeit, Fingerfood)
- Dessert (Kuchen, Süßspeisen, Eis)
- Getränk (Smoothies, Säfte, Cocktails)

HAUPTZUTAT (alle passenden):
- Fleisch (wenn Rind, Schwein, Lamm, Wild)
- Geflügel (wenn Hähnchen, Pute, Ente)
- Fisch
- Meeresfrüchte
- Vegetarisch (kein Fleisch/Fisch)
- Vegan (keine tierischen Produkte)
- Eier
- Käse

KÜCHE (falls erkennbar):
- Italienisch
- Asiatisch
- Deutsch
- Mexikanisch
- Mediterran
- Indisch
- Amerikanisch
- Französisch

ART:
- Pasta/Nudeln
- Reis/Getreide
- Suppe/Eintopf
- Salat
- Sandwich/Wrap
- Pizza
- Curry
- Pfannengericht
- Backen
- Rohkost
- Bowl

AUFWAND:
- Schnell (unter 20 min)
- Mittel (20-45 min)
- Aufwendig (über 45 min)

Antworte NUR mit einem JSON-Array der passenden Tags, z.B.:
["Hauptgericht", "Fleisch", "Italienisch", "Pasta/Nudeln", "Mittel"]`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/^```json?\s*/i,"").replace(/```\s*$/i,"").trim();

    let tags;
    try { tags = JSON.parse(raw); }
    catch(e) { tags = []; }

    if (!Array.isArray(tags)) tags = [];

    return res.status(200).json({ tags });
  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
