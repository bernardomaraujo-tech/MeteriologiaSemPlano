const REFRESH_MS = 5 * 60 * 1000;

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 }
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
function dayHourLabel(iso){
  const d = iso.slice(8,10);
  const m = iso.slice(5,7);
  const h = iso.slice(11,16);
  return `${d}/${m} ${h}`;
}

function buildUrl(base, loc){
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
      "precipitation_probability"
    ].join(",")
  });
  return `${base}?${params.toString()}`;
}

async function fetchWithFallback(loc){
  const ecmwfUrl = buildUrl("https://api.open-meteo.com/v1/ecmwf", loc);
  const gfsUrl   = buildUrl("https://api.open-meteo.com/v1/gfs", loc);

  try {
    const r = await fetch(ecmwfUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`ECMWF HTTP ${r.status}`);
    return { json: await r.json(), source: "ECMWF (Open-Meteo)" };
  } catch (_) {
    const r = await fetch(gfsUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`GFS HTTP ${r.status}`);
    return { json: await r.json(), source: "GFS (Open-Meteo) — fallback" };
  }
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

function computeBestWindowNext12h(data){
  const times = data.hourly.time;
  const gust  = data.hourly.wind_gusts_10m ?? [];
  const pop   = data.hourly.precipitation_probability ?? Array(times.length).fill(0);
  const prcp  = data.hourly.precipitation ?? Array(times.length).fill(0);

  const start = nearestHourIndex(times);
  const end = Math.min(start + 12, times.length - 2);

  let bestI = start;
  let bestScore = -1;

  for (let i=start; i<=end; i++){
    const scoreHour = (j) => {
      const popN  = Math.min(Math.max(pop[j] ?? 0, 0), 100) / 100;
      const gustN = Math.min(Math.max(gust[j] ?? 0, 0), 60) / 60;
      const prcpN = Math.min(Math.max(prcp[j] ?? 0, 0), 3) / 3;
      return (1 - (0.65*popN + 0.35*prcpN)) * 0.65 + (1 - gustN) * 0.35;
    };

    const s = (scoreHour(i) + scoreHour(i+1)) / 2;
    if (s > bestScore){ bestScore = s; bestI = i; }
  }

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
    if (temp <= 6) return `${base}: base layer + casaco corta-vento + luvas. ${rainy ? "Impermeável."
