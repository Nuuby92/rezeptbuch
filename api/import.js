module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  try {
    const { text, imageBase64, imageType } = req.body;
    if (!text && !imageBase64) {
      return res.status(400).json({ error: "text oder imageBase64 erforderlich" });
    }

    const systemPrompt = `Du bist ein Rezept-Extraktor. Extrahiere aus dem gegebenen Text oder Bild ein Rezept und gib es als JSON zurück.

Regeln zur Übersetzung:
- Übersetze Rezeptname, Beschreibung und Zubereitungsschritte ins Deutsche
- Zutatenname auf Deutsch, ABER: Behalte internationale/asiatische/exotische Produktnamen im Original wenn es keinen gebräuchlichen deutschen Begriff gibt (z.B. "Dumpling Wrapper", "Gyoza", "Miso", "Tahini", "Sriracha", "Panko", "Tofu", "Edamame", "Nori", "Kimchi", "Mirin", "Dashi")
- Übersetze nur wenn ein echter, gebräuchlicher deutscher Begriff existiert (z.B. "chicken" → "Hähnchen", "garlic" → "Knoblauch")
- Diese Begriffe NIEMALS übersetzen, immer im Original lassen: Chili Crisp, Chili Oil, Chili Crunch, Sriracha, Miso, Tahini, Tofu, Tempeh, Edamame, Kimchi, Mirin, Dashi, Panko, Nori, Gyoza, Dumpling, Wonton, Ramen, Udon, Soba, Pad Thai, Pho, Kimchi, Gochujang, Doenjang, Hoisin, Miso, Ponzu, Yuzu, Matcha, Dashi, Bonito

Regeln für Einheiten:
- Einheiten im Feld "unit" müssen exakt eines dieser Werte sein: g, kg, ml, l, EL, TL, Tasse, Stk, Scheibe, Prise, Zehe (oder leer lassen)
- Feste Lebensmittel (Gemüse, Fleisch, Käse, Nüsse usw.) immer in g, NIEMALS in ml
- Frühlingszwiebeln, Zwiebeln, Schalotten und jedes andere Gemüse immer in g, auch wenn im Original cups oder ml angegeben sind
- "green onions" oder "scallions" immer als "Frühlingszwiebeln" übersetzen, NICHT als "grüne Zwiebeln"
- 1 cup gehackte Frühlingszwiebeln ≈ 100g, 1 cup gehackte Zwiebeln ≈ 160g
- Flüssigkeiten (Wasser, Brühe, Öl, Milch, Soßen) in ml oder EL/TL
- Wenn eine Zutat "zum Servieren" oder "nach Geschmack" ist ohne Mengenangabe: amount="" und unit="" lassen
- Stückweise Zutaten (Eier, Zwiebeln, Knoblauchzehen) → unit="Stk" oder unit="Zehe"

Rechne amerikanische Maßeinheiten um:
- cups Flüssigkeit → ml (1 cup = 240ml)
- cups Mehl/Zucker/Feststoffe → g (1 cup Mehl ≈ 120g, 1 cup Zucker ≈ 200g, 1 cup Reis ≈ 185g)
- oz → g (1 oz = 28g)
- lbs → g (1 lb = 454g)
- fl oz → ml (1 fl oz = 30ml)
- tsp / teaspoon → TL
- tbsp / tablespoon → EL
- °F → °C (Formel: (°F - 32) × 5/9), nur in Zubereitungsschritten erwähnen
- inch → cm
- Portionen als Zahl
- Zubereitungszeit als String z.B. "30 min" oder "1 Std 20 min"
- Zutaten sauber trennen: Menge in "amount", Einheit in "unit", reiner Name ohne Adjektive in "name"
- Adjektive wie "fein gehackt", "dünn geschnitten", "gerieben" gehören in den Zubereitungsschritt, nicht in den Zutatennamen
- Zubereitungsschritte als klare, einzelne Schritte

Antworte NUR mit validem JSON, kein Text davor oder danach, keine Markdown-Backticks:
{
  "name": "Rezeptname auf Deutsch",
  "description": "Kurze Beschreibung",
  "servings": "4",
  "prepTime": "30 min",
  "ingredients": [
    { "amount": "200", "unit": "g", "name": "Zutatname" }
  ],
  "steps": [
    { "text": "Zubereitungsschritt" }
  ]
}`;

    const userContent = [];

    if (imageBase64) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageType || "image/jpeg",
          data: imageBase64,
        }
      });
      userContent.push({ type: "text", text: "Extrahiere das Rezept aus diesem Bild." });
    } else {
      userContent.push({ type: "text", text: "Extrahiere das Rezept aus folgendem Text:\n\n" + text });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Claude API Fehler: " + err.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content[0].text.trim();

    // Strip markdown backticks if present
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();

    let recipe;
    try {
      recipe = JSON.parse(cleaned);
    } catch(e) {
      return res.status(500).json({ error: "Rezept konnte nicht geparst werden: " + cleaned.slice(0, 200) });
    }

    // Add IDs to ingredients and steps
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    recipe.ingredients = (recipe.ingredients || []).map(function(i) { return Object.assign({ id: uid() }, i); });
    recipe.steps = (recipe.steps || []).map(function(s) { return Object.assign({ id: uid() }, s); });

    return res.status(200).json({ recipe });

  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
