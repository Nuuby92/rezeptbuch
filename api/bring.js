export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { email, password, items } = req.body;
  if (!email || !password || !items) {
    return res.status(400).json({ error: "email, password und items erforderlich" });
  }

  try {
    // Login
    const loginRes = await fetch("https://api.getbring.com/rest/v2/bringauth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password }),
    });
    if (!loginRes.ok) return res.status(401).json({ error: "Login fehlgeschlagen. E-Mail oder Passwort falsch." });
    const loginData = await loginRes.json();
    const token = loginData.access_token;
    const uuid = loginData.uuid;

    // Listen laden
    const listsRes = await fetch("https://api.getbring.com/rest/v2/bringlists/" + uuid, {
      headers: { Authorization: "Bearer " + token },
    });
    const listsData = await listsRes.json();
    const listUuid = listsData.lists[0].listUuid;

    // Zutaten hinzufügen
    for (const item of items) {
      await fetch("https://api.getbring.com/rest/v2/bringlists/" + listUuid, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ purchase: item.name, recently: "", specification: item.amount || "" }),
      });
    }

    return res.status(200).json({ success: true, count: items.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
