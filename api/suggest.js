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
    const { planned, available, day, meal } = req.body;
    if (!available || !available.length) return res.status(200).json({ suggestions: [] });

    const plannedText = (planned||[]).map(p => p.day + " " + p.meal + ": " + p.name + (p.tags&&p.tags.length?" ("+p.tags.join(", ")+")":"")).join("\n") || "Noch nichts geplant";
    const availableText = available.map(r => r.id + "|" + r.name + (r.tags&&r.tags.length?" ("+r.tags.join(", ")+")":"")).join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: "Ich plane eine Woche Essen. Bisher eingeplant:\n" + plannedText
            + "\n\nIch suche jetzt ein Rezept für: " + day + " " + meal
            + "\n\nVerfügbare Rezepte (ID|Name|Tags):\n" + availableText
            + "\n\nWähle die 3 besten für Abwechslung (nicht wiederholen was schon da ist, Proteinquellen wechseln, Küchen variieren). Antworte NUR mit JSON:\n[{\"id\":\"...\",\"reason\":\"Kurze Begründung auf Deutsch (max 8 Worte)\"}]"
        }]
      })
    });

    const data = await response.json();
    const raw = data.content[0].text.trim().replace(/^```json?\s*/i,"").replace(/```\s*$/i,"").trim();

    let suggestions;
    try { suggestions = JSON.parse(raw); }
    catch(e) {
      const m = raw.match(/\[[\s\S]*\]/);
      suggestions = m ? JSON.parse(m[0]) : [];
    }

    return res.status(200).json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch(e) {
    return res.status(200).json({ suggestions: [] }); // Fail silently
  }
};
