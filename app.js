/* SEM PLANO Weather — app.js
   - Atualiza de 5 em 5 minutos
   - Open-Meteo (48h hourly)
   - Alertas (chuva/rajadas próximas 2h)
   - Próximas 8h + Próximas 48h (toggle)
   - Melhor janela (2h / próximas 12h) limitada a 07:00–22:00
   - Sugestão de sentido pelo vento
   - “O que vestir” robusto + ícones (só roupa) pequenos
*/

const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

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

const $ = (id) => document.getElementById(id);
const setText = (el, txt) => { if (el) el.textContent = txt; };
const setHTML = (el, html) => { if (el) el.innerHTML = html; };

const els = {
  updated: $("updated"),
  select: $("locationSelect"),
  source: $("source"),

  heroLoc: $("heroLoc"),
  heroTemp: $("heroTemp"),
  heroMeta: $("heroMeta"),

  nowWind: $("nowWind"),
  nowGust: $("nowGust"),
  nowDirTxt: $("nowDirTxt"),
  nowRain: $("nowRain"),
  nowPop: $("nowPop"),

  dirNeedle: $("dirNeedle"),

  dressBike: $("dressBike"),
  dressRun: $("dressRun"),
  dressWalk: $("dressWalk"),

  alerts: $("alerts"),
  table8: $("table8"),
  table48: $("table48"),
  toggle48: $("toggle48"),
  wrap48: $("wrap48"),

  bestWindow: $("bestWindow"),
  windSuggestion: $("windSuggestion"),

  windyLink: $("windyLink"),
};

function fmtKmh(x){ return `${Math.round(x ?? 0)} km/h`; }
function fmtMm(x){ return `${(Math.round(((x ?? 0) * 10)) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x ?? 0)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const d = ((deg ?? 0) % 360 + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return `${dirs[idx]} (${Math.round(d)}°)`;
}

function hourLabel(iso){ return String(iso).slice(11,16); }
function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday:"short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
  return `${w} ${h}`;
}

/* =========================
   ROUPA — SVG placeholders
   (só roupa; nada de acessórios)
   ========================= */

const CLOTHING_SVGS = {
  baselayer: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 5 6 3 8l3 3v9h12v-9l3-3-2-2-3-2-2 2H10L8 4z"/></svg>`,
  jerseyML: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 5 6 3 8l2 2v10h3V12h2v8h4v-8h2v8h3V10l2-2-2-2-3-2-2 2H10L8 4z"/></svg>`,
  jerseyMC: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 5 6 3 8l3 3v9h12v-9l3-3-2-2-3-2-2 2H10L8 4z"/></svg>`,
  vest: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7 6 4 8v13h16V8l-3-2-2-3h-2l1 4-2 2-2-2 1-4H9z"/></svg>`,
  jacket: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7 6 4 8v13h6v-8l2-2 2 2v8h6V8l-3-2-2-3h-1l1 5-3 3-3-3 1-5H9z"/></svg>`,
  shorts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 6-3 1-2-2-2 2-3-1 1-6zm-1 7 3 1-1 10H6L7 10zm10 0 1 11h-3l-1-10 3-1z"/></svg>`,
  tights: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 9 2 9h-4l-1-7-1 7H7l2-9-1-9z"/></svg>`,
  legWarmers: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6h-4L9 3zm1 7h4l1 11h-3l-1-7-1 7H9l1-11z"/></svg>`,
  gloves: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V6a2 2 0 1 1 4 0v5h1V7a2 2 0 1 1 4 0v6l2 2v6H9l-4-4v-6l2-2z"/></svg>`,
  overshoes: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16c4-1 6-4 7-7l3 2c2 1 4 2 8 2v5H3v-2z"/></svg>`
};

const CLOTHING_LABELS = {
  baselayer: "Base layer",
  jerseyML: "Jersey ML",
  jerseyMC: "Jersey MC",
  vest: "Colete",
  jacket: "Casaco/Impermeável",
  shorts: "Calção",
  tights: "Calças",
  legWarmers: "Perneiras",
  gloves: "Luvas",
  overshoes: "Proteção sapatos"
};

