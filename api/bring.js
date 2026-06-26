module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  try {
    const { email, password, token, uuid, items } = req.body;

    if (!items) return res.status(400).json({ error: "items erforderlich" });

    let accessToken = token;
    let userUuid = uuid;

    // ── Wenn Token vorhanden: direkt versuchen ────────────────────────────
    if (accessToken && userUuid) {
      const result = await exportToList(accessToken, userUuid, items);
      if (result.ok) {
        return res.status(200).json({ success: true, count: result.count, tokenValid: true });
      }
      // Token abgelaufen oder ungültig → neu einloggen
      if (!email || !password) {
        return res.status(401).json({ error: "token_expired" });
      }
    }

    // ── Login mit E-Mail + Passwort ───────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ error: "email und password erforderlich" });
    }

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
    catch (e) { return res.status(401).json({ error: "Login-Antwort ungueltig: " + loginText.slice(0, 200) }); }

    if (!loginRes.ok || !loginData.access_token) {
      return res.status(401).json({ error: "Login fehlgeschlagen: " + (loginData.message || loginData.error || "Falsches Passwort?") });
    }

    accessToken = loginData.access_token;
    userUuid = loginData.uuid;

    // ── Zutaten exportieren ───────────────────────────────────────────────
    const result = await exportToList(accessToken, userUuid, items);
    if (!result.ok) {
      return res.status(500).json({ error: result.error });
    }

    // Token und UUID zurückschicken damit der Browser sie speichern kann
    return res.status(200).json({
      success: true,
      count: result.count,
      token: accessToken,
      uuid: userUuid,
      tokenValid: false, // war neu eingeloggt
    });

  } catch (e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};

async function exportToList(token, uuid, items) {
  try {
    // Listen laden
    const listsRes = await fetch("https://api.getbring.com/rest/v2/bringusers/" + uuid + "/lists", {
      headers: {
        "Authorization": "Bearer " + token,
        "X-BRING-CLIENT": "webApp",
        "X-BRING-CLIENT-SOURCE": "webApp",
        "X-BRING-COUNTRY": "DE",
        "X-BRING-API-KEY": "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp",
      },
    });

    if (!listsRes.ok) return { ok: false, error: "token_expired" };

    const listsText = await listsRes.text();
    let listsData;
    try { listsData = JSON.parse(listsText); }
    catch (e) { return { ok: false, error: "Listen-Antwort ungueltig" }; }

    if (!listsData.lists || listsData.lists.length === 0) {
      return { ok: false, error: "Keine Bring-Liste gefunden." };
    }

    const listUuid = listsData.lists[0].listUuid;
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

    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
