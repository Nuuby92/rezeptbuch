module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const API_KEY = "bAYjAS2AdcJBpa7dOvxdQ3PYIC0EHsDOT9SD8Vhh";

  // ── Wörterbuch Deutsch → Englisch (USDA-optimiert) ────────────────────────
  const DICT = {
    "nudeln": "pasta dry", "spaghetti": "spaghetti dry", "penne": "pasta dry",
    "fusilli": "pasta dry", "tagliatelle": "pasta dry", "lasagneplatten": "lasagna dry",
    "lasagne": "lasagna dry", "gnocchi": "gnocchi potato", "spätzle": "egg noodles dry",
    "spatzle": "egg noodles dry", "reis": "rice white raw", "basmatireis": "rice white raw",
    "vollkornreis": "rice brown raw", "couscous": "couscous dry", "quinoa": "quinoa raw",
    "mehl": "wheat flour all purpose", "weizenmehl": "wheat flour all purpose",
    "vollkornmehl": "whole wheat flour", "haferflocken": "oats rolled dry",
    "paniermehl": "breadcrumbs dry", "semmelbrosel": "breadcrumbs dry",
    "brot": "bread white", "toast": "bread white", "cornflakes": "cornflakes cereal",
    "haehnchen": "chicken breast raw", "hahnchen": "chicken breast raw",
    "hühnchen": "chicken breast raw", "huhnchen": "chicken breast raw",
    "hähnchenbrustfilet": "chicken breast raw", "hahnchenbrust": "chicken breast raw",
    "hähnchenbrust": "chicken breast raw", "hühnerbrustfilet": "chicken breast raw",
    "rindfleisch": "beef ground raw", "hackfleisch": "beef ground raw",
    "rinderhack": "beef ground raw", "schweinehack": "pork ground raw",
    "schweinefleisch": "pork raw", "schweinefilet": "pork tenderloin raw",
    "schweinebauch": "pork belly raw", "speck": "bacon raw",
    "schinken": "ham cooked", "kochschinken": "ham cooked",
    "putenbrust": "turkey breast raw", "truthahn": "turkey raw",
    "lamm": "lamb raw", "lammfleisch": "lamb raw",
    "kalbfleisch": "veal raw", "entenbrust": "duck breast raw",
    "salami": "salami", "mortadella": "mortadella",
    "leberwurst": "liverwurst", "wurst": "sausage pork",
    "bratwurst": "bratwurst", "chorizo": "chorizo",
    "lachs": "salmon raw", "lachsfilet": "salmon raw",
    "thunfisch": "tuna canned in water", "thunfischdose": "tuna canned in water",
    "kabeljau": "cod raw", "forelle": "trout raw",
    "garnelen": "shrimp raw", "krabben": "shrimp raw",
    "tilapia": "tilapia raw", "hering": "herring raw",
    "sardinen": "sardines canned", "makrele": "mackerel raw",
    "ei": "egg whole raw", "eier": "egg whole raw",
    "eigelb": "egg yolk raw", "eiweiss": "egg white raw",
    "milch": "milk whole", "vollmilch": "milk whole",
    "magermilch": "milk skim", "butter": "butter unsalted",
    "margarine": "margarine", "sahne": "heavy cream", "schlagsahne": "heavy cream",
    "saure sahne": "sour cream", "schmand": "sour cream",
    "creme fraiche": "creme fraiche", "crème fraîche": "creme fraiche",
    "joghurt": "yogurt plain whole milk", "naturjoghurt": "yogurt plain whole milk",
    "quark": "quark", "magerquark": "cottage cheese lowfat",
    "frischkase": "cream cheese", "frischkäse": "cream cheese",
    "philadelphia": "cream cheese",
    "käse": "cheese cheddar", "kase": "cheese cheddar",
    "gouda": "gouda cheese", "emmentaler": "swiss cheese",
    "parmesan": "parmesan cheese", "mozzarella": "mozzarella cheese",
    "feta": "feta cheese", "ricotta": "ricotta cheese",
    "mascarpone": "mascarpone cheese", "brie": "brie cheese",
    "kondensmilch": "condensed milk sweetened",
    "tomate": "tomato raw", "tomaten": "tomato raw",
    "kirschtomaten": "cherry tomatoes", "cherry tomaten": "cherry tomatoes",
    "cherrytomaten": "cherry tomatoes", "dosentomaten": "tomatoes canned",
    "gehackte tomaten": "tomatoes canned", "passierte tomaten": "tomato puree",
    "tomatenmark": "tomato paste",
    "zwiebel": "onion raw", "zwiebeln": "onion raw",
    "rote zwiebel": "onion red raw", "schalotte": "shallot raw",
    "knoblauch": "garlic raw", "knoblauchzehe": "garlic raw", "knoblauchzehen": "garlic raw",
    "kartoffel": "potato raw", "kartoffeln": "potato raw",
    "süsskartoffel": "sweet potato raw", "susskartoffel": "sweet potato raw",
    "paprika": "bell pepper raw", "paprikaschote": "bell pepper raw",
    "rote paprika": "red bell pepper raw", "gelbe paprika": "yellow bell pepper raw",
    "karotte": "carrot raw", "karotten": "carrot raw",
    "möhre": "carrot raw", "mohre": "carrot raw",
    "zucchini": "zucchini raw", "aubergine": "eggplant raw",
    "brokkoli": "broccoli raw", "blumenkohl": "cauliflower raw",
    "rotkohl": "red cabbage raw", "weißkohl": "cabbage raw",
    "chinakohl": "napa cabbage raw", "spinat": "spinach raw",
    "salat": "lettuce raw", "eisbergsalat": "iceberg lettuce raw",
    "feldsalat": "lettuce raw", "rucola": "arugula raw",
    "gurke": "cucumber raw", "salatgurke": "cucumber raw",
    "lauch": "leek raw", "porree": "leek raw",
    "sellerie": "celery raw", "stangensellerie": "celery raw",
    "erbsen": "peas green raw", "mais": "corn sweet raw",
    "bohnen": "beans green raw", "grüne bohnen": "beans green raw",
    "kidneybohnen": "kidney beans canned", "kichererbsen": "chickpeas canned",
    "linsen": "lentils raw", "rote linsen": "lentils red raw",
    "champignons": "mushrooms raw", "pilze": "mushrooms raw",
    "spargel": "asparagus raw", "rote bete": "beets raw",
    "fenchel": "fennel raw", "kohlrabi": "kohlrabi raw",
    "frühlingszwiebeln": "green onions raw",
    "apfel": "apple raw", "äpfel": "apple raw",
    "birne": "pear raw", "banane": "banana raw", "bananen": "banana raw",
    "orange": "orange raw", "zitrone": "lemon raw",
    "limette": "lime raw", "erdbeeren": "strawberries raw",
    "himbeeren": "raspberries raw", "blaubeeren": "blueberries raw",
    "kirschen": "cherries raw", "weintrauben": "grapes raw",
    "mango": "mango raw", "ananas": "pineapple raw",
    "avocado": "avocado raw",
    "mandeln": "almonds raw", "walnüsse": "walnuts raw", "walnusse": "walnuts raw",
    "haselnüsse": "hazelnuts raw", "cashews": "cashews raw",
    "erdnüsse": "peanuts raw", "erdnusse": "peanuts raw",
    "erdnussbutter": "peanut butter", "pinienkerne": "pine nuts raw",
    "sonnenblumenkerne": "sunflower seeds raw", "sesam": "sesame seeds raw",
    "chiasamen": "chia seeds", "leinsamen": "flaxseeds raw",
    "tahin": "tahini", "tahini": "tahini",
    "öl": "vegetable oil", "ol": "vegetable oil",
    "olivenöl": "olive oil", "olivenol": "olive oil",
    "sonnenblumenöl": "sunflower oil", "sonnenblumenol": "sunflower oil",
    "rapsöl": "canola oil", "rapsol": "canola oil",
    "kokosöl": "coconut oil", "pflanzenöl": "vegetable oil",
    "sojasosse": "soy sauce", "sojasoße": "soy sauce",
    "ketchup": "ketchup", "senf": "mustard yellow",
    "dijonsenf": "mustard dijon", "mayonnaise": "mayonnaise",
    "essig": "vinegar", "weißweinessig": "vinegar white wine",
    "balsamico": "vinegar balsamic", "zitronensaft": "lemon juice",
    "tomatensauce": "tomato sauce", "pesto": "pesto", "hummus": "hummus",
    "salz": "salt", "pfeffer": "black pepper",
    "paprikapulver": "paprika powder", "chilipulver": "chili powder",
    "chili": "chili pepper raw", "chiliflocken": "red pepper flakes",
    "kurkuma": "turmeric", "curry": "curry powder",
    "kreuzkümmel": "cumin ground", "koriander": "coriander ground",
    "zimt": "cinnamon", "muskat": "nutmeg",
    "oregano": "oregano dried", "basilikum": "basil fresh",
    "ital. krauter": "mixed herbs dried", "ital krauter": "mixed herbs dried",
    "italienische krauter": "mixed herbs dried", "krauter": "mixed herbs dried",
    "gewurzmischung": "mixed spices", "gewürzmischung": "mixed spices",
    "petersilie": "parsley fresh", "schnittlauch": "chives fresh",
    "thymian": "thyme fresh", "rosmarin": "rosemary fresh",
    "ingwer": "ginger raw", "vanille": "vanilla extract",
    "zucker": "sugar white", "puderzucker": "powdered sugar",
    "brauner zucker": "brown sugar", "honig": "honey",
    "ahornsirup": "maple syrup",
    "backpulver": "baking powder", "natron": "baking soda",
    "hefe": "yeast active dry", "speisestärke": "cornstarch", "speisestarke": "cornstarch",
    "kakaopulver": "cocoa powder unsweetened",
    "schokolade": "chocolate dark", "zartbitterschokolade": "chocolate dark 70 percent",
    "vollmilchschokolade": "chocolate milk",
    "gemüsebrühe": "vegetable broth", "gemusebruhe": "vegetable broth",
    "hühnerbrühe": "chicken broth", "huhnerbruhe": "chicken broth",
    "fleischbrühe": "beef broth", "rotwein": "red wine", "weißwein": "white wine",
    "kokosmilch": "coconut milk canned", "mandelmilch": "almond milk",
    "hafermilch": "oat milk", "sojamilch": "soy milk",
    "tofu": "tofu firm", "miso": "miso paste",
    "pak choi": "bok choy raw", "edamame": "edamame",
  };

  // ── Adjektive/Füllwörter die aus dem Zutatenname entfernt werden ──────────
  const STRIP_WORDS = [
    "ganze", "ganzer", "ganzes", "halbe", "halber", "halbes",
    "frische", "frischer", "frisches", "frisch",
    "gehackte", "gehackter", "gehacktes", "gehackt",
    "getrocknete", "getrockneter", "getrocknetes", "getrocknet",
    "geriebene", "geriebener", "geriebenes", "gerieben",
    "gekochte", "gekochter", "gekochtes", "gekocht",
    "geröstete", "gerösteter", "geröstetes",
    "kleine", "kleiner", "kleines", "klein",
    "große", "großer", "großes", "gross", "grosse",
    "mittlere", "mittlerer", "mittleres",
    "rote", "roter", "rotes", "roten",
    "gelbe", "gelber", "gelbes",
    "grüne", "grüner", "grünes",
    "schwarze", "schwarzer", "schwarzes",
    "weiße", "weißer", "weißes",
    "braune", "brauner", "braunes",
    "bio", "tiefgekühlte", "tiefgekühlt",
    "dose", "dosen", "frisch gepresster", "frisch gepresst",
  ];

  // ── Typische Stückgewichte in Gramm ──────────────────────────────────────
  const PIECE_WEIGHTS = {
    "knoblauchzehe": 5, "knoblauchzehen": 5, "knoblauch": 5,
    "zwiebel": 110, "zwiebeln": 110,
    "schalotte": 30, "schalotten": 30,
    "ei": 60, "eier": 60,
    "tomate": 120, "tomaten": 120,
    "cherrytomaten": 10, "kirschtomaten": 10, "cherry tomaten": 10,
    "karotte": 80, "karotten": 80, "möhre": 80, "mohre": 80,
    "kartoffel": 150, "kartoffeln": 150,
    "süsskartoffel": 200, "susskartoffel": 200,
    "paprika": 160, "paprikaschote": 160,
    "zucchini": 200,
    "aubergine": 300,
    "champignon": 15, "champignons": 15, "pilz": 15, "pilze": 15,
    "apfel": 180, "äpfel": 180, "birne": 170, "banane": 120,
    "orange": 180, "zitrone": 100, "limette": 70,
    "avocado": 200,
    "gurke": 300, "salatgurke": 300,
    "mango": 300,
    "peperoni": 20, "chilischote": 15,
    "lorbeerblatt": 1, "lorbeerblätter": 1,
    "scheibe toast": 30, "scheibe brot": 35,
  };

  function cleanIngredientName(name) {
    let lower = name.toLowerCase().trim();
    // Entferne Füllwörter
    for (const word of STRIP_WORDS) {
      lower = lower.replace(new RegExp("\\b" + word + "\\b", "g"), "").trim();
    }
    // Mehrfache Leerzeichen entfernen
    lower = lower.replace(/\s+/g, " ").trim();
    return lower;
  }

  function translateIngredient(name) {
    const cleaned = cleanIngredientName(name);
    // Exact match
    if (DICT[cleaned]) return DICT[cleaned];
    // Partial match – längsten Treffer nehmen
    let best = null; let bestLen = 0;
    for (const key of Object.keys(DICT)) {
      if (cleaned.includes(key) && key.length > bestLen) {
        best = DICT[key]; bestLen = key.length;
      }
    }
    if (best) return best;
    return name; // Fallback: Originalname (funktioniert für internationale Begriffe)
  }

  // ── Einheit → Gramm Umrechnung ────────────────────────────────────────────
  // Alle Dropdown-Einheiten aus der App sind hier berücksichtigt
  function parseGrams(amount, unit, ingredientName) {
    const num = parseFloat(amount) || 1;
    const u = (unit || "").toLowerCase().trim();
    const cleaned = cleanIngredientName(ingredientName || "");

    switch(u) {
      // Gewicht
      case "g":
      case "gr":
      case "gramm":
        return num;
      case "kg":
      case "kilogramm":
        return num * 1000;
      case "mg":
        return num / 1000;

      // Volumen – wird als ml behandelt (1ml ≈ 1g für wasserähnliche Flüssigkeiten)
      // Für Öl: 1ml ≈ 0.92g – nahe genug
      case "ml":
      case "milliliter":
        return num;
      case "l":
      case "liter":
        return num * 1000;

      // Küchenmaße – standardisiert auf Gramm
      case "el":
      case "esslöffel":
      case "essloffel":
        // Öle/Flüssigkeiten: ~14g, Pulver/Gewürze: ~8g, Schüttgut: ~15g
        if (cleaned.includes("öl") || cleaned.includes("ol") || cleaned.includes("essig") || cleaned.includes("sauce") || cleaned.includes("sosse")) return num * 14;
        if (cleaned.includes("salz") || cleaned.includes("zucker") || cleaned.includes("mehl") || cleaned.includes("pulver")) return num * 10;
        return num * 15;

      case "tl":
      case "teelöffel":
      case "teeloffel":
        if (cleaned.includes("öl") || cleaned.includes("ol") || cleaned.includes("essig")) return num * 5;
        if (cleaned.includes("salz") || cleaned.includes("zucker") || cleaned.includes("pulver") || cleaned.includes("gewürz")) return num * 4;
        return num * 5;

      case "tasse":
      case "cup":
        // Mehl: ~120g, Flüssigkeiten: ~240g, Haferflocken: ~90g
        if (cleaned.includes("mehl")) return num * 120;
        if (cleaned.includes("haferflocken") || cleaned.includes("oat")) return num * 90;
        if (cleaned.includes("zucker")) return num * 200;
        return num * 240;

      case "prise":
      case "msp":
      case "messerspitze":
        return num * 1;

      case "scheibe":
      case "scheiben":
        // Brot/Toast: ~30g, Käse: ~20g, Schinken: ~30g
        if (cleaned.includes("brot") || cleaned.includes("toast")) return num * 30;
        if (cleaned.includes("käse") || cleaned.includes("kase") || cleaned.includes("schinken")) return num * 20;
        return num * 25;

      case "zehe":
      case "zehen":
        return num * 5; // Knoblauchzehe

      case "stk":
      case "stück":
      case "stuck":
      case "stk.":
      case "stück.":
      case "st":
      case "":
        // Stückgewicht aus Tabelle holen
        for (const [key, weight] of Object.entries(PIECE_WEIGHTS)) {
          if (cleaned.includes(key)) return num * weight;
        }
        return num * 80; // Fallback

      default:
        // Unbekannte Einheit: Stückgewicht versuchen
        for (const [key, weight] of Object.entries(PIECE_WEIGHTS)) {
          if (cleaned.includes(key)) return num * weight;
        }
        return num * 80;
    }
  }

  try {
    const { ingredients, servings } = req.body;
    if (!ingredients || ingredients.length === 0) {
      return res.status(400).json({ error: "Keine Zutaten angegeben." });
    }

    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const details = [];
    const notFound = [];

    for (const ing of ingredients) {
      if (!ing.name) continue;

      const englishName = translateIngredient(ing.name);
      const grams = parseGrams(ing.amount, ing.unit, ing.name);

      const searchRes = await fetch(
        "https://api.nal.usda.gov/fdc/v1/foods/search?query=" +
        encodeURIComponent(englishName) +
        "&dataType=Foundation,SR%20Legacy&pageSize=1&api_key=" + API_KEY
      );

      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      if (!searchData.foods || searchData.foods.length === 0) {
        notFound.push(ing.name);
        continue;
      }

      const food = searchData.foods[0];
      const nutrients = food.foodNutrients || [];

      const get = (keyword, unitCheck) => {
        const n = nutrients.find(x => x.nutrientName && x.nutrientName.toLowerCase().includes(keyword.toLowerCase()));
        if (!n) return 0;
        // Energie kann in kJ oder kcal geliefert werden – prüfen und ggf. umrechnen
        if (unitCheck === "energy") {
          const unit = (n.nutrientNumber === "208") ? "kcal" : (n.unitName || "").toLowerCase();
          if (unit === "kj" || unit === "kilojoules") return (n.value || 0) / 4.184;
          return n.value || 0;
        }
        return n.value || 0;
      };

      const factor = grams / 100;
      // Nutrient 208 = Energy in kcal, Nutrient 268 = Energy in kJ
      const energyNutrient = nutrients.find(x => x.nutrientNumber === "208") || nutrients.find(x => x.nutrientName && x.nutrientName.toLowerCase().includes("energy"));
      let rawKcal = 0;
      if (energyNutrient) {
        const unitName = (energyNutrient.unitName || "").toLowerCase();
        rawKcal = energyNutrient.value || 0;
        if (unitName === "kj") rawKcal = rawKcal / 4.184;
        // Sanity check: mehr als 900 kcal/100g ist unrealistisch (reines Fett hat ~900)
        if (rawKcal > 900) rawKcal = rawKcal / 4.184;
      }
      const kcal = rawKcal * factor;
      const protein = get("Protein") * factor;
      const carbs   = get("Carbohydrate") * factor;
      const fat     = get("Total lipid") * factor;

      totals.kcal    += kcal;
      totals.protein += protein;
      totals.carbs   += carbs;
      totals.fat     += fat;

      details.push({
        name: ing.name,
        englishName,
        grams: Math.round(grams),
        kcal: Math.round(kcal),
      });
    }

    const srv = Math.max(1, parseInt(servings) || 1);

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
      notFound,
    });

  } catch (e) {
    return res.status(500).json({ error: "Serverfehler: " + e.message });
  }
}