const CLOTHING_ORDER = [
  "baselayer","jerseyML","jerseyMC","vest","jacket","shorts","tights","legWarmers","gloves","overshoes"
];

function normalizeText(s){
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function detectClothingKeys(baseText, extrasText){
  const t = normalizeText(`${baseText} ${extrasText}`);
  const found = new Set();

  // Base layer
  if (t.includes("base layer") || t.includes("baselayer")) found.add("baselayer");

  // Jersey (ML / MC)
  if (t.includes("jersey ml") || t.includes("manga comprida") || t.includes(" ml")) found.add("jerseyML");
  if (t.includes("jersey mc") || t.includes("manga curta") || t.includes(" mc")) found.add("jerseyMC");

  // Colete
  if (t.includes("colete")) found.add("vest");

  // Casaco / Shell / Impermeável / Repelente / Corta-vento
  if (t.includes("casaco") || t.includes("shell") || t.includes("imperme") || t.includes("repelente") || t.includes("corta-vento") || t.includes("corta vento")){
    found.add("jacket");
  }

  // Calção / Calções
  if (t.includes("calcao") || t.includes("calcao") || t.includes("calcoes") || t.includes("calcoes")){
    found.add("shorts");
  }
  if (t.includes("calção") || t.includes("calções")) found.add("shorts");

  // Calças
  if (t.includes("calcas") || t.includes("calcas") || t.includes("tights")) found.add("tights");
  if (t.includes("calças")) found.add("tights");

  // Perneiras
  if (t.includes("perneiras") || t.includes("leg warmers")) found.add("legWarmers");

  // Luvas
  if (t.includes("luvas")) found.add("gloves");

  // Proteção sapatos / overshoes
  if (t.includes("protecao sapatos") || t.includes("protecao de sapatos") || t.includes("overshoes")) found.add("overshoes");
  if (t.includes("proteçao sapatos") || t.includes("proteçao de sapatos")) found.add("overshoes");

  return CLOTHING_ORDER.filter(k => found.has(k));
}

function renderClothingIcons(keys){
  if (!keys?.length) return "";
  const icons = keys.map(k => {
    const title = CLOTHING_LABELS[k] ?? k;
    return `<span class="gearIcon" title="${title}">${CLOTHING_SVGS[k] ?? ""}</span>`;
  }).join("");
  return `<div class="gearIcons">${icons}</div>`;
}

/* =========================
   METEO — robust clothing engine
   ========================= */

function thermalBandFromEffectiveTemp(t){
  if (t <= 0)  return 0; // Muito Frio
  if (t <= 5)  return 1; // Frio
  if (t <= 9)  return 2; // Fresco Frio
  if (t <= 14) return 3; // Fresco
  if (t <= 18) return 4; // Ameno
  if (t <= 22) return 5; // Agradável
  if (t <= 27) return 6; // Quente
  return 7;            // Muito Quente
}
function thermalBandLabel(idx){
  return ["Muito Frio","Frio","Fresco Frio","Fresco","Ameno","Agradável","Quente","Muito Quente"][idx] ?? "—";
}

function precipLevel(mmHour, pop){
  const mm = mmHour ?? 0;
  const p  = pop ?? 0;
  if (mm >= 4) return 3;
  if (mm >= 0.5 || p >= 40) return 2;
  if (mm >= 0.1 || (p >= 20 && p <= 39)) return 1;
  return 0;
}
function precipLabel(lvl){
  return ["Seco","Piso húmido provável","Chuva provável","Chuva forte"][lvl] ?? "—";
}

function windLevel(windKmh, gustKmh){
  const w = windKmh ?? 0;
  const g = gustKmh ?? 0;

  let lvl = 0;
  if (w >= 50) lvl = 4;
  else if (w >= 39) lvl = 3;
  else if (w >= 29) lvl = 2;
  else if (w >= 20) lvl = 1;

  if (g >= w + 12) lvl = Math.min(4, lvl + 1);
  return lvl;
}
function windLabel(lvl){
  return ["Leve","Relevante","Forte","Muito forte","Difícil"][lvl] ?? "—";
}

function applyWetPenalty(thermalIdx, precipLvl){
  if (precipLvl >= 1 && thermalIdx <= 3) return Math.max(0, thermalIdx - 1);
  return thermalIdx;
}

function applySportBias(thermalIdx, sport, windLvl){
  if (sport === "bike"){
    if (windLvl >= 1) return Math.max(0, thermalIdx - 1);
    return thermalIdx;
  }
  if (sport === "run"){
    return Math.min(7, thermalIdx + 1);
  }
  return thermalIdx;
}

function baseKitBySportAndBand(sport, bandIdx){
  if (sport === "bike"){
    if (bandIdx <= 0) return "Base layer térmica + Jersey ML térmica + Casaco corta-vento/impermeável + Calças + Luvas grossas + Proteção sapatos";
    if (bandIdx === 1) return "Base layer + Jersey ML + Colete/Casaco corta-vento + (Calção+perneiras ou calças leves) + Luvas inverno + Proteção sapatos";
    if (bandIdx === 2) return "Base layer média + Jersey ML (ou MC+manguitos) + Colete corta-vento + Luvas médias + (perneiras opcionais)";
    if (bandIdx === 3) return "Base layer leve + Jersey ML (ou MC+manguitos) + Colete fino opcional + Luvas leves opcionais";
    if (bandIdx === 4) return "Jersey MC + Calção + (Colete fino na bolsa se houver vento/descidas)";
    if (bandIdx === 5) return "Jersey MC + Calção + Proteção solar";
    if (bandIdx === 6) return "Jersey leve respirável + Calção + Hidratação + Proteção solar";
    return "Muito leve + máxima hidratação/eletrólitos + Proteção solar";
  }

  if (sport === "run"){
    if (bandIdx <= 0) return "Base layer ML + Camada extra + Corta-vento leve + Tights quentes + Gorro/Headband + Luvas";
    if (bandIdx === 1) return "Manga comprida técnica + Corta-vento fino + Tights (ou calção+perneiras) + Luvas finas";
    if (bandIdx === 2) return "Manga comprida leve (ou t-shirt+manga fina) + Tights leves/Calção + Luvas opcionais";
    if (bandIdx === 3) return "T-shirt + Camada fina opcional (para o arranque)";
    if (bandIdx === 4) return "T-shirt leve + Calção";
    if (bandIdx === 5) return "T-shirt leve + Calção + Proteção solar";
    if (bandIdx === 6) return "Muito leve + Hidratação";
    return "Muito leve + Evitar horas de maior calor + Hidratação/eletrólitos";
  }

  // walk
  if (bandIdx <= 0) return "Base layer quente + Mid layer (fleece) + Shell impermeável/corta-vento + Calças adequadas + Gorro + Luvas";
  if (bandIdx === 1) return "Base layer + Mid layer + Shell na mochila/vestida + Calças + (gorro/luvas se necessário)";
  if (bandIdx === 2) return "Base layer média + Mid layer leve + Shell na mochila";
  if (bandIdx === 3) return "Camisola leve + Camada extra opcional + Shell se instável";
  if (bandIdx === 4) return "Confortável por camadas + Shell leve se houver risco";
  if (bandIdx === 5) return "Leve e respirável + Proteção solar";
  if (bandIdx === 6) return "Muito leve + Água";
  return "Muito leve + Evitar horas quentes + Água";
}

function modifiers(sport, precipLvl, windLvl){
  const mods = [];
  if (precipLvl >= 1) mods.push("Impermeável/repelente packável");
  if (windLvl >= 1) mods.push("Colete ou corta-vento (tronco)");
  if (sport === "walk" && precipLvl >= 2) mods.push("Calças impermeáveis (opcional mas recomendado)");
  return mods;
}

function kitRecommendation({ sport, tempEff, windKmh, gustKmh, pop, precipMm }){
  const pLvl = precipLevel(precipMm, pop);
  const wLvl = windLevel(windKmh, gustKmh);

  let band = thermalBandFromEffectiveTemp(tempEff);
  band = applyWetPenalty(band, pLvl);
  band = applySportBias(band, sport, wLvl);

  const summary = `${thermalBandLabel(band)} · ${precipLabel(pLvl)} · Vento ${windLabel(wLvl)}`;
  const base = baseKitBySportAndBand(sport, band);
  const mods = modifiers(sport, pLvl, wLvl);
  const modsTxt = mods.length ? `Extras: ${mods.join(" + ")}` : "Extras: —";

  return { summary, base, modsTxt };
}

/* =========================
   API (Open-Meteo)
   ========================= */

function buildUrlForecast(loc){
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    timezone: "Europe/Lisbon",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    timeformat: "iso8601",
    forecast_hours: "48",
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "precipitation_probability",
      "weather_code",
      "is_day"
    ].join(",")
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWithTimeout(url){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try{
    return await fetch(url, { cache:"no-store", mode:"cors", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchWeather(loc){
  const url = buildUrlForecast(loc);
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  if (!json?.hourly?.time?.length) throw new Error("hourly vazio");
  return { json, source: "Open-Meteo" };
}

function nearestHourIndex(times){
  const now = new Date();
  let best = 0, bestDiff = Infinity;
  for (let i=0;i<times.length;i++){
    const t = new Date(times[i]);
    const diff = Math.abs(t.getTime() - now.getTime());
    if (diff < bestDiff){ bestDiff = diff; best = i; }
  }
  return best;
}

function computeMinMaxNext24h(temps, startIndex){
  const end = Math.min(startIndex + 24, temps.length);
  let min = Infinity, max = -Infinity;
  for (let i=startIndex; i<end; i++){
    const v = temps[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function iconForWeatherCode(code, isDay){
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙☁️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 56 || code === 57) return "🌧️";
  if (code === 61 || code === 63 || code === 65) return "🌧️";
  if (code === 71 || code === 73 || code === 75 || code === 77) return "❄️";
  if (code === 80 || code === 81 || code === 82) return "🌧️";
  if (code === 95 || code === 96 || code === 99) return "⛈️";
  return "•";
}

/* =========================
   UI: Alertas / Tabelas / Melhor janela / Sugestão sentido / Webcam
   ========================= */

function renderAlerts(data){
  const t = data.hourly.time;
  const start = nearestHourIndex(t);
  const next2 = [start, start+1].filter(x => x < t.length);

  const pops  = data.hourly.precipitation_probability ?? Array(t.length).fill(0);
  const prcps = data.hourly.precipitation ?? Array(t.length).fill(0);
  const gusts = data.hourly.wind_gusts_10m ?? Array(t.length).fill(0);

  const anyRainSoon = next2.some(k => (pops[k] ?? 0) >= 60 || (prcps[k] ?? 0) >= 0.4);
  const anyGustSoon = next2.some(k => (gusts[k] ?? 0) >= 45);

  const pills = [];
  if (anyRainSoon) pills.push(`<div class="pill">☔ Chuva provável nas próximas 2h</div>`);
  if (anyGustSoon) pills.push(`<div class="pill">💨 Rajadas fortes nas próximas 2h</div>`);
  if (!pills.length) pills.push(`<div class="pill">✅ Sem alertas relevantes nas próximas 2h</div>`);

  setHTML(els.alerts, pills.join(""));
}

function renderTables(data){
  const t = data.hourly.time;
  const temp = data.hourly.temperature_2m;
  const wind = data.hourly.wind_speed_10m;
  const gust = data.hourly.wind_gusts_10m;
  const dir  = data.hourly.wind_direction_10m;
  const prcp = data.hourly.precipitation;
  const pop  = data.hourly.precipitation_probability ?? Array(t.length).fill(null);
  const wcode = data.hourly.weather_code ?? Array(t.length).fill(null);
  const isDayArr = data.hourly.is_day ?? Array(t.length).fill(1);

  const start = nearestHourIndex(t);

  const build = (n, tableEl, labelFn) => {
    const rows = [];
    rows.push(`<tr>
      <th>Hora</th>
      <th class="iconCell"></th>
      <th>Temp</th>
      <th>Vento</th>
      <th>Raj.</th>
      <th>Dir</th>
      <th>Chuva</th>
      <th>Prob.</th>
    </tr>`);

    for (let i=start; i<Math.min(start+n, t.length); i++){
      const ico = iconForWeatherCode(wcode[i] ?? -1, (isDayArr[i] ?? 1) === 1);
      rows.push(`<tr>
        <td>${labelFn(t[i])}</td>
        <td class="iconCell"><span class="icon">${ico}</span></td>
        <td>${Math.round(temp[i])}°</td>
        <td>${fmtKmh(wind[i])}</td>
        <td>${fmtKmh(gust[i])}</td>
        <td>${windDirText(dir[i]).split(" ")[0]}</td>
        <td>${fmtMm(prcp[i] ?? 0)}</td>
        <td>${pop[i] == null ? "—" : fmtPct(pop[i])}</td>
      </tr>`);
    }

    tableEl.innerHTML = rows.join("");
  };

  build(8,  els.table8,  (iso) => hourLabel(iso));
  build(48, els.table48, (iso) => weekdayHourLabel(iso));
}

function computeBestWindowNext12h(data){
  const times = data.hourly.time;
  const gust  = data.hourly.wind_gusts_10m ?? [];
  const pop   = data.hourly.precipitation_probability ?? Array(times.length).fill(0);
  const prcp  = data.hourly.precipitation ?? Array(times.length).fill(0);

  const start = nearestHourIndex(times);
  const end = Math.min(start + 12, times.length - 2);

  // Só entre 07h e 22h (início até 20h para janela de 2h)
  const START_H = 7;
  const LAST_START_H = 20;

  let bestI = null;
  let bestScore = -1;

  const scoreHour = (j) => {
    const popN  = Math.min(Math.max(pop[j] ?? 0, 0), 100) / 100;
    const gustN = Math.min(Math.max(gust[j] ?? 0, 0), 70) / 70;
    const prcpN = Math.min(Math.max(prcp[j] ?? 0, 0), 6) / 6;
    return (1 - (0.65*popN + 0.35*prcpN)) * 0.65 + (1 - gustN) * 0.35;
  };

  for (let i=start; i<=end; i++){
    const h = new Date(times[i]).getHours();
    if (h < START_H || h > LAST_START_H) continue;
    const s = (scoreHour(i) + scoreHour(i+1)) / 2;
    if (s > bestScore){ bestScore = s; bestI = i; }
  }

  if (bestI === null) bestI = start;
  return { idx: bestI };
}

function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return `De ${from}. Favorece ir para sul; regresso para norte é mais pesado.`;
  if (d >= 45 && d < 135) return `De ${from}. Favorece ir para oeste; regresso para leste é mais pesado.`;
  if (d >= 135 && d < 225) return `De ${from}. Favorece ir para norte; regresso para sul é mais pesado.`;
  return `De ${from}. Favorece ir para leste; regresso para oeste é mais pesado.`;
}

function updateWindyCam(lat, lon){
  const el = document.getElementById("windyCam");
  if (el){
    el.setAttribute("data-params", JSON.stringify({ lat, lon, radius: 15, limit: 1 }));
    el.innerHTML = "";
    if (window.WindyWebcamsWidget?.reload) window.WindyWebcamsWidget.reload();
  }
  if (els.windyLink){
    els.windyLink.href = `https://www.windy.com/webcams?${lat},${lon},12`;
  }
}

/* =========================
   Render principal
   ========================= */

function renderAll(data, sourceName, locName){
  const t = data.hourly.time;
  const i = nearestHourIndex(t);

  const temp  = data.hourly.temperature_2m[i];
  const feels = data.hourly.apparent_temperature?.[i];
  const wind  = data.hourly.wind_speed_10m[i];
  const gust  = data.hourly.wind_gusts_10m[i];
  const dir   = data.hourly.wind_direction_10m[i];
  const prcp  = data.hourly.precipitation?.[i] ?? 0;
  const pop   = data.hourly.precipitation_probability?.[i] ?? 0;

  const { min, max } = computeMinMaxNext24h(data.hourly.temperature_2m, i);

  setText(els.heroLoc, locName);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroMeta, `Sensação: ${Math.round(feels ?? temp)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  if (els.dirNeedle){
    els.dirNeedle.style.transform = `translate(-50%, -92%) rotate(${dir}deg)`;
  }

  // O que vestir
  const tempEff = (feels ?? temp);

  const recBike = kitRecommendation({ sport:"bike", tempEff, windKmh: wind, gustKmh: gust, pop, precipMm: prcp });
  const recRun  = kitRecommendation({ sport:"run",  tempEff, windKmh: wind, gustKmh: gust, pop, precipMm: prcp });
  const recWalk = kitRecommendation({ sport:"walk", tempEff, windKmh: wind, gustKmh: gust, pop, precipMm: prcp });

  const bikeKeys = detectClothingKeys(recBike.base, recBike.modsTxt);
  const runKeys  = detectClothingKeys(recRun.base,  recRun.modsTxt);
  const walkKeys = detectClothingKeys(recWalk.base, recWalk.modsTxt);

  setHTML(
    els.dressBike,
    `<div><b>${recBike.summary}</b></div>
     <div>Base: ${recBike.base}</div>
     <div>${recBike.modsTxt}</div>
     ${renderClothingIcons(bikeKeys)}`
  );

  setHTML(
    els.dressRun,
    `<div><b>${recRun.summary}</b></div>
     <div>Base: ${recRun.base}</div>
     <div>${recRun.modsTxt}</div>
     ${renderClothingIcons(runKeys)}`
  );

  setHTML(
    els.dressWalk,
    `<div><b>${recWalk.summary}</b></div>
     <div>Base: ${recWalk.base}</div>
     <div>${recWalk.modsTxt}</div>
     ${renderClothingIcons(walkKeys)}`
  );

  renderAlerts(data);
  renderTables(data);

  const bw = computeBestWindowNext12h(data);
  const startLbl = weekdayHourLabel(t[bw.idx]);
  const endLbl   = weekdayHourLabel(t[bw.idx + 2] ?? t[bw.idx + 1]);
  setText(els.bestWindow, `${startLbl} → ${endLbl}\nMenos chuva + menos rajadas.`);

  setText(els.windSuggestion, windDirectionSuggestion(dir));
  setText(els.source, sourceName);
}

/* =========================
   Ciclo
   ========================= */

async function refresh(){
  const locId = els.select?.value;
  const loc = LOCATIONS.find(x => x.id === locId) ?? LOCATIONS[0];

  updateWindyCam(loc.lat, loc.lon);

  setText(els.updated, "A atualizar…");
  setText(els.source, "—");

  try{
    const { json, source } = await fetchWeather(loc);

    setText(
      els.updated,
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`
    );

    renderAll(json, source, loc.name);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: recarrega e/ou limpa dados do site no Safari.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) return;

  // preencher localidades
  els.select.innerHTML = "";
  for (const l of LOCATIONS){
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    els.select.appendChild(opt);
  }

  els.select.value = "alcabideche";
  els.select.addEventListener("change", refresh);

  // toggle 48h
  if (els.toggle48 && els.wrap48){
    els.toggle48.addEventListener("click", () => {
      const willShow = els.wrap48.classList.contains("hidden");
      els.wrap48.classList.toggle("hidden", !willShow);
      els.toggle48.textContent = willShow ? "Esconder" : "Mostrar";
    });
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
