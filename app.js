const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

// Localizações (Alcabideche mantém-se default)
const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },

  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"columbeira", name:"Columbeira", lat:39.3149, lon:-9.2047 },
  { id:"estoril", name:"Estoril", lat:38.7057, lon:-9.3977 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"praia_tocha", name:"Praia da Tocha", lat:40.3228, lon:-8.8014 },
  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 }
];

// Helpers DOM
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

  windyLink: $("windyLink")
};

// Formatadores
const fmtKmh = (x) => `${Math.round(x ?? 0)} km/h`;
const fmtMm  = (x) => `${(Math.round((x ?? 0) * 10) / 10).toFixed(1)} mm`;
const fmtPct = (x) => `${Math.round(x ?? 0)}%`;

// Direção do vento
function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg ?? 0)}°)`;
}

const hourLabel = (iso) => String(iso).slice(11,16);

function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday:"short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
  return `${w} ${h}`;
}

// URL Open-Meteo
function buildUrlForecast(loc, modelsCsv){
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

  if (modelsCsv) params.set("models", modelsCsv);
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

// Fetch com timeout
async function fetchWithTimeout(url){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache:"no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Fetch weather (AROME → fallback)
async function fetchWeather(loc){
  const modelsCsv = PREFERRED_MODELS.join(",");

  try {
    const r = await fetchWithTimeout(buildUrlForecast(loc, modelsCsv));
    if (r.ok){
      const json = await r.json();
      if (json?.hourly?.time?.length){
        return { json, source:"Open-Meteo (HARMONIE-AROME)" };
      }
    }
  } catch {}

  const r2 = await fetchWithTimeout(buildUrlForecast(loc));
  if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
  const json2 = await r2.json();
  return { json: json2, source:"Open-Meteo (Best match)" };
}

// Utilitários de tempo
function nearestHourIndex(times){
  const now = Date.now();
  let best = 0, diff = Infinity;
  times.forEach((t,i)=>{
    const d = Math.abs(new Date(t).getTime() - now);
    if (d < diff){ diff = d; best = i; }
  });
  return best;
}

function computeMinMaxNext24h(temps, i){
  let min = Infinity, max = -Infinity;
  for (let k=i; k<Math.min(i+24, temps.length); k++){
    min = Math.min(min, temps[k]);
    max = Math.max(max, temps[k]);
  }
  return { min, max };
}

// Sugestão simples de sentido (vamos evoluir depois)
function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;

  if (d >= 315 || d < 45)
    return `Vento de ${from}. Começar contra vento (norte → sul) e terminar mais protegido.`;
  if (d < 135)
    return `Vento de ${from}. Começar contra vento (este → oeste) e terminar mais rápido.`;
  if (d < 225)
    return `Vento de ${from}. Começar contra vento (sul → norte) e terminar favorável.`;

  return `Vento de ${from}. Começar contra vento (oeste → este) e guardar o melhor para o fim.`;
}

// Render principal
function renderAll(data, sourceName, locName){
  const t = data.hourly.time;
  const i = nearestHourIndex(t);

  const temp  = data.hourly.temperature_2m[i];
  const feels = data.hourly.apparent_temperature?.[i] ?? temp;
  const wind  = data.hourly.wind_speed_10m[i];
  const gust  = data.hourly.wind_gusts_10m[i];
  const dir   = data.hourly.wind_direction_10m[i];
  const prcp  = data.hourly.precipitation?.[i] ?? 0;
  const pop   = data.hourly.precipitation_probability?.[i] ?? 0;

  const { min, max } = computeMinMaxNext24h(data.hourly.temperature_2m, i);

  setText(els.heroLoc, locName);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroMeta, `Sensação: ${Math.round(feels)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  if (els.dirNeedle){
    els.dirNeedle.style.transform =
      `translate(-50%, -92%) rotate(${(dir + 180) % 360}deg)`;
  }

  setText(els.windSuggestion, windDirectionSuggestion(dir));
  setText(els.source, sourceName);
}

// Refresh
async function refresh(){
  const loc = LOCATIONS.find(l => l.id === els.select.value) || LOCATIONS[0];
  setText(els.updated, "A atualizar…");

  try {
    const { json, source } = await fetchWeather(loc);
    setText(
      els.updated,
      `Última atualização: ${new Date().toLocaleString("pt-PT", {
        dateStyle:"medium", timeStyle:"short"
      })}`
    );
    renderAll(json, source, loc.name);
  } catch (e){
    setText(els.updated, "Erro ao atualizar dados.");
    console.error(e);
  }
}

// Init
function init(){
  if (!els.select) return;

  LOCATIONS.forEach(l=>{
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    els.select.appendChild(o);
  });

  els.select.value = "alcabideche";
  els.select.addEventListener("change", refresh);

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
