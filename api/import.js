module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

  try {
    let { text, imageBase64, imageType, url } = req.body;

    // ── URL import ──────────────────────────────────────────────────────────
    if (url) {
      url = url.trim();
      const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

      if (isYoutube) {
        // Extract video ID
        let videoId = null;
        const m1 = url.match(/[?&]v=([^&]+)/);
        const m2 = url.match(/youtu\.be\/([^?]+)/);
        if (m1) videoId = m1[1];
        else if (m2) videoId = m2[1];
        if (!videoId) return res.status(400).json({ error: "YouTube Video-ID konnte nicht erkannt werden." });

        // Get title via noembed
        let title = "YouTube Rezept";
        try {
          const oe = await fetch("https://noembed.com/embed?url=https://www.youtube.com/watch?v=" + videoId);
          const oed = await oe.json();
          if (oed.title) title = oed.title;
        } catch(e) {}

        // Get description from YouTube page
        let description = "";
        try {
          const pageRes = await fetch("https://www.youtube.com/watch?v=" + videoId, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" }
          });
          const html = await pageRes.text();
          const dm = html.match(/"description":\{"simpleText":"((?:[^"\\\\]|\\\\.)*)"/);
          if (dm) description = dm[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
          if (!description) {
            const mm = html.match(/<meta name="description" content="([^"]+)"/);
            if (mm) description = mm[1];
          }
        } catch(e) {}

        text = 'YouTube Video: ' + title + '\n\nBeschreibung:\n' + (description || 'Keine Beschreibung verfügbar.\nBitte extrahiere ein Rezept aus dem Videotitel falls möglich.');

      } else {
        // Regular recipe website
        try {
          const pageRes = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" }
          });
          if (!pageRes.ok) return res.status(400).json({ error: "Seite konnte nicht geladen werden (Status " + pageRes.status + ")." });
          const html = await pageRes.text();

          // Extract readable text
          const cleaned = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000);

          text = "Rezept von: " + url + "\n\n" + cleaned;
        } catch(e) {
          return res.status(400).json({ error: "Seite konnte nicht geladen werden: " + e.message });
        }
      }
    }

    if (!text && !imageBase64) {
      return res.status(400).json({ error: "text, url oder imageBase64 erforderlich" });
    }

    const systemPrompt = `Du bist ein Rezept-Extraktor. Extrahiere aus dem gegebenen Text oder Bild ein Rezept und gib es als JSON zurück.

Regeln zur Übersetzung:
- Übersetze Rezeptname, Beschreibung und Zubereitungsschritte ins Deutsche
- Zutatenname auf Deutsch, ABER: Behalte internationale/asiatische/exotische Produktnamen im Original wenn es keinen gebräuchlichen deutschen Begriff gibt (z.B. "Dumpling Wrapper", "Gyoza", "Miso", "Tahini", "Sriracha", "Panko", "Tofu", "Edamame", "Nori", "Kimchi", "Mirin", "Dashi", "Chili Crisp")
- Übersetze nur wenn ein echter, gebräuchlicher deutscher Begriff existiert (z.B. "chicken" → "Hähnchen", "garlic" → "Knoblauch")
- "green onions" oder "scallions" immer als "Frühlingszwiebeln" übersetzen, NICHT als "grüne Zwiebeln"
- Diese Begriffe NIEMALS übersetzen: Chili Crisp, Chili Oil, Sriracha, Miso, Tahini, Tofu, Tempeh, Edamame, Kimchi, Mirin, Dashi, Panko, Nori, Gyoza, Dumpling, Wonton

Regeln für Einheiten:
- Einheiten im Feld "unit" müssen exakt eines dieser Werte sein: g, kg, ml, l, EL, TL, Tasse, Stk, Scheibe, Prise, Zehe (oder leer lassen)
- Feste Lebensmittel (Gemüse, Fleisch, Käse, Nüsse usw.) immer in g, NIEMALS in ml
- Frühlingszwiebeln, Zwiebeln, Schalotten und jedes andere Gemüse immer in g
- 1 cup gehackte Frühlingszwiebeln ≈ 100g, 1 cup gehackte Zwiebeln ≈ 160g
- Flüssigkeiten in ml oder EL/TL
- Stückweise Zutaten → unit="Stk" oder unit="Zehe"
- Zutaten ohne Mengenangabe ("zum Servieren", "nach Geschmack"): amount="" und unit=""
- Adjektive wie "fein gehackt", "dünn geschnitten" gehören in den Zubereitungsschritt, nicht in den Zutatennamen

Maßeinheiten umrechnen:
- cups Flüssigkeit → ml (1 cup = 240ml)
- cups Feststoffe → g (Mehl ≈ 120g, Zucker ≈ 200g, Reis ≈ 185g)
- oz → g (1 oz = 28g), lbs → g (1 lb = 454g)
- fl oz → ml, tsp → TL, tbsp → EL
- °F → °C nur in Zubereitungsschritten

Antworte NUR mit validem JSON, ohne Markdown-Backticks:
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
      userContent.push({ type: "image", source: { type: "base64", media_type: imageType || "image/jpeg", data: imageBase64 } });
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
    const raw = data.content[0].text.trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();

    let recipe;
    try { recipe = JSON.parse(raw); }
    catch(e) { return res.status(500).json({ error: "Rezept konnte nicht geparst werden." }); }

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    recipe.ingredients = (recipe.ingredients || []).map(i => Object.assign({ id: uid() }, i));
    recipe.steps = (recipe.steps || []).map(s => Object.assign({ id: uid() }, s));

    return res.status(200).json({ recipe });

  } catch(e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
