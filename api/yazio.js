// ── YAZIO-Übertragung ───────────────────────────────────────────────────────
// Proxy zur inoffiziellen YAZIO-Schnittstelle. Notwendig, weil YAZIO keine
// CORS-Header sendet und ein direkter Aufruf aus dem Browser blockiert würde.
//
// Diese Route speichert NICHTS. Zugangsdaten und Tokens laufen nur durch und
// werden bewusst nirgends protokolliert -- kein console.log auf req.body.
//
// Eingetragen wird als "simple_product": ein freier Tagebuch-Eintrag aus Name
// und Nährwerten. Der Umweg über ein YAZIO-Rezept wurde verworfen -- ein
// Rezept, dessen Zutaten keine product_id tragen, taucht in der App zwar in
// der Tagessumme auf, lässt sich dort aber weder öffnen noch löschen. Zutaten
// nachträglich mit YAZIO-Produkten zu verknüpfen wäre unzuverlässig und würde
// die im Rezeptbuch berechneten Nährwerte durch fremde ersetzen.

const { checkRateLimit } = require('./rateLimit');
const { verifyAppCheckToken } = require('./appCheck');

const YAZIO = "https://yzapi.yazio.com/v22";

// OAuth-Kennungen der YAZIO-App. Identifizieren die App, nicht den Nutzer;
// jede Installation sendet dieselben Werte, sie sind daher nicht geheim.
const CLIENT_ID = "3_5rbw4kehpugw8ogsc8ck8oo4ogswgckcskc04gcg8kk8k48ssw";
const CLIENT_SECRET = "25gdtt1hvdi8gwowoww4oo88sgsw0oo04o0og0kkgwwks8k0k";

// YAZIO prüft die Client-Version im User-Agent. Alles Unbekannte bekommt
// 403 {"error":"version_blocked"} -- und zwar auf JEDEM Endpunkt außer der
// Anmeldung. Muss nachgezogen werden, sobald YAZIO diese Version ausmustert.
const USER_AGENT = "YAZIO/26.30.1 (com.yazio.ios.YAZIO; build:2607271240; iOS 27.0.0) Ktor";

const DAYTIMES = ["breakfast", "lunch", "dinner", "snack"];
const MAX_PORTIONS = 20;

function yazioFetch(path, token, method, body) {
  const headers = {
    "Accept": "application/json",
    "User-Agent": USER_AGENT,
    "Accept-Language": "de-DE",
  };
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(YAZIO + path, {
    method: method || "GET",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function authenticate(params) {
  const res = await yazioFetch("/oauth/token", null, "POST", Object.assign({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }, params));
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && data.access_token ? data : null;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value == null ? "" : value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round1(n) { return Math.round(n * 10) / 10; }

function describeFailure(status, text) {
  if (status === 403 && text && text.indexOf("version_blocked") !== -1) {
    return "YAZIO akzeptiert die hinterlegte App-Version nicht mehr. "
      + "Die Übertragung muss angepasst werden (USER_AGENT in api/yazio.js).";
  }
  if (status === 401) return "token_expired";
  return null;
}

function uuid() {
  return (globalThis.crypto || require("crypto")).randomUUID();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const uid = req.body?.uid;
  const rl = await checkRateLimit(uid);
  if (!rl.allowed) return res.status(429).json({ error: rl.error });

  // App Check: verhindert, dass diese Route als offener Login-Proxy zu YAZIO dient
  const appCheckToken = req.headers["x-firebase-appcheck"];
  const isValidAppCheck = await verifyAppCheckToken(appCheckToken);
  if (!isValidAppCheck) return res.status(403).json({ error: "Zugriff verweigert (App Check fehlgeschlagen)." });

  try {
    const { email, password, accessToken, refreshToken,
            name, perServing, daytime, date, portionCount } = req.body;

    if (!name || !String(name).trim()) return res.status(400).json({ error: "name erforderlich" });
    if (!perServing) return res.status(400).json({ error: "perServing erforderlich" });
    if (DAYTIMES.indexOf(daytime) === -1) {
      return res.status(400).json({ error: "daytime muss breakfast, lunch, dinner oder snack sein" });
    }
    const portions = toNumber(portionCount);
    if (!(portions > 0) || portions > MAX_PORTIONS) {
      return res.status(400).json({ error: "portionCount muss zwischen 1 und " + MAX_PORTIONS + " liegen" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ error: "date muss im Format JJJJ-MM-TT vorliegen" });
    }

    // ── Sitzung herstellen ───────────────────────────────────────────────
    let token = accessToken || null;
    let issued = null;   // nur gesetzt, wenn neue Tokens entstanden sind

    if (!token && refreshToken) {
      issued = await authenticate({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (issued) token = issued.access_token;
    }
    if (!token) {
      if (!email || !password) return res.status(401).json({ error: "token_expired" });
      issued = await authenticate({ grant_type: "password", username: email, password });
      if (!issued) return res.status(401).json({ error: "Anmeldung bei YAZIO fehlgeschlagen. E-Mail oder Passwort falsch?" });
      token = issued.access_token;
    }

    // Jede Anfrage einmal mit erneuertem Token wiederholen, wenn das
    // mitgeschickte abgelaufen ist. Sonst müsste sich die Person alle
    // 48 Stunden neu anmelden, obwohl ein Refresh-Token vorliegt.
    let renewalTried = false;
    async function authed(path, method, body) {
      let r = await yazioFetch(path, token, method, body);
      if (r.status === 401 && refreshToken && !renewalTried) {
        renewalTried = true;
        const renewed = await authenticate({ grant_type: "refresh_token", refresh_token: refreshToken });
        if (renewed) {
          issued = renewed;
          token = renewed.access_token;
          r = await yazioFetch(path, token, method, body);
        }
      }
      return r;
    }

    // ── Eintrag zusammenbauen ────────────────────────────────────────────
    // Die Nährwerte eines einfachen Eintrags sind absolut, nicht pro Portion.
    // Also mit der gewählten Portionszahl multiplizieren.
    const label = portions === 1
      ? String(name).trim()
      : String(name).trim() + " (" + (Number.isInteger(portions) ? portions : round1(portions)) + " Portionen)";

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = date + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());

    const entry = {
      products: [],
      recipe_portions: [],
      simple_products: [{
        id: uuid(),
        date: stamp,
        daytime,
        name: label,
        nutrients: {
          "energy.energy": Math.round(toNumber(perServing.kcal) * portions),
          "nutrient.protein": round1(toNumber(perServing.protein) * portions),
          "nutrient.fat": round1(toNumber(perServing.fat) * portions),
          "nutrient.carb": round1(toNumber(perServing.carbs) * portions),
        },
        is_ai_generated: false,
      }],
    };

    const log = await authed("/user/consumed-items", "POST", entry);
    if (!log.ok) {
      const text = await log.text();
      const known = describeFailure(log.status, text);
      if (known === "token_expired") return res.status(401).json({ error: "token_expired" });
      return res.status(502).json({
        error: known || ("YAZIO hat den Eintrag abgelehnt (HTTP " + log.status + ")."),
      });
    }

    return res.status(200).json({
      success: true,
      entryId: entry.simple_products[0].id,
      name: label,
      // Nur vorhanden, wenn neue Tokens entstanden sind -- das Frontend
      // legt sie dann im localStorage des jeweiligen Geräts ab.
      auth: issued ? {
        access_token: issued.access_token,
        refresh_token: issued.refresh_token,
        expires_in: issued.expires_in,
      } : null,
    });

  } catch (e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
};
