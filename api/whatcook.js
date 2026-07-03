module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  try {
    const { haveIngredients, filters } = req.body;

    const ingList = (haveIngredients || []).join(", ") || "keine speziellen Vorgaben";
    const filterList = (filters || []).join(", ") || "keine speziellen Vorgaben";

    const prompt = `Erstelle ein vollständiges, leckeres Rezept.

Vorhandene Zutaten die verwendet werden sollen (wenn möglich): ${ingList}
Gewünschte Kategorien: ${filterList}

Erstelle ein realistisches, gut nachkochbares Rezept mit passenden Mengenangaben.

Antworte NUR mit validem JSON ohne Markdown-Backticks:
{
  "name": "Rezeptname auf Deutsch",
  "description": "Kurze Beschreibung (1-2 Sätze)",
  "servings": "4",
  "prepTime": "30 min",
  "ingredients": [{ "amount": "200", "unit": "g", "name": "Zutatname" }],
  "steps": [{ "text": "Zubereitungsschritt" }]
}

Einheiten müssen exakt sein: g, kg, ml, l, EL, TL, Tasse, Stk, Scheibe, Prise, Zehe (oder leer für "nach Geschmack").`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Claude API Fehler: " + err.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content[0].text.trim()
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let recipe;
    try {
      recipe = JSON.parse(raw);
    } catch(e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { recipe = JSON.parse(m[0]); } catch(e2) { return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." }); } }
      else return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." });
    }

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    recipe.ingredients = (recipe.ingredients || []).map(i => Object.assign({ id: uid() }, i));
    recipe.steps = (recipe.steps || []).map(s => Object.assign({ id: uid() }, s));

    return res.status(200).json({ recipe });

  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
