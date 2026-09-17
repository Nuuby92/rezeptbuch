// ── YAZIO-Übertragung ───────────────────────────────────────────────────────
// Proxy zur inoffiziellen YAZIO-Schnittstelle. Notwendig, weil YAZIO keine
// CORS-Header sendet und ein direkter Aufruf aus dem Browser blockiert würde.
//
// Diese Route speichert NICHTS. Zugangsdaten und Tokens laufen nur durch und
// werden bewusst nirgends protokolliert -- kein console.log auf req.body.

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

// Einheiten, die sich verlustfrei in YAZIOs Basiseinheiten überführen lassen.
const UNIT_FACTOR = { g: ["g", 1], kg: ["g", 1000], ml: ["ml", 1], l: ["ml", 1000] };

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

// Baut aus einem Rezeptbuch-Rezept den YAZIO-Entwurf.
// Wichtig: YAZIO versteht die Nährwerte PRO PORTION, nicht als Gesamtwert.
function toDraft(recipeId, recipe) {
  const servings = (recipe.ingredients || [])
    .filter((i) => i && i.name)
    .map((i) => {
      const unit = UNIT_FACTOR[(i.unit || "").toLowerCase()];
      const amount = toNumber(i.amount);
      // Nur eindeutig umrechenbare Einheiten werden als Menge übergeben.
      // Alles andere (EL, Stk, Zehe …) bleibt im Namen lesbar stehen, denn
      // die Nährwerte kommen ohnehin aus dem Feld unten und nicht aus dieser Liste.
      if (unit && amount > 0) {
        return { name: String(i.name), amount: amount * unit[1], base_unit: unit[0] };
      }
      const label = [i.amount, i.unit, i.name].filter(Boolean).join(" ");
      return { name: label || String(i.name), amount: 1, base_unit: "g" };
    });

  const per = recipe.perServing || {};
  return {
    id: recipeId,
    locale: "de",
    name: String(recipe.name || "Rezept"),
    // Muss ganzzahlig sein: ein 2.0 quittiert YAZIO mit einem nackten 500.
    portion_count: Math.max(1, Math.round(toNumber(recipe.servings) || 1)),
    nutrients: {
      "energy.energy": toNumber(per.kcal),
      "nutrient.protein": toNumber(per.protein),
      "nutrient.fat": toNumber(per.fat),
      "nutrient.carb": toNumber(per.carbs),
    },
    servings,
    instructions: (recipe.steps || []).map((s) => String(s)).filter(Boolean),
  };
}

function describeFailure(status, text) {
  if (status === 403 && text && text.indexOf("version_blocked") !== -1) {
    return "YAZIO akzeptiert die hinterlegte App-Version nicht mehr. "
      + "Die Übertragung muss angepasst werden (USER_AGENT in api/yazio.js).";
  }
  if (status === 401) return "token_expired";
  return null;
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
            recipe, yazioRecipeId, daytime, date, portionCount } = req.body;

    if (!recipe || !recipe.name) return res.status(400).json({ error: "recipe erforderlich" });
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

    // YAZIO braucht mindestens zwei Zutaten, sonst wird das Rezept abgelehnt.
    const named = (recipe.ingredients || []).filter((i) => i && i.name);
    if (named.length < 2) {
      return res.status(400).json({ error: "YAZIO verlangt mindestens zwei Zutaten im Rezept." });
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

    // ── Rezept anlegen, falls es dort noch keines gibt ───────────────────
    // Anlegen ist POST auf die Sammlung; PUT /{id} wäre Ändern und
    // scheitert bei unbekannter id mit einem nackten 500.
    let recipeId = yazioRecipeId || null;
    let createdRecipe = false;

    if (!recipeId) {
      recipeId = (globalThis.crypto || require("crypto")).randomUUID();
      const create = await authed("/user/recipes", "POST", toDraft(recipeId, recipe));

      if (!create.ok) {
        const text = await create.text();
        const known = describeFailure(create.status, text);
        if (known === "token_expired") return res.status(401).json({ error: "token_expired" });
        return res.status(502).json({
          error: known || ("YAZIO hat das Rezept abgelehnt (HTTP " + create.status + ")."),
        });
      }
      createdRecipe = true;
    }

    // ── Portion ins Tagebuch eintragen ───────────────────────────────────
    // date ist dort ein voller Zeitstempel, nicht nur ein Datum.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = date + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());

    const entry = {
      products: [],
      simple_products: [],
      recipe_portions: [{
        id: (globalThis.crypto || require("crypto")).randomUUID(),
        recipe_id: recipeId,
        portion_count: portions,
        daytime,
        date: stamp,
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
      yazioRecipeId: recipeId,
      createdRecipe,
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
