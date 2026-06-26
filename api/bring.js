export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  try {
    const { email, password, items } = req.body;
    if (!email || !password || !items) {
      return res.status(400).json({ error: "email, password und items erforderlich" });
    }

    // Login
    const loginRes = await fetch("https://api.getbring.com/rest/v2/bringauth", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-BRING-CLIENT": "webApp",
        "X-BRING-COUNTRY": "DE",
      },
      body: new URLSearchParams({ email, password }),
    });

    const loginText = await loginRes.text();
    let loginData;
    try { loginData = JSON.parse(loginText); }
    catch (e) { return res.status(401).json({ error: "Login-Antwort ungueltig: " + loginText.slice(0, 300) }); }

    if (!loginRes.ok || !loginData.access_token) {
      return res.status(401).json({ error: "Login fehlgeschlagen: " + (loginData.message || loginData.error || JSON.stringify(loginData)) });
    }

    const token = loginData.access_token;
    const uuid = loginData.uuid;

    // Listen laden – andere URL als vorher
    const listsRes = await fetch("https://api.getbring.com/rest/v2/bringusers/" + uuid + "/lists", {
      headers: {
        "Authorization": "Bearer " + token,
        "X-BRING-CLIENT": "webApp",
        "X-BRING-CLIENT-SOURCE": "webApp",
        "X-BRING-COUNTRY": "DE",
        "X-BRING-API-KEY": "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp",
      },
    });

    const listsText = await listsRes.text();
    let listsData;
    try { listsData = JSON.parse(listsText); }
    catch (e) { return res.status(500).json({ error: "Listen-Antwort ungueltig: " + listsText.slice(0, 300) }); }

    if (!listsData.lists || listsData.lists.length === 0) {
      return res.status(500).json({ error: "Keine Liste gefunden. Rohdaten: " + JSON.stringify(listsData).slice(0, 300) });
    }

    const listUuid = listsData.lists[0].listUuid;

    // Zutaten hinzufügen
    let count = 0;
    for (const item of items) {
      if (!item.name) continue;
      await fetch("https://api.getbring.com/rest/v2/bringlists/" + listUuid, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/x-www-form-urlencoded",
          "X-BRING-CLIENT": "webApp",
          "X-BRING-API-KEY": "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp",
        },
        body: new URLSearchParams({
          purchase: item.name,
          recently: "",
          specification: item.amount || "",
        }),
      });
      count++;
    }

    return res.status(200).json({ success: true, count });

  } catch (e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
}
