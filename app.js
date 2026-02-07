const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

// Localizações (Alcabideche fixa no topo, restantes por ordem alfabética)
const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },

  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"columbeira", name:"Columbeira", lat:39.3056, lon:-9.2100 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"estoril", name:"Estoril", lat:38.7061, lon:-9.3977 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"praiatocha", name:"Praia da Tocha", lat:40.3423, lon:-8.7958 },
  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
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

function buildUrlForecast(loc, modelsCsv){
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
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

  if (modelsCsv) params.set("models", modelsCsv);

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWithTimeout(url){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try{
    return await fetch(url, { cache:"no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchWeather(loc){
  const modelsCsv = PREFERRED_MODELS.join(",");

  try{
    const r = await fetchWithTimeout(buildUrlForecast(loc, modelsCsv));
    const j = await r.json();
    if (j?.hourly?.time?.length){
      return { json: j, source: "Open-Meteo (HARMONIE-AROME)" };
    }
  } catch {}

  const r = await fetchWithTimeout(buildUrlForecast(loc));
  const j = await r.json();
  return { json: j, source: "Open-Meteo (Best match)" };
}

function nearestHourIndex(times){
  const now = Date.now();
  return times.reduce((best,i,idx)=>{
    const d = Math.abs(new Date(i).getTime()-now);
    return d<best.d?{i:idx,d}:{...best};
  },{i:0,d:Infinity}).i;
}

function computeMinMaxNext24h(temps, i){
  const slice = temps.slice(i, i+24);
  return { min: Math.min(...slice), max: Math.max(...slice) };
}

function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;

  if (d >= 315 || d < 45)
    return `Vento ${from}. Começa para norte, termina para sul (melhora no fim).`;
  if (d < 135)
    return `Vento ${from}. Começa para leste, termina para oeste (melhora no fim).`;
  if (d < 225)
    return `Vento ${from}. Começa para sul, termina para norte (melhora no fim).`;
  return `Vento ${from}. Começa para oeste, termina para leste (melhora no fim).`;
}

function renderAll(data, source, name){
  const i = nearestHourIndex(data.hourly.time);

  const temp = data.hourly.temperature_2m[i];
  const feels = data.hourly.apparent_temperature?.[i] ?? temp;
  const wind = data.hourly.wind_speed_10m[i];
  const gust = data.hourly.wind_gusts_10m[i];
  const dir = data.hourly.wind_direction_10m[i];
  const prcp = data.hourly.precipitation[i] ?? 0;
  const pop = data.hourly.precipitation_probability?.[i] ?? 0;

  const { min, max } = computeMinMaxNext24h(data.hourly.temperature_2m, i);

  setText(els.heroLoc, name);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroMeta, `Sensação ${Math.round(feels)}° · Máx ${Math.round(max)}° · Mín ${Math.round(min)}°`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  if (els.dirNeedle){
    els.dirNeedle.style.transform =
      `translate(-50%,-92%) rotate(${(dir+180)%360}deg)`;
  }

  setText(els.windSuggestion, windDirectionSuggestion(dir));
  setText(els.source, source);
}

async function refresh(){
  const loc = LOCATIONS.find(l => l.id === els.select.value) ?? LOCATIONS[0];
  setText(els.updated, "A atualizar…");

  const { json, source } = await fetchWeather(loc);
  setText(
    els.updated,
    `Atualizado: ${new Date().toLocaleString("pt-PT",{timeStyle:"short",dateStyle:"medium"})}`
  );
  renderAll(json, source, loc.name);
}

function init(){
  LOCATIONS.forEach(l=>{
    const o=document.createElement("option");
    o.value=l.id; o.textContent=l.name;
    els.select.appendChild(o);
  });
  els.select.value="alcabideche";
  els.select.addEventListener("change",refresh);
  refresh();
  setInterval(refresh,REFRESH_MS);
}

init();
