export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const API_KEY = "bAYjAS2AdcJBpa7dOvxdQ3PYIC0EHsDOT9SD8Vhh";

  try {
    const { ingredients, servings } = req.body;
    if (!ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: "Keine Zutaten angegeben." });
    }

    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const details = [];

    for (const ing of ingredients) {
      if (!ing.name) continue;

      // Parse amount in grams if possible
      const grams = parseGrams(ing.amount, ing.unit);

      // Search for the ingredient
      const searchRes = await fetch(
        "https://api.nal.usda.gov/fdc/v1/foods/search?query=" +
        encodeURIComponent(ing.name) +
        "&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=" + API_KEY
      );
      const searchData = await searchRes.json();

      if (!searchData.foods || searchData.foods.length === 0) continue;

      const food = searchData.foods[0];
      const nutrients = food.foodNutrients || [];

      const get = (name) => {
        const n = nutrients.find(function(x) { return x.nutrientName && x.nutrientName.toLowerCase().includes(name.toLowerCase()); });
        return n ? (n.value || 0) : 0;
      };

      // Values are per 100g
      const factor = grams / 100;
      const itemKcal    = get("Energy") * factor;
      const itemProtein = get("Protein") * factor;
      const itemCarbs   = (get("Carbohydrate") ) * factor;
      const itemFat     = get("Total lipid") * factor;

      totals.kcal    += itemKcal;
      totals.protein += itemProtein;
      totals.carbs   += itemCarbs;
      totals.fat     += itemFat;

      details.push({
        name: ing.name,
        grams: Math.round(grams),
        kcal: Math.round(itemKcal),
      });
    }

    const srv = parseInt(servings) || 1;

    return res.status(200).json({
      total: {
        kcal:    Math.round(totals.kcal),
        protein: Math.round(totals.protein * 10) / 10,
        carbs:   Math.round(totals.carbs * 10) / 10,
        fat:     Math.round(totals.fat * 10) / 10,
      },
      perServing: {
        kcal:    Math.round(totals.kcal / srv),
        protein: Math.round((totals.protein / srv) * 10) / 10,
        carbs:   Math.round((totals.carbs / srv) * 10) / 10,
        fat:     Math.round((totals.fat / srv) * 10) / 10,
      },
      servings: srv,
      details,
    });

  } catch (e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
}

function parseGrams(amount, unit) {
  const num = parseFloat(amount) || 1;
  const u = (unit || "").toLowerCase().trim();

  // Weight
  if (u === "g" || u === "gr" || u === "gramm") return num;
  if (u === "kg" || u === "kilogramm") return num * 1000;
  if (u === "mg") return num / 1000;

  // Volume (approximate for water-like liquids)
  if (u === "ml" || u === "milliliter") return num;
  if (u === "l" || u === "liter") return num * 1000;
  if (u === "el" || u === "esslöffel" || u === "essloffel") return num * 15;
  if (u === "tl" || u === "teelöffel" || u === "teeloffel") return num * 5;
  if (u === "tasse" || u === "cup") return num * 240;

  // Pieces – rough average weights
  if (u === "stk" || u === "stück" || u === "stuck" || u === "stk." || u === "") return num * 80;
  if (u === "prise" || u === "msp") return num * 1;

  // Default: treat as grams
  return num * 80;
}
