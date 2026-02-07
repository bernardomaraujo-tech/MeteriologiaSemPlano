const REFRESH_MS = 5 * 60 * 1000;

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 }
];

const els = {
  updated: document.getElementById("updated"),
  select: document.getElementById("locationSelect"),
  source: document.getElementById("source"),

  heroLoc: document.getElementById("heroLoc"),
  heroTemp: document.getElementById("heroTemp"),
  heroMeta: document.getElementById("heroMeta"),

  nowWind: document.getElementById("nowWind"),
  nowGust: document.getElementById("nowGust"),
  nowDirTxt: document.getElementById("nowDirTxt"),
  nowArrow: document.getElementById("nowArrow"),
  nowRain: document.getElementById("nowRain"),
  nowPop: document.getElementById("nowPop"),

  dressBike: document.getElementById("dressBike"),
  dressRun: document.getElementById("dressRun"),
  dressWalk: document.getElementById("dressWalk"),

  alerts: document.getElementById("alerts"),
  table8: document.getElementById("table8"),
  table48: document.getElementById("table48"),
  toggle48: document.getElementById("toggle48"),
  wrap48: document.getElementById("wrap48"),

  bestWindow: document.getElementById("bestWindow"),
  windSuggestion: document.getElementById("windSuggestion"),
};

function fmtKmh(x){ return `${Math.round(x)} km/h`; }
function fmtMm(x){ return `${(Math.round((x ?? 0) * 10) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x ?? 0)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}
function rotateArrow(deg){
  const rot = (deg - 45);
  els.nowArrow.style.transform = `rotate(${rot}deg)`;
}

function hourLabel(iso){ return iso.slice(11,16); }

function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday: "short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = iso.slice(11,16);
  return `${w} ${h}`;
}

/* ============================================================
   👕 O QUE VESTIR — LÓGICA ROBUSTA
   ============================================================ */
function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }) {

  const rainy = (pop ?? 0) >= 25 || (prcp ?? 0) >= 0.2;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let thermal;
  if (temp <= 6) thermal = "Muito Frio";
  else if (temp <= 11) thermal = "Frio";
  else if (temp <= 16) thermal = "Fresco";
  else if (temp <= 22) thermal = "Agradável";
  else thermal = "Quente";

  const flags = [
    thermal,
    rainy ? "Chuva provável" : null,
    windy ? "Vento forte" : null
  ].filter(Boolean).join(" · ");

  const out = (base, extras=[]) => `
${flags}
Base: ${base}
${extras.length ? `Extras: ${extras.join(" + ")}` : ""}
`.trim();

  if (sport === "bike") {
    if (temp <= 6) return out(
      "Base layer térmica + Jersey manga comprida + Casaco/colete corta-vento + Calças térmicas + Luvas grossas + Proteção de sapatos",
      rainy || windy ? ["Impermeável ou corta-vento packável"] : []
    );
    if (temp <= 11) return out(
      "Base layer + Jersey manga comprida + Colete corta-vento + Calção com perneiras ou calças leves + Luvas",
      rainy ? ["Impermeável packável"] : []
    );
    if (temp <= 16) return out(
      "Base layer leve + Jersey manga comprida (ou curta + manguitos) + Colete opcional",
      rainy ? ["Impermeável fino"] : []
    );
    if (temp <= 22) return out(
      "Jersey manga curta + Calção",
      windy ? ["Colete corta-vento"] : []
    );
    return out("Jersey leve + Calção + Hidratação");
  }

  if (sport === "run") {
    if (temp <= 6) return out(
      "Camisola térmica manga comprida + Calças + Corta-vento leve"
    );
    if (temp <= 11) return out(
      "Manga comprida leve + Calças ou calções",
      rainy || windy ? ["Corta-vento fino"] : []
    );
    if (temp <= 16) return out("T-shirt + Camada fina opcional");
    if (temp <= 22) return out("T-shirt leve + Calções");
    return out("Muito leve + Hidratação");
  }

  if (temp <= 6) return out(
    "Base layer quente + Mid layer (fleece) + Shell impermeável"
  );
  if (temp <= 11) return out(
    "Base layer média + Casaco leve",
    rainy ? ["Impermeável fino"] : []
  );
  if (temp <= 16) return out("Camisola leve + Camada opcional");
  if (temp <= 22) return out("Roupa confortável por camadas");
  return out("Roupa leve e respirável");
}
/* ============================================================ */

async function refresh(){
  const locId = els.select.value;
  const loc = LOCATIONS.find(x => x.id === locId) ?? LOCATIONS[0];

  els.updated.textContent = "A atualizar…";

  try{
    const { json, source } = await fetchWithFallback(loc);
    els.updated.textContent =
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`;
    renderAll(json, source, loc.name);
  } catch (e){
    els.updated.textContent =
      `Última atualização: falhou (${new Date().toLocaleTimeString("pt-PT")})`;
    els.source.textContent = `Erro a obter dados`;
  }
}

function init(){
  for (const l of LOCATIONS){
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    els.select.appendChild(opt);
  }

  els.select.value = "alcabideche";

  els.toggle48.addEventListener("click", () => {
    const isHidden = els.wrap48.classList.contains("hidden");
    els.wrap48.classList.toggle("hidden", !isHidden);
    els.toggle48.textContent = isHidden ? "Esconder" : "Mostrar";
  });

  els.select.addEventListener("change", refresh);

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
