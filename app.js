import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const fbApp = initializeApp({
  apiKey: "AIzaSyBK5h3LdJ_1s5tByynBDOdeMGffoCyJO20",
  authDomain: "rezeptbuch-253bc.firebaseapp.com",
  projectId: "rezeptbuch-253bc",
  storageBucket: "rezeptbuch-253bc.firebasestorage.app",
  messagingSenderId: "324939912260",
  appId: "1:324939912260:web:9e3daf8c3365d6305a5811"
});

// Firebase App Check - schützt die API vor Bot-Missbrauch
const appCheck = initializeAppCheck(fbApp, {
  provider: new ReCaptchaV3Provider("6Lf0BUMtAAAAAEqmg70LPf5S726Rm-q3E6Cr1J7z"),
  isTokenAutoRefreshEnabled: true
});

// Hilfsfunktion: holt aktuelles App-Check-Token für Anfragen an eigene API
async function getAppCheckToken() {
  try {
    const { getToken } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js");
    const result = await getToken(appCheck, false);
    return result.token;
  } catch (e) {
    return null;
  }
}

// Zentrale Funktion für alle Aufrufe an eigene /api/-Endpunkte - hängt automatisch App-Check-Token an
async function apiPost(endpoint, body) {
  const token = await getAppCheckToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Firebase-AppCheck"] = token;
  return fetch(endpoint, { method: "POST", headers: headers, body: JSON.stringify(body) });
}
window.apiPost = apiPost;
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

// ── State ──────────────────────────────────────────────────────────────────
var S = {
  user: null,
  recipes: [], weekPlan: {},
  tab: "recipes", view: "list",
  editing: null, viewing: null, search: "",
  shopChecked: {},
  activeFilters: [],
  filterOpen: false,
  sortBy: "newest",
  wcHaveIngredients: [],
  wcFilters: [],
  wcCurrentRecipe: null,
  wcExcluded: [],
  wcAiResult: null,
  wcAiLoading: false,
  wineList: [],
  modalMode: "week", modalDay: null, modalRecipeId: null,
  bringItems: [],
  nutrition: null, nutritionTab: "portion", nutritionLoading: false,
  scaledPortions: null,
  weekNutritionCache: {},
};
var ADMIN_UID = "GT7Tl6KduQbMF3OYt0S7OaNNejr1";
var DAYS = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
var MEALS = ["Frühstück","Mittagessen","Abendessen"];
var MEAL_ICONS = {"Frühstück":"☀️","Mittagessen":"🍽️","Abendessen":"🌙"};
var unsubRecipes = null;
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// ── Auth ───────────────────────────────────────────────────────────────────
var authTab = "login";

window.switchAuthTab = function(tab) {
  authTab = tab;
  document.getElementById("auth-tab-login").classList.toggle("active", tab==="login");
  document.getElementById("auth-tab-register").classList.toggle("active", tab==="register");
  document.getElementById("auth-name-field").style.display = tab==="register" ? "" : "none";
  document.getElementById("auth-submit-btn").textContent = tab==="login" ? "Anmelden" : "Registrieren";
  document.getElementById("auth-error").classList.remove("show");
};

