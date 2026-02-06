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

  windyLink: document.getElementById("windyLink"),
};

function fmtKmh(x){ return `${Math.round(x)} km/h`; }
function fmtMm(x){ return `${(Math.round((x ?? 0) * 10) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x ?? 0)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

function hourLabel(iso){ return iso.slice(11,16); }

/* 48h: dia da semana + hora (ex.: "Sáb. 01:00") */
function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday: "short" }); // "sáb."
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${w} ${h}`;
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
      "precipitation_probability",
      "weather_code",
      "is_day"
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

/* Melhor janela: 2h nas próximas 12h, mas só 07:00–22:00 (início até 20:00) */
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
    if (s > bestScore){
      bestScore = s;
      bestI = i;
    }
  }

  /* fallback: tenta até 24h mantendo 07–22 */
  if (bestI === null){
    const end24 = Math.min(start + 24, times.length - 2);
    for (let i = start; i <= end24; i++){
      const h = new Date(times[i]).getHours();
      if (h < START_H || h > LAST_START_H) continue;

      const s = (scoreHour(i) + scoreHour(i+1)) / 2;
      if (s > bestScore){
        bestScore = s;
        bestI = i;
      }
    }
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

/* ===== Gauge (SVG) ===== */
function buildGaugeTicks(){
  const host = document.getElementById("tickRotate");
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

/* seta: por defeito aponta PARA onde sopra (+180).
   Se quiseres “de onde vem”, troca por dirDeg. */
function updateWindGauge(speedKmh, dirDeg){
  const needle = document.getElementById("gaugeNeedle");
  const speed = document.getElementById("gaugeSpeed");
  const rot = (dirDeg + 180) % 360;
  if (needle) needle.setAttribute("transform", `rotate(${rot} 100 100)`);
  if (speed) speed.textContent = String(Math.round(speedKmh));
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

  const make = (n, tableEl, labelFn) => {
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

  make(8,  els.table8,  (iso) => hourLabel(iso
