/* =========================
   SEM PLANO — Meteo (PWA)
   app.js (COMPLETO, anti-crash + anti-cache)
   ========================= */

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

function $(id){ return document.getElementById(id); }

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

function setText(el, txt){ if (el) el.textContent = txt; }
function setHTML(el, html){ if (el) el.innerHTML = html; }

function fatal(msg){
  setText(els.updated, `ERRO: ${msg}`);
  setText(els.source, "Verifica IDs no HTML e cache do Safari.");
  console.error("[SEMPLANO] FATAL:", msg);
}

/* ---------- helpers ---------- */
function fmtKmh(x){ return `${Math.round(x ?? 0)} km/h`; }
function fmtMm(x){ return `${(Math.round(((x ?? 0) * 10)) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x ?? 0)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg ?? 0)}°)`;
}

function hourLabel(iso){ return String(iso).slice(11,16); }

function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday: "short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${w} ${h}`;
}

function buildUrlForecast(loc){
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    timezone: "Europe/Lisbon",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    timeformat: "iso8601",
    past_hours: "1",
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
    const r = await fetch(url, {
      cache: "no-store",
      mode: "cors",
      signal: ctrl.signal
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

async function fetchWeather(loc){
  const url = buildUrlForecast(loc);
  const r = await fetchWithTimeout(url);

  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  if (!json?.hourly?.time?.length) throw new Error("Resposta sem dados (hourly vazio)");
  return { json, source: "Open-Meteo (forecast)" };
}

function nearestHourIndex(times){
  const now = new Date();
  let best = 0;
  let bestDiff = Infinity;
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

/* Melhor janela 07–22 */
function computeBestWindowNext12h(data){
  const times = data.hourly.time;
  const gust  = data.hourly.wind_gusts_10m ?? [];
  const pop   = data.hourly.precipitation_probability ?? Array(times.length).fill(0);
  const prcp  = data.hourly.precipitation ?? Array(times.length).fill(0);

  const start = nearestHourIndex(times);
  const end = Math.min(start + 12, times.length - 2);

  const START_H = 7;
  const LAST_START_H = 20;

  let bestI = null;
  let bestScore = -1;

  const scoreHour = (j) => {
    const popN  = Math.min(Math.max(pop[j] ?? 0, 0), 100) / 100;
    const gustN = Math.min(Math.max(gust[j] ?? 0, 0), 60) / 60;
    const prcpN = Math.min(Math.max(prcp[j] ?? 0, 0), 3) / 3;
    return (1 - (0.65*popN + 0.35*prcpN)) * 0.65 + (1 - gustN) * 0.35;
  };

  for (let i = start; i <= end; i++){
    const h = new Date(times[i]).getHours();
    if (h < START_H || h > LAST_START_H) continue;
    const s = (scoreHour(i) + scoreHour(i+1)) / 2;
    if (s > bestScore){ bestScore = s; bestI = i; }
  }

  if (bestI === null) bestI = start;
  return { idx: bestI, score: bestScore };
}

function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return `De ${from}. Favorece ir para sul; regresso para norte é mais pesado.`;
  if (d >= 45 && d < 135) return `De ${from}. Favorece ir para oeste; regresso para leste é mais pesado.`;
  if (d >= 135 && d < 225) return `De ${from}. Favorece ir para norte; regresso para sul é mais pesado.`;
  return `De ${from}. Favorece ir para leste; regresso para oeste é mais pesado.`;
}

function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }){
  const rainy = (pop ?? 0) >= 50 || (prcp ?? 0) >= 0.3;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let base = "";
  if (temp <= 6) base = "Frio forte";
  else if (temp <= 11) base = "Frio";
  else if (temp <= 16) base = "Fresco";
  else if (temp <= 22) base = "Agradável";
  else base = "Quente";

  if (sport === "bike"){
    if (temp <= 6) return `${base}: base layer + casaco corta-vento + luvas. ${rainy ? "Impermeável." : ""}`;
    if (temp <= 11) return `${base}: manga comprida/colete + luvas finas. ${windy ? "Corta-vento ajuda." : ""} ${rainy ? "Capa leve." : ""}`;
    if (temp <= 16) return `${base}: jersey normal + colete opcional. ${rainy ? "Capa leve." : ""}`;
    if (temp <= 22) return `${base}: jersey leve. ${windy ? "Colete fino em zonas expostas." : ""}`;
    return `${base}: muito leve + água/proteção solar.`;
  }

  if (sport === "run"){
    if (temp <= 6) return `${base}: térmica + corta-vento leve.`;
    if (temp <= 11) return `${base}: manga comprida leve. ${rainy ? "Corta-vento fino." : ""}`;
    if (temp <= 16) return `${base}: t-shirt + camada fina opcional.`;
    if (temp <= 22) return `${base}: t-shirt leve.`;
    return `${base}: muito leve + hidratação.`;
  }

  if (temp <= 6) return `${base}: camadas (térmica + casaco). ${rainy ? "Impermeável." : ""}`;
  if (temp <= 11) return `${base}: casaco leve. ${rainy ? "Impermeável fino." : ""}`;
  if (temp <= 16) return `${base}: camisola leve. ${rainy ? "Capa leve." : ""}`;
  if (temp <= 22) return `${base}: confortável, camada leve opcional.`;
  return `${base}: leve e respirável + água.`;
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
  if (code === 66 || code === 67) return "🌧️";
  if (code === 71 || code === 73 || code === 75 || code === 77) return "❄️";
  if (code === 80 || code === 81 || code === 82) return "🌧️";
  if (code === 85 || code === 86) return "❄️";
  if (code === 95 || code === 96 || code === 99) return "⛈️";
  return "•";
}

/* Gauge */
function buildGaugeTicks(){
  const host = $("tickRotate");
  if (!host || host.dataset.built === "1") return;

  let out = "";
  for (let a = 0; a < 360; a += 10){
    const len = (a % 30 === 0) ? 12 : 7;
    out += `<g transform="rotate(${a} 100 100)">
      <line x1="100" y1="16" x2="100" y2="${16+len}" />
    </g>`;
  }
  host.innerHTML = out;
  host.dataset.built = "1";
}

function updateWindGauge(speedKmh, dirDeg){
  const needle = $("gaugeNeedle");
  const speed = $("gaugeSpeed");
  const rot = ((dirDeg ?? 0) + 180) % 360;
  if (needle) needle.setAttribute("transform", `rotate(${rot} 100 100)`);
  if (speed) speed.textContent = String(Math.round(speedKmh ?? 0));
}

/* Render Alertas */
function renderAlerts(data){
  if (!els.alerts) return;

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
 