window.submitAuth = async function() {
  var email = document.getElementById("auth-email").value.trim();
  var password = document.getElementById("auth-password").value;
  var name = document.getElementById("auth-name").value.trim();
  var errEl = document.getElementById("auth-error");
  var btn = document.getElementById("auth-submit-btn");
  errEl.classList.remove("show");
  if (!email || !password) { errEl.textContent = "Bitte E-Mail und Passwort eingeben."; errEl.classList.add("show"); return; }
  btn.disabled = true; btn.textContent = "Bitte warten\u2026";
  try {
    if (authTab === "register") {
      var cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch(e) {
    var msg = e.code === "auth/user-not-found" ? "Kein Konto mit dieser E-Mail gefunden."
      : e.code === "auth/wrong-password" ? "Falsches Passwort."
      : e.code === "auth/email-already-in-use" ? "Diese E-Mail wird bereits verwendet."
      : e.code === "auth/weak-password" ? "Passwort muss mindestens 6 Zeichen haben."
      : e.code === "auth/invalid-email" ? "Ung\u00fcltige E-Mail-Adresse."
      : e.message;
    errEl.textContent = msg; errEl.classList.add("show");
    btn.disabled = false; btn.textContent = authTab==="login" ? "Anmelden" : "Registrieren";
  }
};

window.toggleUserMenu = function() {
  var dd = document.getElementById("user-dropdown");
  if (dd) dd.classList.toggle("open");
};
// Close dropdown when clicking outside
document.addEventListener("click", function(e) {
  var dd = document.getElementById("user-dropdown");
  var btn = document.getElementById("user-avatar-btn");
  if (dd && btn && !dd.contains(e.target) && e.target !== btn) {
    dd.classList.remove("open");
  }
});
window.confirmLogout = function() {
  if (confirm("Wirklich abmelden?")) window.doLogout();
};
window.doLogout = async function() {
  if (unsubRecipes) { unsubRecipes(); unsubRecipes = null; }
  await signOut(auth);
};

// ── Auth state observer ────────────────────────────────────────────────────
onAuthStateChanged(auth, function(user) {
  document.getElementById("loading").style.display = "none";
  if (user) {
    S.user = user;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app").style.display = "flex";
    var displayName = user.displayName || user.email;
    document.getElementById("user-email-display").textContent = displayName;
    var avatarBtn = document.getElementById("user-avatar-btn");
    if (avatarBtn) avatarBtn.textContent = (user.displayName ? user.displayName[0] : user.email[0]).toUpperCase();
    initApp();
  } else {
    S.user = null;
    if (unsubRecipes) { unsubRecipes(); unsubRecipes = null; }
    document.getElementById("app").style.display = "none";
    document.getElementById("auth-screen").style.display = "block";
  }
});

// ── Init after login ───────────────────────────────────────────────────────
function initApp() {
  // Fix nav highlight based on current tab
  ["recipes","week","shopping"].forEach(function(t) {
    var el = document.getElementById("nav-"+t);
    if (el) el.classList.toggle("active", t===S.tab);
  });
  // Load recipes (shared)
  if (unsubRecipes) unsubRecipes();
  unsubRecipes = onSnapshot(collection(db, "recipes"), function(snap) {
    S.recipes = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    render();
  });
  // Load user's own weekplan
  getDoc(doc(db, "users", S.user.uid, "weekplan", "current")).then(function(d) {
    if (d.exists()) S.weekPlan = d.data();
    else S.weekPlan = {};
    render();
  });
  getDoc(doc(db, "users", S.user.uid, "winelist", "current")).then(function(d) {
    if (d.exists() && d.data().wines) S.wineList = d.data().wines;
    else S.wineList = [];
    renderOnly();
  });
  getDoc(doc(db, "users", S.user.uid, "shopchecked", "current")).then(function(d) {
    if (d.exists() && d.data().checked) S.shopChecked = d.data().checked;
    else S.shopChecked = {};
    renderOnly();
  });
}

// ── Firebase ───────────────────────────────────────────────────────────────
async function fbSaveRecipe(r) {
  var data = Object.assign({}, r);
  var id = data.id; delete data.id;
  if (!data.createdAt) data.createdAt = Date.now();
  // Bei fremden Rezepten (Admin-Bearbeitung) den ursprünglichen Ersteller behalten
  if (!data.createdBy) {
    data.createdBy = S.user.uid;
    data.createdByName = S.user.displayName || S.user.email;
  }
  // Firestore akzeptiert kein "undefined" - alle solchen Felder entfernen
  Object.keys(data).forEach(function(key) {
    if (data[key] === undefined) delete data[key];
  });
  if (id) { await setDoc(doc(db, "recipes", id), data); }
  else { await addDoc(collection(db, "recipes"), data); }
}

async function fbDeleteRecipe(id) {
  await deleteDoc(doc(db, "recipes", id));
  var changed = false;
  DAYS.forEach(function(day) {
    if (!S.weekPlan[day]) return;
    var entry = S.weekPlan[day];
    var r = entry.recipe || entry;
    if (r.id === id) { delete S.weekPlan[day]; changed = true; }
  });
  if (changed) await fbSaveWeek();
}

async function fbSaveWeek() {
  await setDoc(doc(db, "users", S.user.uid, "weekplan", "current"), S.weekPlan);
}
async function fbSaveShopChecked() {
  try { await setDoc(doc(db, "users", S.user.uid, "shopchecked", "current"), { checked: S.shopChecked }); } catch(e) {}
}
async function fbSaveWineList() {
  try {
    await setDoc(doc(db, "users", S.user.uid, "winelist", "current"), { wines: S.wineList });
  } catch(e) { console.error("Wine save error:", e); }
}

function isOwner(recipe) {
  if (!recipe || !S.user) return false;
  if (S.user.uid === ADMIN_UID) return true; // Admin kann alles bearbeiten
  if (!recipe.createdBy) return true; // Legacy recipes without owner
  return recipe.createdBy === S.user.uid;
}

// ── Bewertungen ──────────────────────────────────────────────────────────────
function ratingStats(recipe) {
  var ratings = (recipe && recipe.ratings) || {};
  var values = Object.keys(ratings).map(function(k){ return ratings[k]; }).filter(function(v){ return v>=1 && v<=5; });
  var count = values.length;
  var avg = count ? values.reduce(function(a,b){return a+b;},0)/count : 0;
  var mine = (S.user && ratings[S.user.uid]) || 0;
  return { avg: avg, count: count, mine: mine };
}

function starsDisplayHtml(avg, count) {
  if (!count) return '<span class="star-rating-empty">Noch keine Bewertung</span>';
  var pct = Math.max(0, Math.min(100, (avg/5)*100));
  return '<span class="star-rating" title="'+avg.toFixed(1)+' von 5 Sternen">'
    +'<span class="star-row star-row-bg">&#9733;&#9733;&#9733;&#9733;&#9733;</span>'
    +'<span class="star-row star-row-fg" style="width:'+pct+'%">&#9733;&#9733;&#9733;&#9733;&#9733;</span>'
    +'</span><span class="star-rating-count">'+avg.toFixed(1)+' ('+count+')</span>';
}

function starPickerHtml(recipeId, mine) {
  var stars = '';
  for (var i=1; i<=5; i++) {
    stars += '<span class="star-pick'+(i<=mine?' filled':'')+'" onclick="rateRecipe(\''+recipeId+'\','+i+')">&#9733;</span>';
  }
  return '<div class="star-picker">'+stars+'</div>';
}

window.rateRecipe = async function(recipeId, stars) {
  if (!S.user) return;
  var uid = S.user.uid;
  var r = S.recipes.find(function(x){ return x.id === recipeId; });
  if (!r) return;
  r.ratings = r.ratings || {};
  r.ratings[uid] = stars;
  renderOnly();
  try {
    var patch = { ratings: {} };
    patch.ratings[uid] = stars;
    await setDoc(doc(db, "recipes", recipeId), patch, { merge: true });
  } catch(e) { toast("Bewertung konnte nicht gespeichert werden"); }
};

// ── Icons ──────────────────────────────────────────────────────────────────
function svg(path, size) {
  size = size || 16;
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>';
}
var I = {
  plus: "M12 5v14M5 12h14", trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  x: "M18 6L6 18M6 6l12 12", check: "M20 6L9 17l-5-5",
  copy: "M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2v-2M8 4h8a2 2 0 012 2v8M8 4a2 2 0 012-2h4a2 2 0 012 2",
  dl: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  back: "M19 12H5M12 5l-7 7 7 7",
  fwd: "M5 12h14M12 5l7 7-7 7",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  clock: "M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zM12 6v6l4 2",
  cal: "M3 4h18M3 8h18M3 12h18M3 16h18M3 20h10M16 3v18",
  lock: "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4",
  pot: "M5 10h14v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7zM3 10h2M19 10h2M9 10V6a3 3 0 016 0v4",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
// Nur echte Bild-Data-URLs ins src-Attribut lassen (Rezepte sind für alle sichtbar - verhindert Attribut-Injection über fremde photo-Werte)
function safePhotoSrc(p) { return (typeof p==="string" && /^data:image\//.test(p)) ? p : ""; }
function toast(msg) { var t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); setTimeout(function(){t.classList.remove("show");},2400); }
function dlTxt(name, txt) { var b=new Blob([txt],{type:"text/plain;charset=utf-8"}); var u=URL.createObjectURL(b); var a=document.createElement("a"); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u); }
function fmtIng(i) { return [i.amount, i.unit, i.name].filter(Boolean).join(" "); }
function fmtNum(n) { return n % 1 === 0 ? String(n) : n.toFixed(1).replace(/\.0$/,""); }

// ── Unit dropdown ──────────────────────────────────────────────────────────
var UNITS = ["","g","kg","ml","l","EL","TL","Tasse","Stk","Scheibe","Prise","Zehe"];
var UNIT_LABELS = {"":"–","g":"g","kg":"kg","ml":"ml","l":"l","EL":"EL","TL":"TL","Tasse":"Tasse","Stk":"Stk","Scheibe":"Scheibe","Prise":"Prise","Zehe":"Zehe"};
function buildUnitSelect(selected) {
  var html = '<select class="inp inp-sm unit-sel" data-f="unit">';
  UNITS.forEach(function(u) { html += '<option value="'+u+'"'+(u===(selected||"")?" selected":"")+'>'+UNIT_LABELS[u]+'</option>'; });
  return html + '</select>';
}

// ── Week plan helpers ──────────────────────────────────────────────────────
function getWeekEntries() {
  var result = [];
  DAYS.forEach(function(day) {
    MEALS.forEach(function(meal) {
      var key = day + "__" + meal;
      var entry = S.weekPlan[key];
      if (!entry) return;
      if (entry && entry.recipe) result.push(Object.assign({day:day,meal:meal}, entry));
      else result.push({day:day,meal:meal,recipe:entry,portions:parseInt((entry||{}).servings)||1});
    });
  });
  return result;
}

function mergeWeekIngredients() {
  var map = {};
  getWeekEntries().forEach(function(entry) {
    var r = entry.recipe;
    var scale = entry.portions / (parseInt(r.servings)||1);
    (r.ingredients||[]).filter(function(i){return i.name;}).forEach(function(ing){
      var key = ing.name.toLowerCase()+"__"+(ing.unit||"");
      var scaled = (parseFloat(ing.amount)||0) * scale;
      var displayAmt = scaled ? fmtNum(scaled) : "";
      if (map[key]) {
        var total = (parseFloat(map[key].amount)||0) + scaled;
        map[key] = Object.assign({}, map[key], { amount: fmtNum(total) });
      } else {
        map[key] = Object.assign({}, ing, { amount: displayAmt });
      }
    });
  });
  return Object.values(map);
}

function weekExportText() {
  var ings = mergeWeekIngredients();
  var lines = ["Wocheneinkaufsliste",""];
  DAYS.forEach(function(day){
    var dayLines=[];
    MEALS.forEach(function(meal){
      var key=day+"__"+meal;
      if(!S.weekPlan[key]) return;
      var entry=S.weekPlan[key];
      var r=entry.recipe||entry;
      var p=entry.portions||parseInt((r||{}).servings)||1;
      dayLines.push("  "+MEAL_ICONS[meal]+" "+meal+": "+r.name+" ("+p+"x)");
    });
    if(dayLines.length>0){lines.push(day+":");dayLines.forEach(function(l){lines.push(l);});}
  });
  lines.push("","---","Zutaten:","");
  ings.forEach(function(i){lines.push("- "+fmtIng(i));});
  return lines.join("\n");
}

function shopExportText() {
  var entries = getWeekEntries();
  var names = entries.map(function(e){return e.recipe.name+" ("+e.portions+"x)";}).join(", ");
  var ings = mergeWeekIngredients();
  return ["Einkaufsliste für diese Woche","","Gerichte: "+names,""].concat(ings.map(function(i){return "- "+fmtIng(i);})).join("\n");
}

// ── Nutrition ──────────────────────────────────────────────────────────────
function loadNutritionScaled(recipe, portions) {
  // Nährwerte sind bereits im Rezept gespeichert (einmalig per KI berechnet beim Speichern)
  if (!recipe.nutrition || !recipe.nutrition.total) {
    S.nutrition = { error: "Keine Nährwerte gespeichert. Bitte Rezept einmal speichern um sie zu berechnen." };
    renderNutritionBox();
    return;
  }

  var baseServings = recipe.nutrition.baseServings || parseInt(recipe.servings) || 1;
  var total = recipe.nutrition.total;
  var scale = portions / baseServings;

  var scaledTotal = {
    kcal: Math.round(total.kcal * scale),
    protein: Math.round(total.protein * scale * 10) / 10,
    carbs: Math.round(total.carbs * scale * 10) / 10,
    fat: Math.round(total.fat * scale * 10) / 10,
  };

  S.nutrition = {
    total: scaledTotal,
    perServing: {
      kcal: Math.round(scaledTotal.kcal / portions),
      protein: Math.round((scaledTotal.protein / portions) * 10) / 10,
      carbs: Math.round((scaledTotal.carbs / portions) * 10) / 10,
      fat: Math.round((scaledTotal.fat / portions) * 10) / 10,
    },
    servings: portions,
  };
  renderNutritionBox();
}



function renderNutritionBox() { var el=document.getElementById("nutrition-box"); if(el) el.innerHTML=nutritionBoxHtml(); }
function nutritionBoxHtml() {
  if (S.nutritionLoading) return '<div class="nutrition-loading"><div class="spinner spinner-sm"></div> N&auml;hrwerte werden berechnet&hellip;</div>';
  if (!S.nutrition) return "";
  if (S.nutrition.error) {
    var ownerView = S.viewing && isOwner(S.viewing);
    return '<p style="font-size:13px;color:var(--text-muted);font-style:italic">' + esc(S.nutrition.error) + '</p>'
      + (ownerView ? '<button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="recalcNutritionNow()">&#128202; Jetzt berechnen</button>' : '');
  }
  var n = S.nutritionTab==="portion" ? S.nutrition.perServing : S.nutrition.total;
  return '<p class="nutrition-title">N&auml;hrwerte</p>'
    +'<div class="nutrition-tabs">'
    +'<button class="nutrition-tab'+(S.nutritionTab==="portion"?" active":"")+'" onclick="setNutritionTab(\'portion\')">Pro Portion</button>'
    +'<button class="nutrition-tab'+(S.nutritionTab==="total"?" active":"")+'" onclick="setNutritionTab(\'total\')">Gesamt</button>'
    +'</div>'
    +'<div class="nutrition-grid">'
    +'<div class="nutrition-stat"><div class="nutrition-stat-val">'+n.kcal+'</div><div class="nutrition-stat-unit">kcal</div><div class="nutrition-stat-label">Kalorien</div></div>'
    +'<div class="nutrition-stat"><div class="nutrition-stat-val">'+n.protein+'</div><div class="nutrition-stat-unit">g</div><div class="nutrition-stat-label">Eiwei&szlig;</div></div>'
    +'<div class="nutrition-stat"><div class="nutrition-stat-val">'+n.carbs+'</div><div class="nutrition-stat-unit">g</div><div class="nutrition-stat-label">Kohlenhydrate</div></div>'
    +'<div class="nutrition-stat"><div class="nutrition-stat-val">'+n.fat+'</div><div class="nutrition-stat-unit">g</div><div class="nutrition-stat-label">Fett</div></div>'
    +'</div>'
    +'<p class="nutrition-hint">&#9432; Richtwerte &bull; '+(S.nutritionTab==="portion"?"pro Portion":"gesamt ("+S.nutrition.servings+" Portionen)")+'</p>';
}
window.setNutritionTab = function(tab) { S.nutritionTab=tab; renderNutritionBox(); };

// ── Bring ──────────────────────────────────────────────────────────────────
window.openBringModal = function(items) {
  S.bringItems = items||[];
  var savedToken=localStorage.getItem("bring_token");
  var savedUuid=localStorage.getItem("bring_uuid");
  if (savedToken && savedUuid) { exportToBring(null,null,savedToken,savedUuid); return; }
  var savedEmail=localStorage.getItem("bring_email");
  document.getElementById("bring-email").value=savedEmail||"";
  document.getElementById("bring-pw").value="";
  document.getElementById("bring-saved-hint").textContent=savedEmail?"E-Mail gespeichert \u2013 bitte Passwort eingeben.":"";
  document.getElementById("bring-status").textContent="";
  document.getElementById("bring-status").className="bring-status";
  document.getElementById("bring-modal").classList.add("open");
};
window.closeBringModal=function(){document.getElementById("bring-modal").classList.remove("open");};
window.onBringModalBgClick=function(e){if(e.target===document.getElementById("bring-modal"))window.closeBringModal();};

async function exportToBring(email,password,token,uuid) {
  var statusEl=document.getElementById("bring-status");
  var btn=document.getElementById("bring-submit-btn");
  if(btn) btn.disabled=true;
  if(statusEl){statusEl.textContent="Exportiere\u2026";statusEl.className="bring-status";}
  try {
    var body={items:S.bringItems, uid:(S.user&&S.user.uid)};
    if(token&&uuid){body.token=token;body.uuid=uuid;}
    if(email) body.email=email;
    if(password) body.password=password;
    var res=await apiPost("/api/bring", body);
    var data=await res.json();
    if(res.status===401&&data.error==="token_expired"){
      localStorage.removeItem("bring_token");localStorage.removeItem("bring_uuid");
      if(btn) btn.disabled=false;
      document.getElementById("bring-email").value=localStorage.getItem("bring_email")||"";
      document.getElementById("bring-pw").value="";
      document.getElementById("bring-saved-hint").textContent="Sitzung abgelaufen \u2013 bitte erneut anmelden.";
      document.getElementById("bring-modal").classList.add("open");
      return;
    }
    if(!res.ok){if(statusEl){statusEl.textContent=data.error||"Fehler.";statusEl.className="bring-status err";}if(btn)btn.disabled=false;return;}
    if(data.token){localStorage.setItem("bring_token",data.token);localStorage.setItem("bring_uuid",data.uuid);}
    if(email) localStorage.setItem("bring_email",email);
    localStorage.removeItem("bring_pw");
    if(btn) btn.disabled=false;
    toast("\u2713 "+data.count+" Zutaten in Bring!");
    window.closeBringModal();
  } catch(e){if(statusEl){statusEl.textContent="Fehler: "+e.message;statusEl.className="bring-status err";}if(btn)btn.disabled=false;}
}

window.submitBring=async function(){
  var email=document.getElementById("bring-email").value.trim();
  var pw=document.getElementById("bring-pw").value;
  if(!email||!pw){var s=document.getElementById("bring-status");s.textContent="Bitte E-Mail und Passwort eingeben.";s.className="bring-status err";return;}
  await exportToBring(email,pw,null,null);
};

// ── Import ─────────────────────────────────────────────────────────────────
var importImageBase64=null, importImageType=null, importTab="text";
window.openImportModal=function(){
  importImageBase64=null;importImageType=null;
  document.getElementById("import-text").value="";
  if(document.getElementById("import-url")) document.getElementById("import-url").value="";
  document.getElementById("import-status").textContent="";
  document.getElementById("import-preview").style.display="none";
  document.getElementById("import-drop-zone").style.display="";
  switchImportTab("text");
  document.getElementById("import-modal").classList.add("open");
};
window.closeImportModal=function(){document.getElementById("import-modal").classList.remove("open");};
window.onImportModalBgClick=function(e){if(e.target===document.getElementById("import-modal"))window.closeImportModal();};
window.switchImportTab=function(tab){
  importTab=tab;
  document.getElementById("import-text-area").style.display=tab==="text"?"":"none";
  document.getElementById("import-url-area").style.display=tab==="url"?"":"none";
  document.getElementById("import-image-area").style.display=tab==="image"?"":"none";
  document.getElementById("import-tab-text").classList.toggle("active",tab==="text");
  var urlTab=document.getElementById("import-tab-url"); if(urlTab) urlTab.classList.toggle("active",tab==="url");
  document.getElementById("import-tab-image").classList.toggle("active",tab==="image");
};
window.onImportDrop=function(e){e.preventDefault();var f=e.dataTransfer.files[0];if(f)loadImportImage(f);};
window.onImportFileSelected=function(e){var f=e.target.files[0];if(f)loadImportImage(f);};
function loadImportImage(file){
  var reader=new FileReader();
  reader.onload=function(e){
    var url=e.target.result;
    importImageBase64=url.split(",")[1];importImageType=file.type;
    document.getElementById("import-preview-img").src=url;
    document.getElementById("import-preview").style.display="";
    document.getElementById("import-drop-zone").style.display="none";
  };
  reader.readAsDataURL(file);
}
window.clearImportImage=function(){
  importImageBase64=null;importImageType=null;
  document.getElementById("import-preview").style.display="none";
  document.getElementById("import-drop-zone").style.display="";
  document.getElementById("import-file").value="";
};
window.submitImport=async function(){
  var statusEl=document.getElementById("import-status");
  var btn=document.getElementById("import-submit-btn");
  var text=document.getElementById("import-text").value.trim();
  var urlEl=document.getElementById("import-url");
  var url=urlEl?urlEl.value.trim():"";
  if(importTab==="text"&&!text){statusEl.textContent="Bitte Rezepttext einf\u00fcgen.";statusEl.style.color="var(--danger)";return;}
  if(importTab==="url"&&!url){statusEl.textContent="Bitte einen Link eingeben.";statusEl.style.color="var(--danger)";return;}
  if(importTab==="image"&&!importImageBase64){statusEl.textContent="Bitte ein Bild ausw\u00e4hlen.";statusEl.style.color="var(--danger)";return;}
  btn.disabled=true;
  statusEl.textContent=importTab==="url"?"Seite wird geladen\u2026":"Rezept wird analysiert\u2026";
  statusEl.style.color="var(--text-muted)";
  try {
    var body={};
    if(importTab==="image"){body.imageBase64=importImageBase64;body.imageType=importImageType;}
    else if(importTab==="url"){body.url=url;}
    else{body.text=text;}
    body.uid=S.user.uid;
    var res=await apiPost("/api/import", body);
    var data=await res.json();
    if(!res.ok){statusEl.textContent=data.error||"Fehler.";statusEl.style.color="var(--danger)";btn.disabled=false;return;}
    S.editing=data.recipe;S.view="form";
    window.closeImportModal();btn.disabled=false;
    toast("Rezept importiert \u2013 bitte pr\u00fcfen und speichern!");
    render();
  } catch(e){statusEl.textContent="Fehler: "+e.message;statusEl.style.color="var(--danger)";btn.disabled=false;}
};

// ── Tab switching ──────────────────────────────────────────────────────────
window.switchTab=function(tab){
  S.tab=tab;S.view="list";S.editing=null;S.viewing=null;S.search="";S.nutrition=null;
  ["recipes","week","shopping","whatcook"].forEach(function(t){document.getElementById("nav-"+t).classList.toggle("active",t===tab);});
  render();
};


// ── Was koche ich heute? ────────────────────────────────────────────────────
function tplWhatCook(){
  var allTags = {};
  S.recipes.forEach(function(r){ (r.tags||[]).forEach(function(t){ allTags[t]=(allTags[t]||0)+1; }); });

  var groups = {
    "Mahlzeit": ["Hauptgericht","Beilage","Frühstück","Snack","Dessert","Getränk"],
    "Zutaten": ["Fleisch","Geflügel","Fisch","Meeresfrüchte","Vegetarisch","Vegan","Eier","Käse"],
    "Küche": ["Italienisch","Asiatisch","Deutsch","Mexikanisch","Mediterran","Indisch","Amerikanisch","Französisch"],
    "Art": ["Pasta/Nudeln","Reis/Getreide","Suppe/Eintopf","Salat","Sandwich/Wrap","Pizza","Curry","Pfannengericht","Backen","Bowl"],
    "Aufwand": ["Schnell","Mittel","Aufwendig"]
  };

  var html = '<h2 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:24px;font-weight:800;margin-bottom:6px">&#127922; Was koche ich heute?</h2>';
  html += '<p style="font-size:14px;color:var(--text-3);margin-bottom:24px">Lass dir ein Rezept vorschlagen \u2013 aus deiner Sammlung oder komplett neu von der KI.</p>';

  // Zutaten die ich habe
  html += '<div class="card" style="padding:20px;margin-bottom:16px">';
  html += '<div class="field" style="margin-bottom:10px"><label>Zutaten die ich schon habe (optional)</label>';
  html += '<div style="display:flex;gap:8px"><input class="inp" id="wc-ing-input" placeholder="z.B. Hähnchen, Reis..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();addWcIngredient();}" />';
  html += '<button class="btn btn-secondary" onclick="addWcIngredient()">+ Hinzufügen</button></div></div>';
  if (S.wcHaveIngredients.length > 0) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    S.wcHaveIngredients.forEach(function(ing, i){
      html += '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent-dark);padding:5px 10px;border-radius:20px;font-size:13px;font-weight:600">'+esc(ing)+'<button onclick="removeWcIngredient('+i+')" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:800;padding:0;line-height:1">&times;</button></span>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Filter
  html += '<div class="card" style="padding:20px;margin-bottom:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:'+(S.wcFilters.length?'14':'0')+'px">';
  html += '<label style="font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.7px">Filter'+(S.wcFilters.length?' ('+S.wcFilters.length+')':'')+'</label>';
  if (S.wcFilters.length > 0) html += '<button class="btn btn-ghost btn-sm" onclick="clearWcFilters()">&#10005; Zurücksetzen</button>';
  html += '</div>';
  Object.keys(groups).forEach(function(groupName) {
    var tags = groups[groupName];
    html += '<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:800;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">'+groupName+'</div><div class="filter-tags">';
    tags.forEach(function(tag){
      var active = S.wcFilters.indexOf(tag) >= 0;
      html += '<span class="'+tagClass(tag)+' tag-filter'+(active?' active':'')+'" data-tag="'+esc(tag)+'" onclick="toggleWcFilter(this)">'+esc(tag)+'</span>';
    });
    html += '</div></div>';
  });
  html += '</div>';

  // Action buttons
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">';
  html += '<button class="btn btn-primary" onclick="suggestFromRecipes()" style="flex:1;justify-content:center;padding:13px">&#127922; Rezept vorschlagen</button>';
  html += '<button class="btn btn-secondary" onclick="suggestFromAI()" style="flex:1;justify-content:center;padding:13px">&#10024; KI-Rezept erstellen</button>';
  html += '</div>';

  // Result area
  html += '<div id="wc-result">' + wcResultHtml() + '</div>';

  return html;
}

function wcResultHtml() {
  if (S.wcAiLoading) {
    return '<div class="card" style="padding:40px;text-align:center"><div class="spinner" style="margin:0 auto 16px"></div><p style="color:var(--text-3)">Claude erstellt ein Rezept für dich\u2026</p></div>';
  }

  if (S.wcAiResult) {
    var r = S.wcAiResult;
    var ingHtml = (r.ingredients||[]).map(function(i){
      return '<li style="display:flex;gap:10px;padding:6px 0;font-size:14px"><span class="ing-dot"></span><span style="font-weight:700;color:var(--accent);min-width:70px">'+esc([i.amount,i.unit].filter(Boolean).join(' '))+'</span><span>'+esc(i.name)+'</span></li>';
    }).join('');
    var stepHtml = (r.steps||[]).map(function(s,i){
      return '<li style="display:flex;gap:12px;margin-bottom:12px"><span class="step-num">'+(i+1)+'</span><span style="padding-top:5px;font-size:14px;color:var(--text-2)">'+esc(s.text)+'</span></li>';
    }).join('');

    return '<div class="card" style="padding:28px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">'
      + '<h3 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:22px;font-weight:800">'+esc(r.name)+'</h3>'
      + '<span style="background:#F5F3FF;color:#7C3AED;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">&#10024; KI-Vorschlag</span>'
      + '</div>'
      + (r.description?'<p style="color:var(--text-3);font-size:14px;margin-bottom:16px">'+esc(r.description)+'</p>':'')
      + '<div style="display:flex;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;font-size:13px;color:var(--text-3)">'
      + (r.servings?'<span>&#128101; '+esc(r.servings)+' Portionen</span>':'')
      + (r.prepTime?'<span>&#128337; '+esc(r.prepTime)+'</span>':'')
      + '</div>'
      + '<ul style="list-style:none;margin-bottom:20px">'+ingHtml+'</ul>'
      + '<ol style="list-style:none">'+stepHtml+'</ol>'
      + '<div style="display:flex;gap:10px;margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">'
      + '<button class="btn btn-primary" onclick="saveWcAiRecipe()">&#128190; Rezept speichern</button>'
      + '<button class="btn btn-secondary" onclick="suggestFromAI()">&#8635; Anderes Rezept</button>'
      + '</div></div>';
  }

  if (S.wcCurrentRecipe) {
    var rec = S.wcCurrentRecipe;
    var _rps = safePhotoSrc(rec.photo);
    var thumb = _rps ? '<img src="'+_rps+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:16px" />' : '';
    return '<div class="card" style="padding:28px">'
      + thumb
      + '<h3 style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:22px;font-weight:800;margin-bottom:6px">'+esc(rec.name)+'</h3>'
      + (rec.description?'<p style="color:var(--text-3);font-size:14px;margin-bottom:14px">'+esc(rec.description)+'</p>':'')
      + '<div style="display:flex;gap:16px;font-size:13px;color:var(--text-3);margin-bottom:14px">'
      + (rec.servings?'<span>&#128101; '+esc(rec.servings)+' Portionen</span>':'')
      + (rec.prepTime?'<span>&#128337; '+esc(rec.prepTime)+'</span>':'')
      + '</div>'
      + ((rec.tags&&rec.tags.length)?'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:20px">'+rec.tags.map(function(t){return tagHtml(t,false,false);}).join('')+'</div>':'')
      + '<div style="display:flex;gap:10px">'
      + '<button class="btn btn-primary" onclick="goToRecipe(\'' + rec.id + '\')">Rezept ansehen</button>'
      + '<button class="btn btn-secondary" onclick="suggestFromRecipes()">&#8635; Anderer Vorschlag</button>'
      + '</div></div>';
  }

  return '';
}

window.addWcIngredient = function() {
  var el = document.getElementById('wc-ing-input');
  var val = el.value.trim();
  if (!val) return;
  S.wcHaveIngredients.push(val);
  el.value = '';
  renderOnly();
  setTimeout(function(){ var e2=document.getElementById('wc-ing-input'); if(e2) e2.focus(); }, 10);
};
window.removeWcIngredient = function(i) { S.wcHaveIngredients.splice(i,1); renderOnly(); };
window.toggleWcFilter = function(el) {
  var tag = el.getAttribute('data-tag');
  var idx = S.wcFilters.indexOf(tag);
  if (idx >= 0) S.wcFilters.splice(idx,1); else S.wcFilters.push(tag);
  renderOnly();
};
window.clearWcFilters = function() { S.wcFilters = []; renderOnly(); };

window.suggestFromRecipes = function() {
  S.wcAiResult = null;
  var candidates = S.recipes.filter(function(r) {
    if (S.wcFilters.length > 0) {
      var rTags = r.tags || [];
      var allMatch = S.wcFilters.every(function(f){ return rTags.indexOf(f) >= 0; });
      if (!allMatch) return false;
    }
    if (S.wcHaveIngredients.length > 0) {
      var rIngNames = (r.ingredients||[]).map(function(i){ return (i.name||'').toLowerCase(); }).join(' ');
      var hasAny = S.wcHaveIngredients.some(function(have){ return rIngNames.indexOf(have.toLowerCase()) >= 0; });
      if (!hasAny) return false;
    }
    return true;
  });
  // Exclude last shown to avoid repeats
  var pool = candidates.filter(function(r){ return S.wcExcluded.indexOf(r.id) < 0; });
  if (pool.length === 0) { pool = candidates; S.wcExcluded = []; }
  if (pool.length === 0) {
    S.wcCurrentRecipe = null;
    toast('Keine passenden Rezepte gefunden. Filter anpassen?');
    renderOnly();
    return;
  }
  var pick = pool[Math.floor(Math.random() * pool.length)];
  S.wcCurrentRecipe = pick;
  S.wcExcluded.push(pick.id);
  renderOnly();
};

window.suggestFromAI = async function() {
  S.wcCurrentRecipe = null;
  S.wcAiResult = null;
  S.wcAiLoading = true;
  renderOnly();
  try {
    var res = await apiPost('/api/whatcook', { haveIngredients: S.wcHaveIngredients, filters: S.wcFilters, uid: S.user.uid });
    var data = await res.json();
    if (res.ok && data.recipe) {
      S.wcAiResult = data.recipe;
    } else {
      toast('Rezept konnte nicht erstellt werden.');
    }
  } catch(e) {
    toast('Fehler beim Erstellen des Rezepts.');
  }
  S.wcAiLoading = false;
  renderOnly();
};

window.saveWcAiRecipe = async function() {
  if (!S.wcAiResult) return;
  var recipe = Object.assign({}, S.wcAiResult, { id: null, tags: S.wcFilters.slice() });
  await fbSaveRecipe(recipe);
  toast('Rezept gespeichert \u2713');
  S.wcAiResult = null;
  S.tab = 'recipes';
  render();
};


// ── Zutaten-Sortierung ──────────────────────────────────────────────────────
var ING_CATEGORY_ORDER = [
  { name: "hauptzutat", keywords: ["hähnchen","huhn","rind","schwein","lamm","ente","pute","hackfleisch","fleisch","fisch","lachs","garnelen","shrimp","tofu","halloumi","speck","bacon","wurst"], priority: 1 },
  { name: "gemüse_obst", keywords: ["zwiebel","knoblauch","tomate","paprika","karotte","möhre","kartoffel","zucchini","aubergine","pilz","champignon","brokkoli","spinat","salat","gurke","apfel","zitrone","limette","ingwer","chili","sellerie","lauch","kohl","erbsen","bohnen"], priority: 2 },
  { name: "grundzutat", keywords: ["mehl","reis","nudeln","pasta","couscous","quinoa","haferflocken","brot","ei","eier","käse","milch","sahne","joghurt","quark","butter","zucker","honig"], priority: 3 },
  { name: "flüssigkeit_öl", keywords: ["öl","brühe","wasser","wein","essig","sojasauce","fischsauce"], priority: 4 },
  { name: "gewürz", keywords: ["salz","pfeffer","paprikapulver","kreuzkümmel","curry","muskat","zimt","oregano","basilikum","thymian","rosmarin","petersilie","kräuter","gewürz","chiliflocken","currypulver","senf","gochujang","sriracha","sesam","kümmel","koriander","natron","backpulver","hefe","vanille","essig","sirup","sauce","soße","paste","ketchup"], priority: 5 }
];

function ingredientPriority(name) {
  var n = (name||"").toLowerCase();
  for (var i = 0; i < ING_CATEGORY_ORDER.length; i++) {
    var cat = ING_CATEGORY_ORDER[i];
    for (var j = 0; j < cat.keywords.length; j++) {
      if (n.indexOf(cat.keywords[j]) >= 0) return cat.priority;
    }
  }
  return 3; // Standard: wie Grundzutat einsortieren wenn unbekannt
}

function sortIngredientsForDisplay(ingredients) {
  return ingredients.slice().sort(function(a, b) {
    var pa = ingredientPriority(a.name);
    var pb = ingredientPriority(b.name);
    if (pa !== pb) return pa - pb;
    return 0; // gleiche Kategorie: Reihenfolge wie eingegeben beibehalten
  });
}

// ── Auto-categorize ────────────────────────────────────────────────────────
var TAG_COLORS = {
  "Hauptgericht":"tag-meal","Beilage":"tag-meal","Frühstück":"tag-meal","Snack":"tag-meal","Dessert":"tag-meal","Getränk":"tag-meal",
  "Fleisch":"tag-ingredient","Geflügel":"tag-ingredient","Fisch":"tag-ingredient","Meeresfrüchte":"tag-ingredient",
  "Vegetarisch":"tag-ingredient","Vegan":"tag-ingredient","Eier":"tag-ingredient","Käse":"tag-ingredient",
  "Italienisch":"tag-cuisine","Asiatisch":"tag-cuisine","Deutsch":"tag-cuisine","Mexikanisch":"tag-cuisine",
  "Mediterran":"tag-cuisine","Indisch":"tag-cuisine","Amerikanisch":"tag-cuisine","Französisch":"tag-cuisine",
  "Pasta/Nudeln":"tag-type","Reis/Getreide":"tag-type","Suppe/Eintopf":"tag-type","Salat":"tag-type",
  "Sandwich/Wrap":"tag-type","Pizza":"tag-type","Curry":"tag-type","Pfannengericht":"tag-type",
  "Backen":"tag-type","Rohkost":"tag-type","Bowl":"tag-type",
  "Schnell":"tag-effort","Mittel":"tag-effort","Aufwendig":"tag-effort"
};

function tagClass(tag) { return "tag " + (TAG_COLORS[tag] || "tag-meal"); }

async function autoCategorizRecipe(recipe) {
  try {
    var res = await apiPost("/api/categorize", { name: recipe.name, description: recipe.description, ingredients: recipe.ingredients, uid: S.user.uid });
    var data = await res.json();
    return data.tags || [];
  } catch(e) { return []; }
}

function tagHtml(tag, clickable, active) {
  var cls = tagClass(tag) + (clickable ? " tag-filter" + (active ? " active" : "") : "");
  var dataAttr = clickable ? ' data-tag="' + esc(tag) + '" onclick="handleTagClick(this)"' : '';
  return '<span class="' + cls + '"' + dataAttr + '>' + esc(tag) + '</span>';
}

window.handleTagClick = function(el) {
  var tag = el.getAttribute('data-tag');
  if (tag) window.toggleFilter(tag);
};

window.toggleFilter = function(tag) {
  var idx = S.activeFilters.indexOf(tag);
  if (idx >= 0) S.activeFilters.splice(idx, 1);
  else S.activeFilters.push(tag);
  render();
};

window.clearFilters = function() { S.activeFilters = []; render(); };
window.setSortBy = function(v) { S.sortBy = v; renderOnly(); };
window.toggleFilterPanel = function() { S.filterOpen = !S.filterOpen; render(); };

function filterPanel() {
  // Collect all tags from all recipes
  var allTags = {};
  S.recipes.forEach(function(r) {
    (r.tags || []).forEach(function(t) { allTags[t] = (allTags[t]||0)+1; });
  });

  var groups = {
    "Mahlzeit": ["Hauptgericht","Beilage","Frühstück","Snack","Dessert","Getränk"],
    "Zutaten": ["Fleisch","Geflügel","Fisch","Meeresfrüchte","Vegetarisch","Vegan","Eier","Käse"],
    "Küche": ["Italienisch","Asiatisch","Deutsch","Mexikanisch","Mediterran","Indisch","Amerikanisch","Französisch"],
    "Art": ["Pasta/Nudeln","Reis/Getreide","Suppe/Eintopf","Salat","Sandwich/Wrap","Pizza","Curry","Pfannengericht","Backen","Bowl"],
    "Aufwand": ["Schnell","Mittel","Aufwendig"]
  };

  var html = '<div class="filter-panel">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<span style="font-size:13px;font-weight:700;color:var(--text-sub)">Filter</span>';
  if (S.activeFilters.length > 0) {
    html += '<button class="btn btn-ghost btn-sm" onclick="clearFilters()">&#10005; Alle löschen ('+S.activeFilters.length+')</button>';
  }
  html += '</div>';

  Object.keys(groups).forEach(function(groupName) {
    var tags = groups[groupName].filter(function(t) { return allTags[t]; });
    if (tags.length === 0) return;
    html += '<div class="filter-section">';
    html += '<div class="filter-section-label">'+groupName+'</div>';
    html += '<div class="filter-tags">';
    tags.forEach(function(tag) {
      var active = S.activeFilters.indexOf(tag) >= 0;
      html += tagHtml(tag, true, active) + ' <span style="font-size:10px;color:var(--text-muted)">'+allTags[tag]+'</span> ';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

// ── Stats modal ────────────────────────────────────────────────────────────
window.openStatsModal = function() {
  document.getElementById("user-dropdown").classList.remove("open");
  var modal = document.getElementById("stats-modal");
  var cnt = document.getElementById("stats-content");
  modal.classList.add("open");

  // Calculate stats
  var totalRecipes = S.recipes.length;
  var myRecipes = S.recipes.filter(function(r){ return !r.createdBy || r.createdBy === (S.user&&S.user.uid); }).length;
  var othersRecipes = totalRecipes - myRecipes;

  // Recipes planned this week
  var weekEntries = getWeekEntries();
  var weekRecipeNames = weekEntries.map(function(e){ return e.recipe.name; });
  var uniqueWeekRecipes = weekEntries.filter(function(e,i,a){
    return a.findIndex(function(x){ return x.recipe.id===e.recipe.id; })===i;
  }).length;

  // Total ingredients across all recipes
  var totalIngs = S.recipes.reduce(function(sum,r){ return sum+(r.ingredients||[]).filter(function(i){return i.name;}).length; },0);

  // Average prep time
  var timesWithMinutes = S.recipes.filter(function(r){ return r.prepTime; }).map(function(r){
    var match = r.prepTime.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }).filter(Boolean);
  var avgTime = timesWithMinutes.length ? Math.round(timesWithMinutes.reduce(function(a,b){return a+b;},0)/timesWithMinutes.length) : null;

  // Fastest and longest recipe
  var withTimes = S.recipes.filter(function(r){
    return r.prepTime && r.prepTime.match(/(\d+)/);
  }).map(function(r){
    return { name: r.name, mins: parseInt(r.prepTime.match(/(\d+)/)[1]) };
  });
  withTimes.sort(function(a,b){return a.mins-b.mins;});
  var fastest = withTimes[0];
  var longest = withTimes[withTimes.length-1];

  function statCard(icon, label, value, sub) {
    return '<div style="background:var(--green-faint);border-radius:12px;padding:14px 16px;border:1px solid var(--border)">'
      +'<div style="font-size:20px;margin-bottom:4px">'+icon+'</div>'
      +'<div style="font-size:22px;font-weight:800;color:var(--green-darkest)">'+value+'</div>'
      +'<div style="font-size:13px;font-weight:600;color:var(--text-sub)">'+label+'</div>'
      +(sub?'<div style="font-size:11px;color:var(--text-muted);margin-top:2px">'+sub+'</div>':"")
      +'</div>';
  }

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">'
    + statCard("&#128214;","Rezepte gesamt",totalRecipes,"davon "+myRecipes+" von dir")
    + statCard("&#128203;","Zutaten gesamt",totalIngs,"&Oslash; "+(totalRecipes?Math.round(totalIngs/totalRecipes):0)+" pro Rezept")
    + statCard("&#128197;","Diese Woche geplant",weekEntries.length,uniqueWeekRecipes+" verschiedene Gerichte")
    + statCard("&#9201;","&Oslash; Zubereitungszeit",avgTime?avgTime+" min":"–","")
    +'</div>';

  if (fastest && longest && fastest.name !== longest.name) {
    html += '<div style="background:var(--surface);border-radius:12px;padding:14px 16px;border:1.5px solid var(--border);margin-bottom:10px">'
      +'<p style="font-size:11px;font-weight:800;color:var(--green-darkest);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Schnellstes &amp; l&auml;ngstes Rezept</p>'
      +'<div style="display:flex;justify-content:space-between;gap:12px">'
      +'<div><div style="font-size:18px">&#9889;</div><div style="font-weight:700;font-size:14px">'+esc(fastest.name)+'</div><div style="font-size:12px;color:var(--text-muted)">'+fastest.mins+' min</div></div>'
      +'<div style="text-align:right"><div style="font-size:18px">&#9203;</div><div style="font-weight:700;font-size:14px">'+esc(longest.name)+'</div><div style="font-size:12px;color:var(--text-muted)">'+longest.mins+' min</div></div>'
      +'</div></div>';
  }

  if (othersRecipes > 0) {
    html += '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:6px 0">'
      +'&#128101; '+othersRecipes+' Rezept'+(othersRecipes>1?"e":"")+" von anderen Nutzern in der Datenbank"
      +'</div>';
  }

  cnt.innerHTML = html;
};
window.closeStatsModal = function() { document.getElementById("stats-modal").classList.remove("open"); };
window.onStatsModalBgClick = function(e) { if(e.target===document.getElementById("stats-modal")) window.closeStatsModal(); };

// ── Password modal ──────────────────────────────────────────────────────────
window.openPwModal = function() {
  document.getElementById("user-dropdown").classList.remove("open");
  document.getElementById("pw-new").value = "";
  document.getElementById("pw-confirm").value = "";
  document.getElementById("pw-status").textContent = "";
  document.getElementById("pw-modal").classList.add("open");
};
window.closePwModal = function() { document.getElementById("pw-modal").classList.remove("open"); };
window.onPwModalBgClick = function(e) { if(e.target===document.getElementById("pw-modal")) window.closePwModal(); };

window.submitPwChange = async function() {
  var newPw = document.getElementById("pw-new").value;
  var confirmPw = document.getElementById("pw-confirm").value;
  var statusEl = document.getElementById("pw-status");

  if (!newPw || newPw.length < 6) {
    statusEl.textContent = "Passwort muss mindestens 6 Zeichen haben.";
    statusEl.style.color = "var(--danger)";
    return;
  }
  if (newPw !== confirmPw) {
    statusEl.textContent = "Passwörter stimmen nicht überein.";
    statusEl.style.color = "var(--danger)";
    return;
  }

  statusEl.textContent = "Wird gespeichert…";
  statusEl.style.color = "var(--text-muted)";

  try {
    await updatePassword(auth.currentUser, newPw);
    statusEl.textContent = "Passwort erfolgreich geändert! ✓";
    statusEl.style.color = "var(--green-dark)";
    setTimeout(function(){ window.closePwModal(); }, 1500);
  } catch(e) {
    var msg = e.code === "auth/requires-recent-login"
      ? "Bitte melde dich erneut an um das Passwort zu ändern."
      : e.message;
    statusEl.textContent = msg;
    statusEl.style.color = "var(--danger)";
  }
};

// ── Substitute modal ──────────────────────────────────────────────────────
var _subData = [];

window.triggerSub = function(btn) {
  var idx = parseInt(btn.getAttribute("data-idx"));
  var d = _subData[idx];
  if (d) window.openSubModal(d.ingredient, d.amount, d.unit, d.recipeName, d.others);
};

window.openSubModal = async function(ingredient, amount, unit, recipeName, otherIngs) {
  var modal = document.getElementById("sub-modal");
  var cnt = document.getElementById("sub-modal-content");
  var title = document.getElementById("sub-modal-title");
  if (!modal || !cnt) return;
  title.textContent = "Alternativen für " + ingredient;
  cnt.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:14px"><div class="spinner spinner-sm"></div> Alternativen werden gesucht…</div>';
  modal.classList.add("open");
  try {
    var res = await apiPost("/api/substitute", { ingredient: ingredient, amount: amount, unit: unit, recipeName: recipeName, recipeIngredients: otherIngs, uid: S.user.uid });
    var data = await res.json();
    if (!res.ok || !data.alternatives) {
      cnt.innerHTML = '<p style="color:var(--danger);font-size:14px">' + esc(data.error||"Fehler.") + '</p>';
      return;
    }
    var html = "";
    data.alternatives.forEach(function(alt) {
      html += '<div class="alt-card"><div class="alt-name">' + esc(alt.name) + '</div>'
        + (alt.amount ? '<div class="alt-amount">Menge: ' + esc(alt.amount) + '</div>' : '')
        + '<div class="alt-note">' + esc(alt.note) + '</div></div>';
    });
    cnt.innerHTML = html;
  } catch(e) {
    cnt.innerHTML = '<p style="color:var(--danger);font-size:14px">Fehler: ' + esc(e.message) + '</p>';
  }
};

window.closeSubModal = function() { var m=document.getElementById("sub-modal"); if(m) m.classList.remove("open"); };
window.onSubModalBgClick = function(e) { if(e.target===document.getElementById("sub-modal")) window.closeSubModal(); };

// ── Allergen detection ─────────────────────────────────────────────────────
var ALLERGENS = [
  {
    id: "gluten",
    name: "Gluten",
    icon: "🌾",
    keywords: ["mehl","weizenmehl","vollkornmehl","nudeln","spaghetti","penne","fusilli","tagliatelle","lasagne","gnocchi","spätzle","spatzle","brot","toast","brötchen","semmelbroesel","paniermehl","panko","couscous","dinkel","roggen","gerste","hafer","haferflocken","weizen","backpulver","hefe","tortilla","wrap","croissant","brezel"]
  },
  {
    id: "eier",
    name: "Eier",
    icon: "🥚",
    keywords: ["ei","eier","eigelb","eiweiss","eiweißreich","mayonnaise"]
  },
  {
    id: "milch",
    name: "Milch/Laktose",
    icon: "🥛",
    keywords: ["milch","vollmilch","magermilch","butter","sahne","schlagsahne","saure sahne","schmand","creme fraiche","joghurt","quark","magerquark","frischkäse","frischkase","philadelphia","käse","kase","gouda","emmentaler","parmesan","mozzarella","feta","ricotta","mascarpone","brie","kondensmilch","buttermilch","ghee","lachs"]
  },
  {
    id: "erdnuesse",
    name: "Erdnüsse",
    icon: "🥜",
    keywords: ["erdnuss","erdnüsse","erdnusse","erdnussbutter","peanut"]
  },
  {
    id: "schalenfruechte",
    name: "Schalenfrüchte",
    icon: "🌰",
    keywords: ["mandeln","walnüsse","walnusse","haselnüsse","haselnusse","cashews","pistazien","macadamia","pinienkerne","pekanüsse","paranüsse","kokosnuss","kokos"]
  },
  {
    id: "soja",
    name: "Soja",
    icon: "🫘",
    keywords: ["soja","sojasosse","sojasoße","sojasauce","tofu","tempeh","edamame","sojamilch","miso"]
  },
  {
    id: "fisch",
    name: "Fisch",
    icon: "🐟",
    keywords: ["lachs","lachsfilet","thunfisch","kabeljau","forelle","hering","sardinen","makrele","tilapia","fischsauce","worcester","worcestershire","anchovis"]
  },
  {
    id: "krebstiere",
    name: "Krebstiere",
    icon: "🦐",
    keywords: ["garnelen","krabben","hummer","krebs","shrimp"]
  },
  {
    id: "weichtiere",
    name: "Weichtiere",
    icon: "🦑",
    keywords: ["tintenfisch","oktopus","muscheln","auster","austernsosse","austernsoße","schnecken","kalmar"]
  },
  {
    id: "sesam",
    name: "Sesam",
    icon: "🌱",
    keywords: ["sesam","sesamöl","sesamol","tahin","tahini"]
  },
  {
    id: "sellerie",
    name: "Sellerie",
    icon: "🥬",
    keywords: ["sellerie","stangensellerie","knollensellerie"]
  },
  {
    id: "senf",
    name: "Senf",
    icon: "🟡",
    keywords: ["senf","dijonsenf","mustard"]
  },
  {
    id: "lupinen",
    name: "Lupinen",
    icon: "🌿",
    keywords: ["lupine","lupinenmehl"]
  },
  {
    id: "schwefel",
    name: "Schwefeldioxid",
    icon: "🍷",
    keywords: ["wein","rotwein","weisswein","weißwein","weinessig","balsamico","trockenfrüchte","rosinen","sultaninen"]
  }
];

function detectAllergens(ingredients) {
  var found = [];
  var ingText = ingredients
    .filter(function(i){ return i.name; })
    .map(function(i){ return i.name.toLowerCase(); })
    .join(" ");

  ALLERGENS.forEach(function(allergen) {
    var hit = allergen.keywords.some(function(kw) {
      return ingText.indexOf(kw) >= 0;
    });
    if (hit) found.push(allergen);
  });
  return found;
}

function allergenBoxHtml(ingredients) {
  var allergens = detectAllergens(ingredients);
  if (allergens.length === 0) {
    return '<div style="margin-top:24px;padding:14px 16px;background:var(--accent-faint);border-radius:12px;border:1px solid var(--accent-light)">'
      +'<p style="font-size:12px;font-weight:700;color:var(--accent-dark);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Allergene</p>'
      +'<p style="font-size:13px;color:var(--accent)">&#10003; Keine der 14 EU-Hauptallergene erkannt</p>'
      +'<p style="font-size:11px;color:#6B7280;margin-top:4px">Angaben ohne Gewähr – bitte Zutaten selbst prüfen.</p>'
      +'</div>';
  }
  var tags = allergens.map(function(a){
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border-2);border-radius:20px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--text-2)">'
      +a.icon+' '+a.name+'</span>';
  }).join("");
  return '<div style="margin-top:24px;padding:14px 16px;background:var(--surface-2);border-radius:12px;border:1px solid var(--border)">'
    +'<p style="font-size:12px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">&#9888; Enthält Allergene</p>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'+tags+'</div>'
    +'<p style="font-size:11px;color:#6B7280">Basierend auf den 14 EU-Hauptallergenen. Angaben ohne Gewähr.</p>'
    +'</div>';
}

// ── Weekly nutrition ────────────────────────────────────────────────────────
async function fetchNutritionForRecipe(recipe, portions) {
  var base = parseInt(recipe.servings) || 1;
  var ings = (recipe.ingredients||[]).filter(function(i){ return i.name && i.amount; })
    .map(function(i){ return { name: i.name, amount: i.amount, unit: i.unit }; });
  if (ings.length === 0) return null;
  try {
    var res = await apiPost("/api/nutrition", { ingredients: ings, servings: base, uid: S.user.uid });
    var data = await res.json();
    if (!res.ok || !data.perServing) return null;
    // Scale to requested portions then divide by portions = per person
    var scale = portions / base;
    return {
      kcal:    Math.round(data.perServing.kcal),
      protein: Math.round(data.perServing.protein * 10) / 10,
      carbs:   Math.round(data.perServing.carbs * 10) / 10,
      fat:     Math.round(data.perServing.fat * 10) / 10,
    };
  } catch(e) { return null; }
}

async function loadWeekNutrition() {
  // Load one at a time to avoid overwhelming the API
  for (var di = 0; di < DAYS.length; di++) {
    var day = DAYS[di];
    for (var mi = 0; mi < MEALS.length; mi++) {
      var meal = MEALS[mi];
      var key = day + "__" + meal;
      var entry = S.weekPlan[key];
      if (!entry) continue;
      var r = entry && entry.recipe ? entry.recipe : entry;
      if (!r || !r.id) continue;
      var portions = entry.portions || parseInt((r.servings)||"1") || 1;
      var cacheKey = r.id + "__" + portions;
      if (S.weekNutritionCache[cacheKey]) continue;
      try {
        var n = await fetchNutritionForRecipe(r, portions);
        if (n) {
          S.weekNutritionCache[cacheKey] = n;
          // Update this day's display
          var el = document.getElementById("day-nutrition-" + day);
          if (el) el.innerHTML = dayNutritionHtml(day);
        }
      } catch(e) { /* skip failed */ }
    }
  }
}

function dayNutritionHtml(day) {
  var totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  var found = false;
  var loading = false;
  MEALS.forEach(function(meal) {
    var key = day + "__" + meal;
    var entry = S.weekPlan[key];
    if (!entry) return;
    var r = entry.recipe || entry;
    var cacheKey = r.id + "__" + entry.portions;
    if (S.weekNutritionCache[cacheKey]) {
      var n = S.weekNutritionCache[cacheKey];
      totals.kcal    += n.kcal;
      totals.protein += n.protein;
      totals.carbs   += n.carbs;
      totals.fat     += n.fat;
      found = true;
    } else {
      loading = true;
    }
  });

  var hasMeals = MEALS.some(function(meal){ return !!S.weekPlan[day+"__"+meal]; });
  if (!hasMeals) return "";

  if (!found && loading) {
    return '<div style="padding:8px 16px 12px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)">'
      +'<div class="spinner spinner-sm"></div> Nährwerte werden berechnet…</div>';
  }

  if (!found) return "";

  var statStyle = 'style="text-align:center;flex:1"';
  var valStyle = 'style="font-size:15px;font-weight:800;color:var(--green-darkest)"';
  var lblStyle = 'style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px"';

  return '<div style="padding:10px 16px 14px;border-top:1px solid var(--border)">'
    +'<p style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">&#127869; Pro Person'+(loading?' <span style=\"font-size:10px\">&#8987;</span>':'')+'</p>'
    +'<div style="display:flex;gap:8px">'
    +'<div '+statStyle+'><div '+valStyle+'>'+Math.round(totals.kcal)+'</div><div '+lblStyle+'>kcal</div></div>'
    +'<div '+statStyle+'><div '+valStyle+'>'+Math.round(totals.protein*10)/10+'</div><div '+lblStyle+'>Eiweiß</div></div>'
    +'<div '+statStyle+'><div '+valStyle+'>'+Math.round(totals.carbs*10)/10+'</div><div '+lblStyle+'>Kohlenhydrate</div></div>'
    +'<div '+statStyle+'><div '+valStyle+'>'+Math.round(totals.fat*10)/10+'</div><div '+lblStyle+'>Fett</div></div>'
    +'</div>'
    +(loading?'<p style="font-size:10px;color:var(--text-muted);margin-top:4px">⏳ Einige Werte werden noch geladen…</p>':'')
    +'</div>';
}

// ── Wine recommendation ────────────────────────────────────────────────────
var _wineCache = {};

window.recalcNutritionNow = async function() {
  var r = S.viewing; if (!r) return;
  S.nutritionLoading = true; S.nutrition = null; renderNutritionBox();
  try {
    var ings = (r.ingredients||[]).filter(function(i){return i.name && i.amount;}).map(function(i){return {name:i.name,amount:i.amount,unit:i.unit};});
    var res = await apiPost("/api/nutrition", {ingredients: ings, servings: r.servings || 1, uid: S.user.uid});
    var data = await res.json();
    if (res.ok && data.total) {
      r.nutrition = { total: data.total, baseServings: parseInt(r.servings)||1 };
      // Im Hintergrund auch in Firebase speichern, damit es dauerhaft gespeichert bleibt
      var saveData = Object.assign({}, r); var rid = saveData.id; delete saveData.id;
      Object.keys(saveData).forEach(function(k){ if(saveData[k]===undefined) delete saveData[k]; });
      await setDoc(doc(db, "recipes", rid), saveData);
      toast("N\u00e4hrwerte berechnet und gespeichert \u2713");
    }
  } catch(e) {}
  S.nutritionLoading = false;
  loadNutritionScaled(r, S.scaledPortions || parseInt(r.servings) || 1);
};

window.loadWineRecommendation = async function() {
  var r = S.viewing; if (!r) return;
  var el = document.getElementById("wine-box");
  if (!el) return;

  var cacheKey = r.id;
  if (_wineCache[cacheKey]) {
    el.innerHTML = wineBoxHtml(_wineCache[cacheKey]);
    return;
  }

  el.innerHTML = '<div class="wine-loading"><div class="spinner spinner-sm"></div> Weinempfehlung wird geladen…</div>';

  try {
    var res = await apiPost("/api/wine", { name: r.name, description: r.description, ingredients: r.ingredients, tags: r.tags, uid: S.user.uid });
    var data = await res.json();
    if (!res.ok || !data.wines) {
      el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Keine Empfehlung verfügbar.</p>';
      return;
    }
    _wineCache[cacheKey] = data.wines;
    el.innerHTML = wineBoxHtml(data.wines);
  } catch(e) {
    el.innerHTML = '<p style="font-size:13px;color:var(--danger)">Fehler: ' + e.message + '</p>';
  }
};

window.addWineByIndex = function(idx) {
  var d = _wineCache["__btn__" + idx];
  if (d) window.addWineToList(d.grape, d.type, d.region);
};

window.addWineToList = function(grape, type, region) {
  var label = (grape||'') + (type ? ' (' + type + ')' : '');
  if (!label.trim()) { toast('Kein Wein ausgewählt'); return; }
  var exists = S.wineList.some(function(w){ return w.label === label; });
  if (exists) { toast(label + ' bereits auf der Liste ✓'); return; }
  S.wineList.push({ label: label, region: region||'', done: false });
  fbSaveWineList();
  toast('✓ ' + label + ' zur Einkaufsliste hinzugefügt');
};

function wineBoxHtml(wines) {
  var html = '';
  wines.forEach(function(w, wi) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.style.cssText = 'margin-top:10px;background:#EDE9FE;color:#5B21B6;border:none';
    btn.textContent = '+ Zur Einkaufsliste';
    btn._wGrape = w.grape; btn._wType = w.type; btn._wRegion = w.region;
    btn.onclick = function() { window.addWineToList(this._wGrape, this._wType, this._wRegion); };
    var btnHtml = '__WINE_BTN_' + wi + '__';
    html += '<div class="wine-card">'
      + '<div class="wine-header"><span class="wine-type">&#127863; ' + esc(w.type) + '</span><span class="wine-price">' + esc(w.price) + '</span></div>'
      + '<div class="wine-grape">' + esc(w.grape) + '</div>'
      + '<div class="wine-region">&#128205; ' + esc(w.region) + '</div>'
      + '<div class="wine-note">' + esc(w.note) + '</div>'
      + '<div id="wine-btn-' + wi + '" style="margin-top:10px"></div>'
      + '</div>';
    // Store button for later attachment
    _wineCache['__btn__' + wi] = { grape: w.grape, type: w.type, region: w.region, btn: btn };
  });
  // Attach buttons after render
  setTimeout(function() {
    wines.forEach(function(w, wi) {
      var slot = document.getElementById('wine-btn-' + wi);
      var d = _wineCache['__btn__' + wi];
      if (slot && d) {
        var b = document.createElement('button');
        b.className = 'btn btn-sm';
        b.style.cssText = 'background:#EDE9FE;color:#5B21B6;border:none';
        b.textContent = '+ Zur Einkaufsliste';
        b.onclick = (function(grape, type, region) {
          return function() { window.addWineToList(grape, type, region); };
        })(d.grape, d.type, d.region);
        slot.appendChild(b);
      }
    });
  }, 50);
  return html;
}

// ── Render ─────────────────────────────────────────────────────────────────
function pushState(){
  var state={tab:S.tab,view:S.view,viewingId:S.viewing?S.viewing.id:null};
  var url="?tab="+S.tab+(S.view!=="list"?"&view="+S.view:"")+(S.viewing?"&id="+S.viewing.id:"");
  history.pushState(state,"",url);
}
window.addEventListener("popstate",function(e){
  if(!e.state) return;
  S.tab=e.state.tab||"recipes";S.view=e.state.view||"list";S.nutrition=null;
  if(e.state.viewingId){S.viewing=S.recipes.find(function(r){return r.id===e.state.viewingId;})||null;}
  else{S.viewing=null;}
  S.editing=null;
  ["recipes","week","shopping"].forEach(function(t){document.getElementById("nav-"+t).classList.toggle("active",t===S.tab);});
  renderOnly();
});

function renderOnly(){
  document.getElementById("loading").style.display="none";
  document.getElementById("app").style.display="flex";
  var el=document.getElementById("content");
  if(S.tab==="recipes"){
    if(S.view==="list") el.innerHTML=tplList();
    else if(S.view==="form") el.innerHTML=tplForm();
    else if(S.view==="detail") el.innerHTML=tplDetail();
  } else if(S.tab==="week"){
    el.innerHTML=tplWeek();
  } else if(S.tab==="whatcook"){
    el.innerHTML=tplWhatCook();
  } else {
    el.innerHTML=tplShopping();
  }
}
function render(){renderOnly();pushState();}

// ── Templates ──────────────────────────────────────────────────────────────
function tplList(){
  var q=S.search.toLowerCase();
  var list=S.recipes.filter(function(r){
    if(r.name.toLowerCase().indexOf(q)<0) return false;
    if(S.activeFilters.length>0){
      var rTags=r.tags||[];
      var allMatch=S.activeFilters.every(function(f){return rTags.indexOf(f)>=0;});
      if(!allMatch) return false;
    }
    return true;
  });
  // Sortierung
  list = list.slice();
  if (S.sortBy === "newest") {
    list.sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  } else if (S.sortBy === "oldest") {
    list.sort(function(a,b){ return (a.createdAt||0) - (b.createdAt||0); });
  } else if (S.sortBy === "az") {
    list.sort(function(a,b){ return a.name.localeCompare(b.name,"de"); });
  } else if (S.sortBy === "za") {
    list.sort(function(a,b){ return b.name.localeCompare(a.name,"de"); });
  }
  var cards="";
  if(list.length===0){
    cards='<div class="empty"><div class="empty-icon">&#128214;</div><h3>'+(S.search?"Keine Treffer":"Noch keine Rezepte")+'</h3><p>'+(S.search?"Anderen Begriff versuchen.":"F&uuml;ge dein erstes Rezept hinzu!")+'</p></div>';
  } else {
    list.forEach(function(r){
      var ings=(r.ingredients||[]).filter(function(i){return i.name;}).length;
      var owner=isOwner(r);
      var _rps = safePhotoSrc(r.photo);
      var thumb = _rps ? '<img src="'+_rps+'" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0" />' : '';
      var rStats = ratingStats(r);
      cards+='<div class="card recipe-card" onclick="doView(\''+r.id+'\')"><div class="recipe-card-top">'
        +thumb
        +'<div class="recipe-card-body">'
        +'<div class="recipe-name">'+esc(r.name)+'</div>'
        +(rStats.count?'<div style="margin-bottom:4px">'+starsDisplayHtml(rStats.avg,rStats.count)+'</div>':"")
        +(r.description?'<div class="recipe-desc">'+esc(r.description)+'</div>':"")
        +'<div class="recipe-meta">'
        +(r.servings?'<span>'+svg(I.users,12)+' '+esc(r.servings)+' Portionen</span>':"")
        +(r.prepTime?'<span>'+svg(I.clock,12)+' '+esc(r.prepTime)+'</span>':"")
        +'<span>'+ings+' Zutaten</span></div>'
        +(r.createdByName&&!owner?'<div class="recipe-author">von '+esc(r.createdByName)+'</div>':"")
        +((r.tags&&r.tags.length)?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">'+(r.tags||[]).slice(0,4).map(function(t){return tagHtml(t,false,false);}).join("")+'</div>':"")
        +'</div>'
        +'<div class="card-actions" onclick="event.stopPropagation()">'
        +(owner?'<button class="btn btn-ghost btn-icon" onclick="doEdit(\''+r.id+'\')" title="Bearbeiten">'+svg(I.edit)+'</button>':'')
        +(owner?'<button class="btn btn-danger btn-icon" onclick="doDelete(\''+r.id+'\')" title="L&ouml;schen">'+svg(I.trash)+'</button>':'<span title="Nur der Ersteller kann dieses Rezept bearbeiten" style="padding:6px;color:var(--text-muted)">'+svg(I.lock,15)+'</span>')
        +'</div></div></div>';
    });
  }
  var hasFilters = S.activeFilters.length > 0;
  var sortLabels = {newest:"Neueste zuerst",oldest:"Älteste zuerst",az:"A → Z",za:"Z → A"};
  var sortSelect = '<select class="inp inp-sm" style="width:auto;padding:8px 10px" onchange="setSortBy(this.value)">'
    + Object.keys(sortLabels).map(function(k){return '<option value="'+k+'"'+(S.sortBy===k?' selected':'')+'>'+sortLabels[k]+'</option>';}).join('')
    + '</select>';
  var hasFilters = S.activeFilters.length > 0;
  return '<div class="section-hd"><h2>Rezepte <span style="color:var(--text-muted);font-weight:400;font-size:16px">('+list.length+(S.recipes.length!==list.length?'/'+S.recipes.length:'')+')</span></h2>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +sortSelect
    +'<button class="btn btn-secondary" onclick="toggleFilterPanel()" style="'+(S.filterOpen||hasFilters?'background:var(--green-light);color:var(--green-darkest)':'')+'">&#9878; Filter'+(hasFilters?' ('+S.activeFilters.length+')':'')+'</button>'
    +'<button class="btn btn-secondary" onclick="openImportModal()">&#128203; Importieren</button>'
    +'<button class="btn btn-primary" onclick="doNew()">'+svg(I.plus)+' Neu</button></div></div>'
    +'<div class="search-wrap"><span class="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>'
    +'<input class="search-input" id="recipe-search-input" placeholder="Rezepte durchsuchen\u2026" value="'+esc(S.search)+'" oninput="debouncedSearch(this.value)" /></div>'
    +(S.filterOpen ? filterPanel() : '')
    +'<div class="recipe-grid">'+cards+'</div>';
}

function tplDetail(){
  var r=S.viewing; if(!r) return "";
  var rStats = ratingStats(r);
  var ings=sortIngredientsForDisplay((r.ingredients||[]).filter(function(i){return i.name;}));
  var steps=(r.steps||[]).filter(function(s){return s.text;});
  var basePortions = parseInt(r.servings)||1;
  var scaledBase = S.scaledPortions || basePortions;
  var scaledIngRows="";
  var otherIngs=ings.map(function(i){return i.name;});
  ings.forEach(function(i,idx2){
    var amt=scaleAmount(i.amount,basePortions,scaledBase);
    scaledIngRows+='<li><span class="ing-dot"></span><span class="ing-amount">'+esc([amt,i.unit].filter(Boolean).join(" ")||"\u2014")+'</span><span style="flex:1">'+esc(i.name)+'</span>'
      +'<button class="sub-btn" data-idx="'+idx2+'">Ersetzen?</button></li>';
  });
  var ingRows=scaledIngRows;
  var stepRows="";
  steps.forEach(function(s,idx){stepRows+='<li class="step-item"><div class="step-num">'+(idx+1)+'</div><p class="step-text">'+esc(s.text)+'</p></li>';});
  var bringItems=JSON.stringify(ings.map(function(i){return {name:i.name,amount:[i.amount,i.unit].filter(Boolean).join(" ")};}));
  var owner=isOwner(r);
  var _r=r; var _scaled=scaledBase;
  var _ings=ings; var _rname=r.name;
  setTimeout(function(){
    loadNutritionScaled(_r,_scaled);
    // Store sub data globally and attach click handlers
    _subData = _ings.map(function(ing,i){
      return {
        ingredient: ing.name,
        amount: scaleAmount(ing.amount, parseInt(_r.servings)||1, _scaled)||"",
        unit: ing.unit||"",
        recipeName: _rname,
        others: _ings.filter(function(_,j){return j!==i;}).map(function(x){return x.name;})
      };
    });
    document.querySelectorAll(".sub-btn").forEach(function(btn){
      btn.onclick = function(){ window.triggerSub(btn); };
    });
  },50);
  var _dps = safePhotoSrc(r.photo);
  var photoHtml = _dps ? '<img src="'+_dps+'" style="width:100%;max-height:340px;object-fit:cover;border-radius:14px;margin-bottom:20px" />' : '';
  return '<button class="btn btn-ghost btn-sm" onclick="doBack()" style="margin-bottom:20px">'+svg(I.back)+' Zur&uuml;ck</button>'
    +'<div class="card detail-card">'
    +photoHtml
    +'<h1 class="detail-title">'+esc(r.name)+'</h1>'
    +'<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px">'
    +starsDisplayHtml(rStats.avg, rStats.count)
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<span style="font-size:12px;color:var(--text-muted)">Deine Bewertung:</span>'
    +starPickerHtml(r.id, rStats.mine)
    +'</div></div>'
    +(r.description?'<p class="detail-desc">'+esc(r.description)+'</p>':"")
    +'<div class="detail-meta">'
    +(r.prepTime?'<span>'+svg(I.clock,16)+' '+esc(r.prepTime)+'</span>':"")
    +(r.createdByName?'<span style="font-size:12px;color:var(--text-muted)">von '+esc(r.createdByName)+'</span>':"")
    +'</div>'
    +((r.tags&&r.tags.length)?'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px">'+(r.tags||[]).map(function(t){return tagHtml(t,false,false);}).join('')+'</div>':"")
    +'<div style="display:flex;align-items:center;gap:14px;background:var(--green-faint);border-radius:12px;padding:14px 18px;margin-bottom:24px;flex-wrap:wrap">'
    +'<span style="font-size:13px;font-weight:700;color:var(--green-darkest)">'+svg(I.users,15)+' Portionen:</span>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<button onclick="setScaledPortions('+(scaledBase-1>0?scaledBase-1:1)+')" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:700;color:var(--green-dark)">&#8722;</button>'
    +'<span id="portions-display" style="font-size:18px;font-weight:800;color:var(--green-darkest);min-width:28px;text-align:center">'+scaledBase+'</span>'
    +'<button onclick="setScaledPortions('+(scaledBase+1)+')" style="width:30px;height:30px;border-radius:50%;border:1.5px solid var(--border);background:var(--surface);font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:700;color:var(--green-dark)">&#43;</button>'
    +'</div>'
    +(scaledBase !== basePortions ? '<span style="font-size:12px;color:var(--text-muted)">(Originalrezept: '+basePortions+' Portion'+(basePortions>1?'en':'')+')</span>' : '')
    +'</div>'
    +(steps.length ? '<button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:20px;padding:14px;font-size:15px" onclick="startCookMode()">'+svg(I.pot,18)+' Kochmodus starten</button>' : '')
    +'<div class="nutrition-box" id="nutrition-box"><div class="nutrition-loading"><div class="spinner spinner-sm"></div> N&auml;hrwerte werden berechnet&hellip;</div></div>'
    +(function(){
      var missing = findMissingIngredientMentions(steps.map(function(s){return s.text;}).join(" "), ings.map(function(i){return i.name;}));
      return missing.length ? '<div class="ing-warning"><span>&#9888;&#65039;</span><span>In der Zubereitung erw&auml;hnt, aber nicht in der Zutatenliste: <strong>'+esc(missing.join(", "))+'</strong>. Vielleicht ergänzen?</span></div>' : "";
    })()
    +'<p class="section-label">Zutaten</p><ul class="ingredient-list" id="scaled-ingredients">'+scaledIngRows+'</ul>'
    +'<p class="section-label">Zubereitung</p><ol class="steps-list">'+stepRows+'</ol>'
    +'<div class="detail-actions">'
    +(owner?'<button class="btn btn-secondary" onclick="doEdit(\''+r.id+'\')">'+svg(I.edit)+' Bearbeiten</button>':"")
    +'<button class="btn btn-secondary" onclick="doCopyDetail()">'+svg(I.copy)+' Kopieren</button>'
    +'<button class="btn btn-secondary" onclick="doDlDetail()">'+svg(I.dl)+' Als .txt</button>'
    +'<button class="btn btn-bring" onclick="openBringModal('+esc(bringItems)+')">&#127819; Nach Bring</button>'
    +'<button class="btn btn-secondary" onclick="doDetailToWeek()">'+svg(I.cal)+' Zum Wochenplan</button>'
    +'</div>'
    +'<div class="wine-box" style="margin-bottom:16px"><div id="wine-box"><button class="btn" style="background:var(--surface-2);color:var(--text-2);border:1.5px solid var(--border)" onclick="loadWineRecommendation()">&#127863; Weinempfehlung anzeigen</button></div></div>'
    +allergenBoxHtml(ings)
    +'</div>';
}

function tplForm(){
  var r=S.editing||{id:null,name:"",description:"",servings:"2",prepTime:"",ingredients:[{id:uid(),amount:"",unit:"",name:""}],steps:[{id:uid(),text:""}]};
  var ingRows="";
  (r.ingredients||[]).forEach(function(ing){
    ingRows+='<div class="ing-row" data-ing="'+ing.id+'">'
      +'<input class="inp inp-sm" data-f="amount" value="'+esc(ing.amount)+'" placeholder="Menge" onkeydown="handleIngKeydown(event,this)" />'
      +buildUnitSelect(ing.unit)
      +'<input class="inp inp-sm" data-f="name" value="'+esc(ing.name)+'" placeholder="Zutat" onkeydown="handleIngKeydown(event,this)" />'
      +'<button class="remove-btn" onclick="removeIng(\''+ing.id+'\')">'+svg(I.x,14)+'</button></div>';
  });
  var stepRows="";
  (r.steps||[]).forEach(function(s,idx){
    stepRows+='<div class="step-row" data-step="'+s.id+'">'
      +'<div class="step-row-num">'+(idx+1)+'</div>'
      +'<textarea class="inp" rows="2" data-f="text" style="flex:1;resize:vertical" placeholder="Schritt '+(idx+1)+'\u2026" onkeydown="handleStepKeydown(event,this)">'+esc(s.text)+'</textarea>'
      +'<button class="remove-btn" onclick="removeStep(\''+s.id+'\')" style="margin-top:6px">'+svg(I.x,14)+'</button></div>';
  });
  var eid=esc(r.id||"");
  var photoSection = '<div class="field col2"><label>Foto</label>'
    + '<div id="photo-preview-wrap" style="' + (r.photo?'':'display:none') + ';margin-bottom:10px">'
    + '<img id="photo-preview" src="' + (r.photo||'') + '" style="max-width:100%;max-height:220px;border-radius:12px;border:1.5px solid var(--border);display:block" />'
    + '<button type="button" class="btn btn-ghost btn-sm" onclick="removePhoto()" style="margin-top:6px;color:var(--danger)">&#10005; Foto entfernen</button>'
    + '</div>'
    + '<div id="photo-drop" style="border:2px dashed var(--border);border-radius:12px;padding:20px;text-align:center;cursor:pointer;' + (r.photo?'display:none':'') + '" onclick="document.getElementById(\'f-photo\').click()" ondragover="event.preventDefault()" ondrop="onPhotoDrop(event)">'
    + '<div style="font-size:28px;margin-bottom:6px">&#128247;</div>'
    + '<p style="font-size:13px;color:var(--text-muted)">Foto hochladen oder hineinziehen</p>'
    + '</div>'
    + '<input type="file" id="f-photo" accept="image/*" style="display:none" onchange="onPhotoSelected(event)" />'
    + '</div>';

  return '<h2 style="font-size:22px;font-weight:800;margin-bottom:20px">'+(r.id?"Rezept bearbeiten":"Neues Rezept")+'</h2>'
    +'<div class="card form-card"><div class="form-grid">'
    +photoSection
    +'<div class="field col2"><label>Rezeptname *</label><input class="inp" id="f-name" value="'+esc(r.name)+'" placeholder="z.B. Spaghetti Carbonara" /></div>'
    +'<div class="field"><label>Portionen</label><input class="inp" id="f-srv" type="number" value="'+esc(r.servings)+'" /></div>'
    +'<div class="field"><label>Zubereitungszeit</label><input class="inp" id="f-time" value="'+esc(r.prepTime||"")+'" placeholder="z.B. 30 min" /></div>'
    +'<div class="field col2"><label>Kurzbeschreibung</label><textarea class="inp" id="f-desc" rows="2" style="resize:vertical" placeholder="Was macht dieses Rezept besonders?">'+esc(r.description||"")+'</textarea></div>'
    +((r.tags&&r.tags.length)?'<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">'+(r.tags||[]).map(function(t){return tagHtml(t,false,false);}).join('')+'</div>':'')
    +'</div>'
    +'<div class="form-section"><div class="form-section-hd"><span class="form-section-label">Zutaten *</span><button class="btn btn-ghost btn-sm" onclick="addIng()">'+svg(I.plus,14)+' Hinzuf&uuml;gen</button></div><div id="ing-list">'+ingRows+'</div></div>'
    +'<div class="form-section"><div class="form-section-hd"><span class="form-section-label">Zubereitung *</span><button class="btn btn-ghost btn-sm" onclick="addStep()">'+svg(I.plus,14)+' Schritt</button></div><div id="step-list">'+stepRows+'</div></div>'
    +'<div class="form-footer"><button class="btn btn-secondary" onclick="doBack()">Abbrechen</button><button class="btn btn-primary" onclick="doSave(\''+eid+'\')">'+svg(I.check)+' Speichern</button></div></div>';
}

function tplWeek(){
  var entries=getWeekEntries(); var hasAny=entries.length>0;
  var rows="";
  DAYS.forEach(function(day){
    rows+='<div style="background:var(--surface);border-radius:14px;border:1.5px solid #E4F2E1;margin-bottom:10px;overflow:hidden">'
      +'<div style="padding:10px 16px;font-weight:800;font-size:15px;background:var(--green-faint);border-bottom:1px solid var(--border)">'+day+'</div>';
    MEALS.forEach(function(meal){
      var key=day+"__"+meal;
      var entry=S.weekPlan[key];
      var r=entry?(entry.recipe||entry):null;
      var portions=entry?(entry.portions||parseInt((r||{}).servings)||1):1;
      rows+='<div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--green-faint)">';
      rows+='<span style="font-size:16px;width:24px;text-align:center">'+MEAL_ICONS[meal]+'</span>';
      rows+='<span style="font-size:12px;font-weight:700;color:var(--text-muted);min-width:90px;text-transform:uppercase;letter-spacing:.5px">'+meal+'</span>';
      if(r){
        rows+='<div class="week-tag" style="flex:1">'+esc(r.name)+'</div>';
        rows+='<select class="inp inp-sm" style="width:auto;padding:4px 8px;font-size:12px" onchange="setWeekPortions(\x27'+key+'\x27,this.value)">';
        for(var p=1;p<=12;p++){rows+='<option value="'+p+'"'+(p===portions?" selected":"")+'>'+(p>1?p+"x":"1x")+'</option>';}
        rows+='</select>';
        rows+='<button style="background:none;border:none;cursor:pointer;color:#9CA3AF;display:flex;padding:4px" onclick="removeFromWeek(\x27'+key+'\x27)">'+svg(I.x,14)+'</button>';
      } else {
        rows+='<button class="week-empty" style="flex:1" onclick="openWeekModal(\x27'+key+'\x27)">+ Rezept ausw&auml;hlen&hellip;</button>';
      }
      rows+='</div>';
    });
    rows+='<div id="day-nutrition-'+day+'"></div>';
    rows+='</div>';
  });
  var exportBtns="";
  if(hasAny){
    var weekIngs=mergeWeekIngredients();
    var weekBringItems=JSON.stringify(weekIngs.map(function(i){return {name:i.name,amount:[i.amount,i.unit].filter(Boolean).join(" ")};}));
    exportBtns='<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="btn btn-secondary btn-sm" onclick="doCopyWeek()">'+svg(I.copy,14)+' Kopieren</button>'
      +'<button class="btn btn-secondary btn-sm" onclick="doDlWeek()">'+svg(I.dl,14)+' Als .txt</button>'
      +'<button class="btn btn-bring btn-sm" onclick="openBringModal('+esc(weekBringItems)+')">&#127819; Nach Bring</button>'
      +'</div>';
  }
  var combined="";
  if(hasAny){
    var ings=mergeWeekIngredients(); var items="";
    ings.forEach(function(i){items+='<div class="combined-item"><span style="color:var(--green-mid)">&#8226;</span><span>'+esc(fmtIng(i))+'</span></div>';});
    combined='<div class="combined-box"><h3>Einkaufsliste f&uuml;r diese Woche</h3><div class="combined-items">'+items+'</div></div>';
  }
  // Trigger background nutrition load after render
  setTimeout(function(){ loadWeekNutrition(); }, 200);

  return '<div class="section-hd"><h2>Wochenplan</h2>'+exportBtns+'</div>'+rows+combined;
}
function makeShopItem(key, label, done) {
  var safeKey = key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  var checkSvg = done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : '';
  var safeLabel = label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<div class="shop-item' + (done?' done':'') + '" data-key="' + key.replace(/"/g,'&quot;') + '" onclick="toggleShopI(\'' + safeKey + '\')">'
    + '<div class="chk' + (done?' on':'') + '">' + checkSvg + '</div>'
    + '<span>' + safeLabel + '</span>'
    + '</div>';
}

function tplShopping(){
  var entries=getWeekEntries(); var ings=mergeWeekIngredients();

  if(entries.length===0 && S.wineList.length===0){
    return '<h2 style="font-size:22px;font-weight:800;margin-bottom:16px">Einkaufsliste</h2>'
      +'<div class="empty"><div class="empty-icon">&#128722;</div><h3>Noch kein Wochenplan</h3>'
      +'<p>F&uuml;ge zuerst Rezepte zum <span style="color:var(--green-dark);cursor:pointer;text-decoration:underline" onclick="switchTab(\'week\')">Wochenplan</span> hinzu.</p></div>';
  }

  // ── Geplante Rezepte ────────────────────────────────────────────────────
  var recipeList = '';
  if (entries.length > 0) {
    recipeList = '<div style="margin-bottom:20px"><p style="font-size:11px;font-weight:800;color:var(--green-darkest);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Diese Woche geplant</p>';
    entries.forEach(function(entry){
      var r=entry.recipe;
      recipeList+='<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border-radius:10px;border:1.5px solid #E4F2E1;margin-bottom:6px">'
        +(entry.meal?'<span>'+MEAL_ICONS[entry.meal]+'</span>':"")
        +'<span style="font-weight:600;font-size:14px">'+esc(r.name)+'</span>'
        +(entry.day?'<span style="font-size:12px;color:var(--text-muted)">'+esc(entry.day)+'</span>':"")
        +'<span style="font-size:12px;color:var(--text-muted);margin-left:auto">'+entry.portions+'x</span></div>';
    });
    recipeList += '</div>';
  }

  // ── Zutaten Box ─────────────────────────────────────────────────────────
  var shopBringItems = '[]';
  var allItems = '';

  if (ings.length > 0) {
    var bringItems = ings
      .filter(function(i){ return !S.shopChecked[i.name+"__"+(i.unit||"")]; })
      .map(function(i){return {name:i.name,amount:[i.amount,i.unit].filter(Boolean).join(" ")};});
    // Weine auch zur Bring-Liste (nur nicht abgehakte)
    S.wineList.forEach(function(w,idx){ if(!w.done) bringItems.push({name:w.label, amount:"1 Flasche"}); });
    shopBringItems = JSON.stringify(bringItems);
    ings.forEach(function(i){
      var key=i.name+"__"+(i.unit||"");
      var done=!!S.shopChecked[key];
      allItems+=makeShopItem(key, fmtIng(i)||i.name, done);
    });
  }

  // ── Zusammenbauen ────────────────────────────────────────────────────────
  // ── Weine zu allItems hinzufügen ──────────────────────────────────────────
  if (S.wineList.length > 0) {
    if (allItems) allItems += '<div style="height:1px;background:var(--border);margin:10px 0"></div>';
    S.wineList.forEach(function(w, i) {
      var done = w.done;
      allItems += '<div class="shop-item' + (done?' done':'') + '" onclick="toggleWineItem('+i+')">'
        + '<div class="chk' + (done?' on':'') + '">' + (done?svg(I.check,11):'') + ' </div>'
        + '<div style="flex:1"><span>&#127863; ' + esc(w.label) + '</span>'
        + (w.region ? '<span style="font-size:11px;color:var(--text-muted);display:block">' + esc(w.region) + '</span>' : '')
        + '</div>'
        + '<button onclick="removeWineItem('+i+');event.stopPropagation()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px;flex-shrink:0">' + svg(I.x,14) + '</button>'
        + '</div>';
    });
  }

  var label = ings.length > 0 ? 'Zutaten ('+ings.length+')' + (S.wineList.length>0?' + Weine':'') : (S.wineList.length>0?'Weine':'');
  var shopBox = allItems ? '<div class="shop-box"><p style="font-size:11px;font-weight:800;color:var(--green-darkest);text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">'+label+'</p>'+allItems+'</div>' : '';

  var actionBtns = (ings.length > 0 || S.wineList.length > 0) ?
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">'
    +'<button class="btn btn-secondary" onclick="doCopyShopping()">'+svg(I.copy)+' Kopieren</button>'
    +'<button class="btn btn-secondary" onclick="doDlShopping()">'+svg(I.dl)+' Als .txt</button>'
    +(ings.length>0?'<button class="btn btn-bring" onclick="openBringModal('+esc(shopBringItems)+')">&#127819; Nach Bring</button>':"")
    +(S.wineList.length>0?'<button class="btn btn-ghost btn-sm" onclick="clearWineList()" style="color:var(--danger)">&#10005; Weine leeren</button>':"")
    +'</div>' : '';

  return '<h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Einkaufsliste</h2>'
    +'<p style="font-size:14px;color:var(--text-muted);margin-bottom:18px">Basierend auf deinem Wochenplan.</p>'
    +recipeList+shopBox+actionBtns;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openWeekModal(key){
  S.modalMode="week";S.modalDay=key;
  var parts=key.split("__");
  var label=parts[0]+(parts[1]?" – "+parts[1]:"");
  document.getElementById("modal-title").textContent=label;
  document.getElementById("modal-search").style.display="";
  document.getElementById("modal-search").value="";
  document.getElementById("modal").classList.add("open");
  renderModalList("");
  // AI-Vorschläge im Hintergrund laden
  loadWeekSuggestions(key);
}
window.openWeekModal=openWeekModal;

function openDayModal(recipeId){
  S.modalMode="day";S.modalRecipeId=recipeId;
  var r=S.recipes.find(function(x){return x.id===recipeId;});
  document.getElementById("modal-title").textContent=(r?r.name:"")+" → einplanen";
  document.getElementById("modal-search").style.display="none";
  document.getElementById("modal").classList.add("open");
  var html="";
  DAYS.forEach(function(day){
    html+='<div class="day-group"><div class="day-group-hd">'+day+'</div>';
    MEALS.forEach(function(meal){
      var key=day+"__"+meal;
      var entry=S.weekPlan[key];
      var existing=entry?((entry.recipe||entry).name||""):"";
      html+='<button class="day-meal-row'+(existing?' occupied':'')+'" onclick="assignDay(\''+key+'\')">'
        +MEAL_ICONS[meal]+' <span>'+meal+'</span>'
        +(existing?'<span class="week-tag">'+esc(existing)+'</span>':"")
        +'</button>';
    });
    html+='</div>';
  });
  document.getElementById("modal-list").innerHTML=html;
}

window.filterModal=function(q){renderModalList(q);};

var _weekSuggestions = []; // Cache für KI-Vorschläge

async function loadWeekSuggestions(key) {
  _weekSuggestions = [];
  var parts = key.split("__");
  var day = parts[0];
  var meal = parts[1];

  // Alle bereits geplanten Rezepte sammeln
  var planned = [];
  DAYS.forEach(function(d) {
    MEALS.forEach(function(m) {
      var entry = S.weekPlan[d+"__"+m];
      if (!entry) return;
      var r = entry.recipe || entry;
      planned.push({ day: d, meal: m, name: r.name, tags: r.tags||[] });
    });
  });

  if (planned.length === 0 || S.recipes.length === 0) return;

  // Bereits verwendete Rezeptnamen
  var usedNames = planned.map(function(p){ return p.name; });

  // Verfügbare Rezepte (noch nicht diese Woche verwendet)
  var available = S.recipes.filter(function(r){ return usedNames.indexOf(r.name) < 0; });
  if (available.length === 0) available = S.recipes;

  // Prompt für Claude
  var plannedText = planned.map(function(p){
    return p.day + " " + p.meal + ": " + p.name + (p.tags.length?" ("+p.tags.join(", ")+")":"");
  }).join("\n");

  var availableText = available.map(function(r){
    return r.id + "|" + r.name + (r.tags&&r.tags.length?" ("+r.tags.join(", ")+")":"");
  }).join("\n");

  try {
    var res = await apiPost("/api/suggest", { planned: planned, available: available.slice(0,30), day: day, meal: meal, uid: S.user.uid });
    var data = await res.json();
    var suggestions = data.suggestions || [];
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      _weekSuggestions = suggestions.filter(function(s){
        return s.id && S.recipes.find(function(r){ return r.id === s.id; });
      });
      var searchVal = document.getElementById("modal-search");
      if (searchVal) renderModalList(searchVal.value || "");
    }
  } catch(e) { /* Vorschläge konnten nicht geladen werden */ }
}

// Mapping Mahlzeit → passende Tags
var MEAL_TAG_MAP = {
  "Frühstück":  ["Frühstück"],
  "Mittagessen": ["Hauptgericht","Suppe/Eintopf","Salat","Bowl"],
  "Abendessen":  ["Hauptgericht","Suppe/Eintopf","Pasta/Nudeln","Reis/Getreide","Curry","Pfannengericht","Pizza"],
};

function renderModalList(q) {
  var el = document.getElementById("modal-list");
  if (!el) return;
  var lq = q.toLowerCase();
  var list = S.recipes.filter(function(r){ return r.name.toLowerCase().indexOf(lq) >= 0; });
  if (list.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px">Keine Rezepte gefunden.</p>';
    return;
  }

  var mealKey = S.modalDay ? S.modalDay.split("__")[1] : null;
  var matchTags = mealKey ? (MEAL_TAG_MAP[mealKey] || []) : [];

  function recipeBtn(r, reason) {
    var timeSpan = r.prepTime ? '<span style="font-size:12px;color:var(--text-muted)">'+esc(r.prepTime)+'</span>' : '';
    var reasonSpan = reason ? '<span style="font-size:11px;color:var(--green-dark);font-weight:500">'+esc(reason)+'</span>' : timeSpan;
    return '<button class="modal-opt" onclick="assignWeek(\''+r.id+'\')">'+esc(r.name)+reasonSpan+'</button>';
  }

  var usedIds = {};
  var html = "";

  // Section 1: KI-Vorschläge
  if (_weekSuggestions.length > 0) {
    var shown = _weekSuggestions.filter(function(s){
      var r = S.recipes.find(function(x){ return x.id === s.id; });
      return r && r.name.toLowerCase().indexOf(lq) >= 0;
    });
    if (shown.length > 0) {
      html += '<div style="font-size:10px;font-weight:800;color:#7C3AED;text-transform:uppercase;letter-spacing:1px;padding:6px 4px 4px">&#10024; KI-Vorschläge</div>';
      shown.forEach(function(s) {
        var r = S.recipes.find(function(x){ return x.id === s.id; });
        if (r) { html += recipeBtn(r, s.reason); usedIds[r.id] = true; }
      });
      html += '<div style="height:1px;background:var(--border);margin:8px 0"></div>';
    }
  } else if (Object.keys(S.weekPlan).length > 0) {
    html += '<div style="font-size:12px;color:var(--text-muted);padding:6px 4px;display:flex;align-items:center;gap:6px"><div class="spinner spinner-sm"></div> Vorschläge werden berechnet\u2026</div>';
    html += '<div style="height:1px;background:var(--border);margin:8px 0"></div>';
  }

  // Section 2: Passende Rezepte nach Mahlzeit
  var matching = list.filter(function(r){
    if (usedIds[r.id]) return false;
    var t = r.tags || [];
    return matchTags.length > 0 && matchTags.some(function(tag){ return t.indexOf(tag) >= 0; });
  });
  var others = list.filter(function(r){
    if (usedIds[r.id]) return false;
    var t = r.tags || [];
    return !(matchTags.length > 0 && matchTags.some(function(tag){ return t.indexOf(tag) >= 0; }));
  });

  if (matching.length > 0) {
    html += '<div style="font-size:10px;font-weight:800;color:var(--green-darkest);text-transform:uppercase;letter-spacing:1px;padding:6px 4px 4px">'+(mealKey||"Passend")+' ('+matching.length+')</div>';
    matching.forEach(function(r){ html += recipeBtn(r, null); });
  }
  if (others.length > 0) {
    if (matching.length > 0) html += '<div style="height:1px;background:var(--border);margin:8px 0"></div>';
    html += '<div style="font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;padding:4px">Alle anderen ('+others.length+')</div>';
    others.forEach(function(r){ html += recipeBtn(r, null); });
  }

  el.innerHTML = html;
}

window.closeModal=function(){document.getElementById("modal").classList.remove("open");_weekSuggestions=[];};
window.onModalBgClick=function(e){if(e.target===document.getElementById("modal"))window.closeModal();};

window.assignWeek=async function(rid){
  var r=S.recipes.find(function(x){return x.id===rid;});
  if(!r||!S.modalDay)return;
  S.weekPlan[S.modalDay]={recipe:r,portions:parseInt(r.servings)||1};
  await fbSaveWeek();window.closeModal();render();
};
window.removeFromWeek=async function(key){delete S.weekPlan[key];await fbSaveWeek();render();};
window.assignDay=async function(key){
  var r=S.recipes.find(function(x){return x.id===S.modalRecipeId;});
  if(!r)return;
  var portions=S._pendingPortions||parseInt(r.servings)||1;
  S._pendingPortions=null;
  S.weekPlan[key]={recipe:r,portions:portions};
  await fbSaveWeek();window.closeModal();
  var parts=key.split("__");
  toast(r.name+" → "+parts[0]+(parts[1]?" "+parts[1]:"")+" ✓");render();
};
window.setWeekPortions=async function(key,val){
  if(!S.weekPlan[key])return;
  var entry=S.weekPlan[key];
  S.weekPlan[key]=Object.assign({},entry,{portions:Math.max(1,parseInt(val)||1)});
  await fbSaveWeek();render();
};

// ── Actions ────────────────────────────────────────────────────────────────
window.setScaledPortions=function(val){
  S.scaledPortions=Math.max(1,parseInt(val)||1);
  var pd=document.getElementById("portions-display");
  if(pd) pd.textContent=S.scaledPortions;
  // Update minus button
  var btns=document.querySelectorAll("[onclick^='setScaledPortions']");
  btns.forEach(function(btn){
    var v=parseInt(btn.getAttribute("onclick").replace("setScaledPortions(","").replace(")",""));
    btn.setAttribute("onclick","setScaledPortions("+(S.scaledPortions+(btn.textContent.includes("+")?1:-1))+")");
  });
  renderScaledIngredients();
  if(S.viewing) loadNutritionScaled(S.viewing, S.scaledPortions);
};

function scaleAmount(amount, basePortions, scaled) {
  var num = parseFloat(amount);
  if (!num || !basePortions || !scaled) return amount;
  var result = num * scaled / basePortions;
  return result % 1 === 0 ? String(result) : result.toFixed(1).replace(/\.0$/,"");
}

function renderScaledIngredients() {
  var el = document.getElementById("scaled-ingredients");
  if (!el || !S.viewing) return;
  var r = S.viewing;
  var base = parseInt(r.servings) || 1;
  var scaled = S.scaledPortions || base;
  var ings = (r.ingredients||[]).filter(function(i){return i.name;});
  var html = "";
  ings.forEach(function(i){
    var amt = scaleAmount(i.amount, base, scaled);
    html += '<li><span class="ing-dot"></span><span class="ing-amount">'+esc([amt,i.unit].filter(Boolean).join(" ")||"\u2014")+'</span><span>'+esc(i.name)+'</span></li>';
  });
  el.innerHTML = html;
}

window.doNew=function(){S.editing=null;S.view="form";render();};
window.doBack=function(){if(history.length>1){history.back();}else{S.view="list";S.editing=null;S.viewing=null;S.nutrition=null;render();}};
window.doSearch=function(q){S.search=q;renderOnly();};
var _searchTimer=null;
window.debouncedSearch=function(q){
  clearTimeout(_searchTimer);
  _searchTimer=setTimeout(function(){ window.doSearch(q); },400);
};

// ── Batch categorize all recipes ──────────────────────────────────────────

window.doEdit=function(id){S.editing=S.recipes.find(function(r){return r.id===id;});S.view="form";render();};
window.goToRecipe = function(id) {
  var found = S.recipes.find(function(r){ return r.id === id; });
  if (!found) { toast('Rezept konnte nicht gefunden werden.'); return; }
  S.tab = 'recipes';
  S.viewing = found;
  S.nutrition = null;
  S.scaledPortions = null;
  S.view = 'detail';
  render();
};
window.doView=function(id){S.viewing=S.recipes.find(function(r){return r.id===id;});S.nutrition=null;S.scaledPortions=null;S.view="detail";render();};
window.doDelete=async function(id){
  var r=S.recipes.find(function(x){return x.id===id;});
  if(!r||!isOwner(r)){toast("Nur der Ersteller kann dieses Rezept l\u00f6schen.");return;}
  if(!confirm("Rezept wirklich l\u00f6schen?"))return;
  await fbDeleteRecipe(id);toast("Rezept gel\u00f6scht.");
};

window.addIng=function(){
  var el=document.getElementById("ing-list");var id=uid();
  var div=document.createElement("div");div.className="ing-row";div.dataset.ing=id;
  div.innerHTML='<input class="inp inp-sm" data-f="amount" placeholder="Menge" onkeydown="handleIngKeydown(event,this)" />'+buildUnitSelect('')+'<input class="inp inp-sm" data-f="name" placeholder="Zutat" onkeydown="handleIngKeydown(event,this)" /><button class="remove-btn" onclick="removeIng(\''+id+'\')">'+svg(I.x,14)+'</button>';
  el.appendChild(div);
  return div;
};
window.removeIng=function(id){var el=document.querySelector('[data-ing="'+id+'"]');if(el&&document.querySelectorAll("[data-ing]").length>1)el.remove();};
window.addStep=function(){
  var el=document.getElementById("step-list");var id=uid();var n=el.children.length+1;
  var div=document.createElement("div");div.className="step-row";div.dataset.step=id;
  div.innerHTML='<div class="step-row-num">'+n+'</div><textarea class="inp" rows="2" data-f="text" style="flex:1;resize:vertical" placeholder="Schritt '+n+'\u2026" onkeydown="handleStepKeydown(event,this)"></textarea><button class="remove-btn" onclick="removeStep(\''+id+'\')" style="margin-top:6px">'+svg(I.x,14)+'</button>';
  el.appendChild(div);
  return div;
};
window.removeStep=function(id){var el=document.querySelector('[data-step="'+id+'"]');if(el&&document.querySelectorAll("[data-step]").length>1)el.remove();};

window.handleIngKeydown = function(e, input) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  var row = input.closest(".ing-row");
  var allRows = Array.from(document.querySelectorAll(".ing-row"));
  var idx = allRows.indexOf(row);
  if (idx === allRows.length - 1) {
    // Last row - add new one
    var newRow = window.addIng();
    setTimeout(function() {
      var firstInput = newRow.querySelector('[data-f="amount"]');
      if (firstInput) firstInput.focus();
    }, 10);
  } else {
    // Jump to next row's amount field
    var nextRow = allRows[idx + 1];
    var nextInput = nextRow.querySelector('[data-f="amount"]');
    if (nextInput) nextInput.focus();
  }
};

window.handleStepKeydown = function(e, textarea) {
  if (e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  var row = textarea.closest(".step-row");
  var allRows = Array.from(document.querySelectorAll(".step-row"));
  var idx = allRows.indexOf(row);
  if (idx === allRows.length - 1) {
    var newRow = window.addStep();
    setTimeout(function() {
      var ta = newRow.querySelector('[data-f="text"]');
      if (ta) ta.focus();
    }, 10);
  } else {
    var nextRow = allRows[idx + 1];
    var nextTa = nextRow.querySelector('[data-f="text"]');
    if (nextTa) nextTa.focus();
  }
};
var _pendingPhotoBase64 = null;
var _photoRemoved = false;

window.onPhotoSelected = function(e) {
  var file = e.target.files[0];
  if (file) loadPhotoFile(file);
};
window.onPhotoDrop = function(e) {
  e.preventDefault();
  var file = e.dataTransfer.files[0];
  if (file) loadPhotoFile(file);
};
// Verkleinert/komprimiert ein Bild per Canvas, damit das Rezept-Dokument unter
// dem Firestore-Limit von 1 MB bleibt (Fotos werden als base64 im Dokument gespeichert).
function compressImageDataUrl(dataUrl, cb) {
  var img = new Image();
  img.onload = function() {
    var maxDim = 1200;
    var w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    var quality = 0.82;
    var out = canvas.toDataURL("image/jpeg", quality);
    // Ziel: unter ~900 KB, damit neben dem Bild noch Platz für die restlichen Rezeptdaten bleibt
    while (out.length > 900000 && quality > 0.4) {
      quality -= 0.12;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    cb(out.length > 900000 ? null : out);
  };
  img.onerror = function() { cb(null); };
  img.src = dataUrl;
}

function loadPhotoFile(file) {
  if (!file.type || file.type.indexOf("image/") !== 0) { toast("Bitte eine Bilddatei auswählen."); return; }
  if (file.size > 15 * 1024 * 1024) { toast("Foto darf maximal 15MB groß sein."); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    compressImageDataUrl(e.target.result, function(compressed) {
      if (!compressed) { toast("Foto konnte nicht verarbeitet werden – bitte ein kleineres Bild wählen."); return; }
      _pendingPhotoBase64 = compressed;
      _photoRemoved = false;
      var img = document.getElementById("photo-preview");
      var wrap = document.getElementById("photo-preview-wrap");
      var drop = document.getElementById("photo-drop");
      if (img) img.src = _pendingPhotoBase64;
      if (wrap) wrap.style.display = "";
      if (drop) drop.style.display = "none";
    });
  };
  reader.readAsDataURL(file);
}
window.removePhoto = function() {
  _pendingPhotoBase64 = null;
  _photoRemoved = true;
  var wrap = document.getElementById("photo-preview-wrap");
  var drop = document.getElementById("photo-drop");
  if (wrap) wrap.style.display = "none";
  if (drop) drop.style.display = "";
};

window.doSave=async function(existingId){
  var name=document.getElementById("f-name").value.trim();
  if(!name){alert("Bitte einen Rezeptnamen eingeben.");return;}
  var ings=[];document.querySelectorAll("[data-ing]").forEach(function(row){ings.push({id:row.dataset.ing,amount:row.querySelector('[data-f="amount"]').value.trim(),unit:row.querySelector('[data-f="unit"]').value,name:row.querySelector('[data-f="name"]').value.trim()});});
  var steps=[];document.querySelectorAll("[data-step]").forEach(function(row){steps.push({id:row.dataset.step,text:row.querySelector('[data-f="text"]').value.trim()});});
  var existing = existingId ? S.recipes.find(function(r){return r.id===existingId;}) : null;
  var existingTags = existing ? (existing.tags||[]) : [];
  var photo = _photoRemoved ? null : (_pendingPhotoBase64 || (existing && existing.photo ? existing.photo : null));
  var recipe={id:existingId||null,name:name,description:document.getElementById("f-desc").value.trim(),servings:document.getElementById("f-srv").value,prepTime:document.getElementById("f-time").value.trim(),ingredients:ings,steps:steps,tags:existingTags,photo:photo};
  if(existing){recipe.createdBy=existing.createdBy;recipe.createdByName=existing.createdByName;if(existing.ratings)recipe.ratings=existing.ratings;if(existing.createdAt)recipe.createdAt=existing.createdAt;}
  // Auto-categorize if no tags yet
  if (!recipe.tags || recipe.tags.length === 0) {
    var tags = await autoCategorizRecipe(recipe);
    if (tags.length > 0) recipe.tags = tags;
  }
  // Nährwerte einmalig berechnen und im Rezept speichern
  try {
    var nutIngs = ings.filter(function(i){return i.name;}).map(function(i){return {name:i.name,amount:i.amount,unit:i.unit};});
    if (nutIngs.length > 0) {
      var nutRes = await apiPost("/api/nutrition", {ingredients: nutIngs, servings: recipe.servings || 1, uid: S.user.uid});
      var nutData = await nutRes.json();
      if (nutRes.ok && nutData.total) {
        recipe.nutrition = { total: nutData.total, baseServings: parseInt(recipe.servings)||1 };
      }
    }
  } catch(e) { /* Nährwerte konnten nicht berechnet werden, Rezept trotzdem speichern */ }
  try {
    await fbSaveRecipe(recipe);
  } catch(e) {
    toast("Rezept konnte nicht gespeichert werden: " + (e && e.message ? e.message : "Unbekannter Fehler"));
    return;
  }
  var changed=false;
  DAYS.forEach(function(day){
    if(!S.weekPlan[day])return;
    var entry=S.weekPlan[day];
    var r=entry.recipe||entry;
    if(r.id===existingId){S.weekPlan[day]=Object.assign({},entry,{recipe:recipe});changed=true;}
  });
  if(changed)await fbSaveWeek();
  _pendingPhotoBase64=null;_photoRemoved=false;
  toast(existingId?"Rezept aktualisiert \u2713":"Rezept gespeichert \u2713");
  S.view="list";S.editing=null;render();
};
window.doCopyWeek=function(){navigator.clipboard.writeText(weekExportText()).then(function(){toast("Kopiert! \u2713");});};
window.doDlWeek=function(){dlTxt("Wocheneinkaufsliste.txt",weekExportText());};
window.doCopyShopping=function(){navigator.clipboard.writeText(shopExportText()).then(function(){toast("Kopiert! \u2713");});};
window.doDlShopping=function(){dlTxt("Einkaufsliste.txt",shopExportText());};
window.doCopyDetail=function(){
  var r=S.viewing;if(!r)return;
  var ings=(r.ingredients||[]).filter(function(i){return i.name;});
  var txt=["Einkaufsliste: "+r.name,""].concat(ings.map(function(i){return "- "+fmtIng(i);})).join("\n");
  navigator.clipboard.writeText(txt).then(function(){toast("Kopiert! \u2713");});
};
window.doDlDetail=function(){
  var r=S.viewing;if(!r)return;
  var ings=(r.ingredients||[]).filter(function(i){return i.name;});
  var txt=["Einkaufsliste: "+r.name,""].concat(ings.map(function(i){return "- "+fmtIng(i);})).join("\n");
  dlTxt("Einkaufsliste_"+r.name.replace(/\s+/g,"_")+".txt",txt);
};
window.doDetailToWeek=function(){if(!S.viewing)return;S._pendingPortions=S.scaledPortions||parseInt(S.viewing.servings)||1;openDayModal(S.viewing.id);};

// ── Kochmodus ────────────────────────────────────────────────────────────────
var CM = { recipeName:"", steps:[], ings:[], stepIndex:0, timerTotal:0, timerLeft:0, timerRunning:false, timerDone:false, timerInterval:null };

function parseStepDuration(text) {
  var m = text.match(/(\d+)\s*(Stunden?|Std\.?|Minuten?|Min\.?|Sekunden?|Sek\.?)/i);
  if (!m) return null;
  var n = parseInt(m[1]); var unit = m[2].toLowerCase();
  if (unit.indexOf("stund") === 0 || unit.indexOf("std") === 0) return n * 3600;
  if (unit.indexOf("sek") === 0) return n;
  return n * 60; // Minuten
}

function formatDuration(sec) {
  if (sec % 60 === 0) return (sec/60) + " Min";
  return Math.floor(sec/60) + ":" + String(sec%60).padStart(2,"0") + " Min";
}

function formatClock(sec) {
  var m = Math.floor(sec/60); var s = sec%60;
  return (m<10?"0":"")+m+":"+(s<10?"0":"")+s;
}

function cookKeyHandler(e) {
  if (e.key === "Escape") { window.exitCookMode(); }
  else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); window.cookNext(); }
  else if (e.key === "ArrowLeft") { window.cookPrev(); }
}

var _cookTouchX = null, _cookTouchY = null;
function cookTouchStart(e) {
  var t = e.touches[0];
  _cookTouchX = t.clientX; _cookTouchY = t.clientY;
}
function cookTouchEnd(e) {
  if (_cookTouchX === null) return;
  var t = e.changedTouches[0];
  var dx = t.clientX - _cookTouchX; var dy = t.clientY - _cookTouchY;
  _cookTouchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) window.cookNext(); else window.cookPrev();
  }
}

// ── Zutaten-Konsistenzprüfung ─────────────────────────────────────────────
// Erkennt Wörter in der Zubereitung, die wie eine Zutat aussehen (großgeschrieben,
// aus einer Liste gängiger Zutaten-Stämme), aber nicht in der Zutatenliste stehen.
var KNOWN_INGREDIENT_STEMS = [
  "tomat","zwiebel","knoblauch","kartoffel","karotte","möhr","paprika","gurke","zucchini","aubergine",
  "pilz","champignon","spinat","brokkoli","blumenkohl","lauch","sellerie","fenchel","rosenkohl","kohl",
  "mais","erbse","bohne","linse","kichererbse","avocado","salat","rukola","ingwer","chili",
  "apfel","birne","banane","zitrone","limette","orange","beere","erdbeer","himbeer","blaubeer",
  "traube","mango","ananas","pfirsich","kokos",
  "hähnchen","huhn","pute","rind","schwein","hack","lamm","fisch","lachs","thunfisch",
  "garnele","ei","eier","tofu","speck","schinken","wurst",
  "milch","sahne","joghurt","quark","käse","butter","frischkäse","mozzarella","parmesan","feta",
  "mehl","reis","nudel","pasta","spaghetti","couscous","quinoa","hafer","brot","semmel","panade",
  "salz","pfeffer","zucker","honig","essig","öl","senf","sojasauce","curry","kreuzkümmel",
  "zimt","basilikum","petersilie","koriander","thymian","rosmarin","oregano","dill","minze","lorbeer",
  "muskat","kardamom","vanille","mandel","walnuss","cashew","erdnuss","pinienkern","sesam",
  "brühe","wein","tomatenmark","creme"
];

// Gruppen von Zutaten-Oberbegriffen und konkreten Sorten, die sich nicht per
// Substring erkennen lassen (z.B. "Pilze" im Rezepttext vs. "Pfifferlinge" in
// der Zutatenliste, oder "Speisestärke" vs. "Kartoffelstärke").
var INGREDIENT_SYNONYM_GROUPS = [
  ["pilz","pilze","champignon","champignons","pfifferling","pfifferlinge","steinpilz","steinpilze","austernpilz","austernpilze","shiitake","egerling","egerlinge","morchel","morcheln","kräuterseitling","kräuterseitlinge","trompetenpilz","trompetenpilze"],
  ["stärke","speisestärke","kartoffelstärke","maisstärke","maizena"],
  ["zwiebel","zwiebeln","schalotte","schalotten"],
  ["käse","gouda","emmentaler","cheddar","mozzarella","parmesan","feta","bergkäse","gruyère","raclette"],
  ["chili","chilischote","chilischoten","chiliflocken","peperoni","jalapeno","jalapeño","jalapenos"],
  ["essig","balsamico","weinessig","apfelessig","reisessig"],
  ["öl","olivenöl","sonnenblumenöl","rapsöl","sesamöl","kokosöl","erdnussöl"],
  ["reis","basmatireis","jasminreis","risottoreis","milchreis"],
  ["paprika","paprikaschote","paprikaschoten","spitzpaprika","gemüsepaprika"],
  ["zucker","rohrzucker","puderzucker","vanillezucker","kokosblütenzucker"],
  ["salz","meersalz","fleursdesel","speisesalz"],
  ["brühe","fond","brühwürfel","gemüsebrühe","hühnerbrühe","rinderbrühe","gemüsefond"],
  ["sahne","schlagsahne","kochsahne","crèmefraiche","cremefraiche","schmand"],
  ["senf","dijonsenf","mittelscharfersenf"],
  ["nudel","nudeln","spaghetti","penne","fusilli","tagliatelle","linguine","farfalle"]
];

function sameSynonymGroup(word1, word2) {
  return INGREDIENT_SYNONYM_GROUPS.some(function(group){
    var match1 = group.some(function(g){ return word1.indexOf(g)===0 || g.indexOf(word1)===0; });
    var match2 = group.some(function(g){ return word2.indexOf(g)===0 || g.indexOf(word2)===0; });
    return match1 && match2;
  });
}

// Erkennt ob ein Zutatenname im Text erwähnt wird - auch bei zusammengesetzten
// Namen wie "Cherrytomaten" vs. Text "Tomaten" (in beide Richtungen geprüft),
// und bei Oberbegriff/Sorte-Paaren wie "Pilze" vs. "Pfifferlinge" (siehe oben).
function textMentionsIngredient(text, ingredientName) {
  var lowerText = text.toLowerCase();
  var nameLower = ingredientName.toLowerCase();
  if (lowerText.indexOf(nameLower) !== -1) return true;
  var nameWords = nameLower.match(/[a-zäöüß]{4,}/g) || [nameLower];
  var textWords = lowerText.match(/[a-zäöüß]{4,}/g) || [];
  return nameWords.some(function(nw){
    return textWords.some(function(tw){ return nw.indexOf(tw) !== -1 || tw.indexOf(nw) !== -1 || sameSynonymGroup(nw, tw); });
  });
}

function findMissingIngredientMentions(stepsText, ingredientNames) {
  var lowerNames = ingredientNames.map(function(n){return n.toLowerCase();});
  var words = stepsText.match(/[A-ZÄÖÜ][a-zäöüß]{3,}/g) || [];
  var seen = {}; var missing = [];
  words.forEach(function(w){
    var lw = w.toLowerCase();
    var stem = KNOWN_INGREDIENT_STEMS.find(function(s){ return lw.indexOf(s) === 0; });
    if (!stem || seen[stem]) return;
    var covered = lowerNames.some(function(n){ return n.indexOf(stem) !== -1 || sameSynonymGroup(n, stem); });
    if (!covered) { seen[stem] = true; missing.push(w); }
  });
  return missing;
}

function playBeep() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    [0, 0.3, 0.6].forEach(function(delay){
      var o = ctx.createOscillator(); var g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.001, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.28);
    });
  } catch(e) {}
}

window.startCookMode = function() {
  var r = S.viewing; if (!r) return;
  var steps = (r.steps||[]).filter(function(s){return s.text;});
  if (!steps.length) return;
  var ings = sortIngredientsForDisplay((r.ingredients||[]).filter(function(i){return i.name;}));
  var basePortions = parseInt(r.servings)||1;
  var scaledBase = S.scaledPortions || basePortions;
  CM.recipeName = r.name;
  CM.steps = steps;
  CM.ings = ings.map(function(i){
    return { name: i.name, unit: i.unit, amount: scaleAmount(i.amount, basePortions, scaledBase) };
  });
  CM.stepIndex = 0;
  cookResetTimerState();
  var el = document.getElementById("cook-mode");
  el.classList.add("open");
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", cookKeyHandler);
  el.addEventListener("touchstart", cookTouchStart, {passive:true});
  el.addEventListener("touchend", cookTouchEnd, {passive:true});
  renderCookMode();
};

window.exitCookMode = function() {
  if (CM.timerInterval) clearInterval(CM.timerInterval);
  var el = document.getElementById("cook-mode");
  el.classList.remove("open");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", cookKeyHandler);
  el.removeEventListener("touchstart", cookTouchStart);
  el.removeEventListener("touchend", cookTouchEnd);
};

window.cookNext = function() {
  if (CM.stepIndex < CM.steps.length-1) { CM.stepIndex++; renderCookMode(); }
};
window.cookPrev = function() {
  if (CM.stepIndex > 0) { CM.stepIndex--; renderCookMode(); }
};

function cookResetTimerState() {
  if (CM.timerInterval) clearInterval(CM.timerInterval);
  CM.timerInterval = null; CM.timerTotal = 0; CM.timerLeft = 0; CM.timerRunning = false; CM.timerDone = false;
}

window.cookStartTimer = function(seconds) {
  if (CM.timerInterval) clearInterval(CM.timerInterval);
  CM.timerTotal = seconds; CM.timerLeft = seconds; CM.timerRunning = true; CM.timerDone = false;
  CM.timerInterval = setInterval(function(){
    CM.timerLeft--;
    if (CM.timerLeft <= 0) {
      CM.timerLeft = 0; CM.timerRunning = false; CM.timerDone = true;
      clearInterval(CM.timerInterval); CM.timerInterval = null;
      playBeep();
    }
    renderCookTimerSlot();
  }, 1000);
  renderCookTimerSlot();
  // Timer in den sichtbaren Bereich holen (bei langem Rezepttext sonst außerhalb)
  var slot = document.getElementById("cook-timer-slot");
  if (slot && slot.scrollIntoView) slot.scrollIntoView({ behavior: "smooth", block: "center" });
};
window.cookPauseTimer = function() {
  if (CM.timerInterval) { clearInterval(CM.timerInterval); CM.timerInterval = null; }
  CM.timerRunning = false;
  renderCookTimerSlot();
};
window.cookResumeTimer = function() {
  if (CM.timerLeft <= 0) return;
  CM.timerRunning = true;
  CM.timerInterval = setInterval(function(){
    CM.timerLeft--;
    if (CM.timerLeft <= 0) {
      CM.timerLeft = 0; CM.timerRunning = false; CM.timerDone = true;
      clearInterval(CM.timerInterval); CM.timerInterval = null;
      playBeep();
    }
    renderCookTimerSlot();
  }, 1000);
  renderCookTimerSlot();
};
window.cookResetTimer = function() { cookResetTimerState(); renderCookTimerSlot(); };

// Baut nur den Timer-Bereich. Wird bei jedem Timer-Tick genutzt, damit NICHT der
// ganze Kochmodus (inkl. Scroll-Container .cook-body) neu gerendert wird - sonst
// springt die Ansicht auf dem Handy jede Sekunde nach oben.
function buildCookTimerHtml() {
  var step = CM.steps[CM.stepIndex];
  if (CM.timerRunning || CM.timerLeft > 0 || CM.timerDone) {
    return '<div class="cook-timer'+(CM.timerRunning?' running':'')+(CM.timerDone?' done':'')+'">'
      +'<div class="cook-timer-display">'+(CM.timerDone?"Fertig! ⏰":formatClock(CM.timerLeft))+'</div>'
      +'<div style="display:flex;gap:8px">'
      +(CM.timerDone ? '<button class="btn btn-secondary btn-sm" onclick="cookResetTimer()">Timer zurücksetzen</button>'
        : CM.timerRunning ? '<button class="btn btn-secondary btn-sm" onclick="cookPauseTimer()">Pause</button>'
        : '<button class="btn btn-secondary btn-sm" onclick="cookResumeTimer()">Weiter</button>')
      +(CM.timerDone ? '' : '<button class="btn btn-ghost btn-sm" onclick="cookResetTimer()">Abbrechen</button>')
      +'</div></div>';
  }
  var dur = parseStepDuration(step.text);
  return '<div class="cook-timer">'
    +(dur ? '<button class="btn btn-primary btn-sm" onclick="cookStartTimer('+dur+')">'+svg(I.clock,15)+' Timer '+formatDuration(dur)+' starten</button>' : '')
    +'<div class="cook-timer-presets">'
    +[1,5,10,15].map(function(m){return '<button class="btn btn-ghost btn-sm" onclick="cookStartTimer('+(m*60)+')">'+m+' Min</button>';}).join("")
    +'</div></div>';
}

function renderCookTimerSlot() {
  var slot = document.getElementById("cook-timer-slot");
  if (slot) slot.innerHTML = buildCookTimerHtml();
}

function renderCookMode() {
  var el = document.getElementById("cook-mode");
  var step = CM.steps[CM.stepIndex];
  var matched = CM.ings.filter(function(i){ return textMentionsIngredient(step.text, i.name); });
  var chips = matched.map(function(i){
    return '<span class="cook-ing-chip">'+esc([i.amount,i.unit,i.name].filter(Boolean).join(" "))+'</span>';
  }).join("");
  var missingMentions = findMissingIngredientMentions(step.text, CM.ings.map(function(i){return i.name;}));
  chips += missingMentions.map(function(w){
    return '<span class="cook-ing-chip warn" title="Steht nicht in der Zutatenliste">&#9888; '+esc(w)+'</span>';
  }).join("");
  var isLast = CM.stepIndex === CM.steps.length-1;
  var pct = Math.round(((CM.stepIndex+1)/CM.steps.length)*100);

  el.innerHTML =
    '<div class="cook-hd">'
      +'<button class="btn btn-ghost btn-icon" onclick="exitCookMode()" title="Kochmodus verlassen">'+svg(I.x)+'</button>'
      +'<div class="cook-progress"><div class="cook-progress-bar" style="width:'+pct+'%"></div></div>'
      +'<span class="cook-count">'+(CM.stepIndex+1)+' / '+CM.steps.length+'</span>'
    +'</div>'
    +'<div class="cook-body">'
      +'<div class="cook-recipe-name">'+esc(CM.recipeName)+'</div>'
      +'<div class="cook-step-text">'+esc(step.text)+'</div>'
      +(chips?'<div class="cook-ings">'+chips+'</div>':'')
      +'<div id="cook-timer-slot">'+buildCookTimerHtml()+'</div>'
    +'</div>'
    +'<div class="cook-ftr">'
      +(CM.stepIndex>0?'<button class="btn btn-secondary" onclick="cookPrev()">'+svg(I.back)+' Zurück</button>':'')
      +(isLast
        ? '<button class="btn btn-primary" style="margin-left:auto" onclick="exitCookMode()">'+svg(I.check)+' Fertig!</button>'
        : '<button class="btn btn-primary" style="margin-left:auto" onclick="cookNext()">Weiter '+svg(I.fwd)+'</button>')
    +'</div>';
}
window.toggleShopI=function(key){
  S.shopChecked[key]=!S.shopChecked[key];
  fbSaveShopChecked();
  // Update just the clicked item visually
  var ings = mergeWeekIngredients();
  var ing = ings.find(function(i){ return (i.name+"__"+(i.unit||""))===key; });
  var done = !!S.shopChecked[key];
  // Find and update the div
  var allDivs = document.querySelectorAll('.shop-item');
  allDivs.forEach(function(div) {
    if (div.getAttribute('data-key') === key) {
      div.className = 'shop-item' + (done?' done':'');
      var chk = div.querySelector('.chk');
      if (chk) { chk.className='chk'+(done?' on':''); chk.innerHTML=done?svg(I.check,11):''; }
    }
  });
  // Full re-render to be safe
  if (S.tab==='shopping') renderOnly();
};
window.toggleWineItem=function(idx){if(S.wineList[idx])S.wineList[idx].done=!S.wineList[idx].done;fbSaveWineList();renderOnly();};
window.removeWineItem=function(idx){S.wineList.splice(idx,1);fbSaveWineList();renderOnly();};
window.clearWineList=function(){S.wineList=[];fbSaveWineList();renderOnly();};

// Read tab from URL on page load
(function() {
  var params = new URLSearchParams(window.location.search);
  var urlTab = params.get("tab");
  if (urlTab && ["recipes","week","shopping"].indexOf(urlTab) >= 0) {
    S.tab = urlTab;
  }
})();
// ── Dark Mode ──────────────────────────────────────────────────────────────
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('rezeptbuch_theme',t);
  var b=document.getElementById('theme-toggle-btn');
  if(b) b.innerHTML = t==='dark' ? '&#9728;&#65039; Light Mode' : '&#127769; Dark Mode';
}
window.toggleTheme = function(){
  var cur = document.documentElement.getAttribute('data-theme')||'light';
  applyTheme(cur==='dark'?'light':'dark');
  var dd=document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
};
// Apply on load
(function(){
  var s = localStorage.getItem('rezeptbuch_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', s);
})();


history.replaceState({tab:S.tab,view:"list",viewingId:null},"","?tab="+S.tab);
