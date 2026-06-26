export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt" });

  const API_KEY = "bAYjAS2AdcJBpa7dOvxdQ3PYIC0EHsDOT9SD8Vhh";

  // ── Wörterbuch Deutsch → Englisch (USDA-optimiert) ────────────────────────
  const DICT = {
    // Nudeln & Getreide
    "nudeln": "pasta dry", "spaghetti": "spaghetti dry", "penne": "pasta dry",
    "fusilli": "pasta dry", "tagliatelle": "pasta dry", "lasagneplatten": "lasagna dry",
    "lasagne": "lasagna dry", "reis": "rice white raw", "basmatireis": "rice white raw",
    "vollkornreis": "rice brown raw", "couscous": "couscous dry", "quinoa": "quinoa raw",
    "mehl": "wheat flour all purpose", "weizenmehl": "wheat flour all purpose",
    "vollkornmehl": "whole wheat flour", "haferflocken": "oats rolled dry",
    "paniermehl": "breadcrumbs dry", "semmelbroesel": "breadcrumbs dry",
    "semmelbrosel": "breadcrumbs dry", "broetchen": "bread roll",
    "brot": "bread white", "toast": "bread white",
    "cornflakes": "cornflakes cereal",

    // Fleisch & Geflügel
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

    // Wurst & Aufschnitt
    "salami": "salami", "mortadella": "mortadella",
    "leberwurst": "liverwurst", "wurst": "sausage pork",
    "bratwurst": "bratwurst", "chorizo": "chorizo",

    // Fisch & Meeresfrüchte
    "lachs": "salmon raw", "lachsfilet": "salmon raw",
    "thunfisch": "tuna canned in water", "thunfischdose": "tuna canned in water",
    "kabeljau": "cod raw", "forelle": "trout raw",
    "garnelen": "shrimp raw", "krabben": "shrimp raw",
    "tilapia": "tilapia raw", "hering": "herring raw",
    "sardinen": "sardines canned", "makrele": "mackerel raw",

    // Eier & Milchprodukte
    "ei": "egg whole raw", "eier": "egg whole raw",
    "eigelb": "egg yolk raw", "eiweiss": "egg white raw",
    "milch": "milk whole", "vollmilch": "milk whole",
    "fettarme milch": "milk 2 percent", "magermilch": "milk skim",
    "butter": "butter unsalted", "margarine": "margarine",
    "sahne": "heavy cream", "schlagsahne": "heavy cream",
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

    // Gemüse
    "tomate": "tomato raw", "tomaten": "tomato raw",
    "kirschtomaten": "cherry tomatoes", "dosentomaten": "tomatoes canned",
    "passierte tomaten": "tomato puree", "tomatenmark": "tomato paste",
    "zwiebel": "onion raw", "zwiebeln": "onion raw",
    "rote zwiebel": "onion red raw", "schalotte": "shallot raw",
    "knoblauch": "garlic raw", "knoblauchzehe": "garlic raw",
    "kartoffel": "potato raw", "kartoffeln": "potato raw",
    "süsskartoffel": "sweet potato raw", "susskartoffel": "sweet potato raw",
    "paprika": "bell pepper raw", "paprikaschote": "bell pepper raw",
    "rote paprika": "red bell pepper raw", "gelbe paprika": "yellow bell pepper raw",
    "karotte": "carrot raw", "karotten": "carrot raw",
    "möhre": "carrot raw", "mohre": "carrot raw",
    "zucchini": "zucchini raw", "aubergine": "eggplant raw",
    "brokkoli": "broccoli raw", "blumenkohl": "cauliflower raw",
    "rotkohl": "red cabbage raw", "weißkohl": "cabbage raw",
    "wisskohl": "cabbage raw", "chinakohl": "napa cabbage raw",
    "spinat": "spinach raw", "babyspinat": "spinach raw",
    "salat": "lettuce raw", "eisbergsalat": "iceberg lettuce raw",
    "feldsalat": "lettuce raw", "rucola": "arugula raw",
    "gurke": "cucumber raw", "salatgurke": "cucumber raw",
    "lauch": "leek raw", "porree": "leek raw",
    "sellerie": "celery raw", "stangensellerie": "celery raw",
    "erbsen": "peas green raw", "tiefkuhlerbsen": "peas frozen",
    "mais": "corn sweet raw", "maiskörner": "corn sweet raw",
    "bohnen": "beans green raw", "grüne bohnen": "beans green raw",
    "kidneybohnen": "kidney beans canned", "kichererbsen": "chickpeas canned",
    "linsen": "lentils raw", "rote linsen": "lentils red raw",
    "champignons": "mushrooms raw", "pilze": "mushrooms raw",
    "steinpilze": "porcini mushrooms raw",
    "spargel": "asparagus raw", "rote bete": "beets raw",
    "fenchel": "fennel raw", "kohlrabi": "kohlrabi raw",
    "radieschen": "radishes raw", "frühlingszwiebeln": "green onions raw",

    // Obst
    "apfel": "apple raw", "äpfel": "apple raw", "apfel": "apple raw",
    "birne": "pear raw", "banane": "banana raw", "bananen": "banana raw",
    "orange": "orange raw", "orangen": "orange raw",
    "zitrone": "lemon raw", "zitronen": "lemon raw",
    "limette": "lime raw", "grapefruit": "grapefruit raw",
    "erdbeeren": "strawberries raw", "himbeeren": "raspberries raw",
    "blaubeeren": "blueberries raw", "heidelbeeren": "blueberries raw",
    "kirschen": "cherries raw", "weintrauben": "grapes raw",
    "mango": "mango raw", "ananas": "pineapple raw",
    "papaya": "papaya raw", "kiwi": "kiwi raw",
    "wassermelone": "watermelon raw", "melone": "cantaloupe raw",
    "pfirsich": "peach raw", "nektarine": "nectarine raw",
    "pflaumen": "plums raw", "aprikosen": "apricots raw",
    "feigen": "figs raw", "avocado": "avocado raw",

    // Nüsse & Samen
    "mandeln": "almonds raw", "walnüsse": "walnuts raw", "walnusse": "walnuts raw",
    "haselnüsse": "hazelnuts raw", "haselnusse": "hazelnuts raw",
    "cashews": "cashews raw", "erdnüsse": "peanuts raw", "erdnusse": "peanuts raw",
    "erdnussbutter": "peanut butter", "pinienkerne": "pine nuts raw",
    "sonnenblumenkerne": "sunflower seeds raw", "kürbiskerne": "pumpkin seeds raw",
    "kurbiskerne": "pumpkin seeds raw", "sesam": "sesame seeds raw",
    "chiasamen": "chia seeds", "leinsamen": "flaxseeds raw",
    "tahin": "tahini", "tahini": "tahini",

    // Öle & Fette
    "olivenöl": "olive oil", "olivenol": "olive oil",
    "sonnenblumenöl": "sunflower oil", "sonnenblumenol": "sunflower oil",
    "rapsöl": "canola oil", "rapsol": "canola oil",
    "kokosöl": "coconut oil", "kokosol": "coconut oil",
    "pflanzenöl": "vegetable oil", "pflanzenfett": "shortening",

    // Saucen & Würzmittel
    "sojasosse": "soy sauce", "sojasoße": "soy sauce",
    "worcestersosse": "worcestershire sauce",
    "ketchup": "ketchup", "senf": "mustard yellow",
    "dijonsenf": "mustard dijon", "mayonnaise": "mayonnaise",
    "essig": "vinegar", "weißweinessig": "vinegar white wine",
    "balsamico": "vinegar balsamic", "balsamicoessig": "vinegar balsamic",
    "zitronensaft": "lemon juice", "limettensaft": "lime juice",
    "tomatensauce": "tomato sauce", "tomatensosse": "tomato sauce",
    "pestos": "pesto", "pesto": "pesto",
    "hummus": "hummus", "tahini": "tahini",
    "sriracha": "sriracha sauce", "tabasco": "hot sauce",
    "fischsauce": "fish sauce", "austernsauce": "oyster sauce",

    // Gewürze & Kräuter
    "salz": "salt", "pfeffer": "black pepper",
    "paprikapulver": "paprika powder", "chilipulver": "chili powder",
    "chili": "chili pepper raw", "chiliflocken": "red pepper flakes",
    "kurkuma": "turmeric", "curry": "curry powder",
    "kreuzkümmel": "cumin ground", "koriander": "coriander ground",
    "zimt": "cinnamon", "muskat": "nutmeg",
    "oregano": "oregano dried", "basilikum": "basil fresh",
    "petersilie": "parsley fresh", "schnittlauch": "chives fresh",
    "thymian": "thyme fresh", "rosmarin": "rosemary fresh",
    "lorbeer": "bay leaves", "salbei": "sage fresh",
    "minze": "mint fresh", "dill": "dill fresh",
    "ingwer": "ginger raw", "vanille": "vanilla extract",
    "vanillezucker": "vanilla sugar",

    // Zucker & Süßungsmittel
    "zucker": "sugar white", "puderzucker": "powdered sugar",
    "brauner zucker": "brown sugar", "honig": "honey",
    "ahornsirup": "maple syrup", "agavendicksaft": "agave syrup",
    "stevia": "stevia",

    // Backen
    "backpulver": "baking powder", "natron": "baking soda",
    "hefe": "yeast active dry", "speisestarke": "cornstarch",
    "speisestärke": "cornstarch", "kakaopulver": "cocoa powder unsweetened",
    "schokolade": "chocolate dark", "zartbitterschokolade": "chocolate dark 70 percent",
    "vollmilchschokolade": "chocolate milk", "schokotropfen": "chocolate chips",
    "gelatine": "gelatin",

    // Flüssigkeiten & Sonstiges
    "wasser": "water", "gemüsebrühe": "vegetable broth",
    "gemusebruhe": "vegetable broth", "hühnerbrühe": "chicken broth",
    "huhnerbruhe": "chicken broth", "fleischbrühe": "beef broth",
    "rotwein": "red wine", "weißwein": "white wine",
    "weisswein": "white wine", "bier": "beer",
    "kokosmilch": "coconut milk canned", "mandelmilch": "almond milk",
    "hafermilch": "oat milk", "sojamilch": "soy milk",
    "tofu": "tofu firm", "seitan": "seitan",
    "tempeh": "tempeh", "miso": "miso paste",
    "pak choi": "bok choy raw", "pak-choi": "bok choy raw",
    "edamame": "edamame", "nori": "seaweed dried",
  };

  function translateIngredient(name) {
    const lower = name.toLowerCase().trim();
    // Exact match
    if (DICT[lower]) return DICT[lower];
    // Partial match – find the longest matching key
    let best = null; let bestLen = 0;
    for (const key of Object.keys(DICT)) {
      if (lower.includes(key) && key.length > bestLen) {
        best = DICT[key]; bestLen = key.length;
      }
    }
    if (best) return best;
    // Fallback: use original name (might work for international terms)
    return name;
  }

  function parseGrams(amount, unit) {
    const num = parseFloat(amount) || 1;
    const u = (unit || "").toLowerCase().trim()
      .replace("ö","o").replace("ü","u").replace("ä","a");
    if (u === "g" || u === "gr" || u === "gramm") return num;
    if (u === "kg" || u === "kilogramm") return num * 1000;
    if (u === "mg") return num / 1000;
    if (u === "ml" || u === "milliliter") return num;
    if (u === "l" || u === "liter") return num * 1000;
    if (u === "el" || u === "essloffel" || u === "esslöffel") return num * 15;
    if (u === "tl" || u === "teeloffel" || u === "teelöffel") return num * 5;
    if (u === "tasse" || u === "cup") return num * 240;
    if (u === "prise" || u === "msp") return num * 1;
    if (u === "stk" || u === "stuck" || u === "stück" || u === "stk." || u === "") return num * 80;
    return num * 80;
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
      const grams = parseGrams(ing.amount, ing.unit);

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

      const get = (keyword) => {
        const n = nutrients.find(function(x) {
          return x.nutrientName && x.nutrientName.toLowerCase().includes(keyword.toLowerCase());
        });
        return n ? (n.value || 0) : 0;
      };

      const factor = grams / 100;
      const kcal    = get("Energy") * factor;
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
