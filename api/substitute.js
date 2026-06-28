module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API-Key nicht konfiguriert." });

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
