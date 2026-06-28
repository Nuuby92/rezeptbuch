module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  try {
    const { name, description, ingredients, tags } = req.body;
    if (!name) return res.status(400).json({ error: "name erforderlich" });

    const ingList = (ingredients || []).filter(i => i.name).map(i => i.name).join(", ");
    const tagList = (tags || []).join(", ");

    const isVegetarian = (tags||[]).some(t => t === "Vegetarisch" || t === "Vegan");
    const isSweet = (tags||[]).some(t => t === "Dessert");

    const prompt = `Du bist ein erfahrener Sommelier. Empfehle passende Weine zu diesem Gericht.

Gericht: "${name}"
${description ? 'Beschreibung: "' + description + '"' : ''}
Zutaten: ${ingList}
${tagList ? 'Kategorien: ' + tagList : ''}

Gib 3 Weinempfehlungen – unterschiedliche Stile (z.B. Rotwein, Weißwein, Rosé oder Schaumwein je nach Gericht).
Für jede Empfehlung:
- Weintyp und Rebsorte
- Empfohlene Region/Herkunft
- Kurze Begründung warum er zum Gericht passt (1-2 Sätze)
- Preisklasse: € (günstig, bis 10€), €€ (mittel, 10-20€), €€€ (gehoben, über 20€)
${isSweet ? 'Da es ein Dessert ist, empfehle Dessertweine, Sekt oder leichte Süßweine.' : ''}
${isVegetarian ? 'Das Gericht ist vegetarisch/vegan, beachte dies bei der Empfehlung.' : ''}

Antworte NUR mit validem JSON ohne Backticks:
[
  {
    "type": "Weißwein",
    "grape": "Riesling",
    "region": "Mosel, Deutschland",
    "note": "Die feine Säure und Fruchtigkeit harmoniert perfekt mit...",
    "price": "€€"
  }
]`;

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

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/^```json?\s*/i,"").replace(/```\s*$/i,"").trim();

    let wines;
    try { wines = JSON.parse(raw); }
    catch(e) { return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." }); }

    return res.status(200).json({ wines });
  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
