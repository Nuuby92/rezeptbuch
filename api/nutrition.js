module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

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
        notFound: [],
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
- Berücksichtige den Zubereitungskontext: z.B. wird bei "1 Liter Öl zum Frittieren" nur ein kleiner Bruchteil (ca. 5-10%) tatsächlich vom Essen aufgenommen, nicht die gesamte Menge
- Berücksichtige offensichtliche Tippfehler in Zutatennamen (z.B. "Resissirup" = "Reissirup")
- Verwende realistische, übliche Nährwerte für die jeweiligen Zutaten (rohe Zutaten, sofern nicht anders angegeben)
- Rechne alle Mengenangaben korrekt um (TL, EL, Tasse, Stk, Zehe usw.)
- Berechne die GESAMTEN Nährwerte für das komplette Rezept (alle Zutaten zusammen, nicht pro Portion)

Antworte NUR mit validem JSON ohne Markdown-Backticks, in folgendem Format:
{
  "total": { "kcal": 1234, "protein": 56.7, "carbs": 89.0, "fat": 45.6 }
}

Alle Werte als Zahlen (nicht als String), kcal als ganze Zahl, andere mit einer Nachkommastelle.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
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

    let result;
    try {
      result = JSON.parse(raw);
    } catch(e) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { result = JSON.parse(jsonMatch[0]); }
        catch(e2) { return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." }); }
      } else {
        return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden." });
      }
    }

    const total = result.total || { kcal: 0, protein: 0, carbs: 0, fat: 0 };

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
      notFound: [],
    });

  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
