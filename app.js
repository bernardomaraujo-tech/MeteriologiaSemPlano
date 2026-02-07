const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },

  // novas localizações (já tinhas)
  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },

  // novas localizações (agora)
  { id:"estoril", name:"Estoril", lat:38.7061, lon:-9.3977 },
  { id:"columbeira", name:"Columbeira", lat:39.3056, lon:-9.2100 },
  { id:"praiatocha", name:"Praia da Tocha", lat:40.3423, lon:-8.7958 }
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

  // Força modelos preferidos quando indicado
  if (modelsCsv) params.set("models", modelsCsv);

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
  const modelsCsv = PREFERRED_MODELS.join(",");

  // 1) tenta HARMONIE-AROME (Europa)
  try{
    const url1 = buildUrlForecast(loc, modelsCsv);
    const r1 = await fetchWithTimeout(url1);
    if (r1.ok){
      const json1 = await r1.json();
      if (json1?.hourly?.time?.length){
        return { json: json1, source: "Open-Meteo (HARMONIE-AROME)" };
      }
    }
  } catch (_) {}

  // 2) fallback para best match (auto)
  const url2 = buildUrlForecast(loc);
  const r2 = await fetchWithTimeout(url2);
  if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
  const json2 = await r2.json();
  if (!json2?.hourly?.time?.length) throw new Error("hourly vazio");
  return { json: json2, source: "Open-Meteo (Best match)" };
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

  for (let i=start; i<=end; i++){
    const h = new Date(times[i]).getHours();
    if (h < START_H || h > LAST_START_H) continue;
    const s = (scoreHour(i) + scoreHour(i+1)) / 2;
    if (s > bestScore){ bestScore = s; bestI = i; }
  }

  if (bestI === null) bestI = start;
  return { idx: bestI, score: bestScore };
}

/* =========================================================
   SUGESTÃO DE SENTIDO (NOVO) — só afeta a caixa "Sugestão de sentido"
   ========================================================= */
function routeSenseSuggestion(data, startIndex, opts = {}){
  const sport = opts.sport ?? "bike"; // bike | run | walk
  const durationH = opts.durationH ?? (sport === "bike" ? 3 : sport === "run" ? 1.5 : 1.5);
  const blockMin = opts.blockMin ?? 15;

  const t = data.hourly.time ?? [];
  if (!t.length) return "—";

  const temp = data.hourly.temperature_2m ?? [];
  const feels = data.hourly.apparent_temperature ?? temp;
  const wind = data.hourly.wind_speed_10m ?? [];
  const gust = data.hourly.wind_gusts_10m ?? [];
  const wdirFrom = data.hourly.wind_direction_10m ?? [];
  const prcp = data.hourly.precipitation ?? [];
  const pop = data.hourly.precipitation_probability ?? [];
  const wcode = data.hourly.weather_code ?? [];

  const norm360 = (deg) => ((deg % 360) + 360) % 360;
  const angDiff = (a, b) => {
    const d = Math.abs(norm360(a) - norm360(b));
    return d > 180 ? 360 - d : d;
  };
  const dir8 = (deg) => {
    const dirs = ["N","NE","E","SE","S","SO","O","NO"];
    const idx = Math.round(norm360(deg) / 45) % 8;
    return dirs[idx];
  };
  const snapTo8 = (deg) => Math.round(norm360(deg) / 45) * 45;

  const blocks = Math.max(2, Math.round((durationH * 60) / blockMin));
  const half = Math.max(1, Math.floor(blocks / 2));

  const idxForBlock = (b) => {
    const hourOffset = (b * blockMin) / 60;
    const idx = Math.min(startIndex + Math.round(hourOffset), t.length - 1);
    return idx;
  };

  const isThunder = (code) => code === 95 || code === 96 || code === 99;

  const WEIGHTS = {
    bike: { head: 1.00, cross: 0.45, gust: 0.35, rain: 0.55, chill: 0.20 },
    run:  { head: 0.35, cross: 0.15, gust: 0.15, rain: 0.60, chill: 0.45 },
    walk: { head: 0.45, cross: 0.25, gust: 0.20, rain: 0.65, chill: 0.35 },
  }[sport] ?? { head: 0.8, cross: 0.3, gust: 0.3, rain: 0.6, chill: 0.3 };

  function windComponents(i, bearingDeg){
    const ws = Math.max(0, wind[i] ?? 0);
    const from = norm360(wdirFrom[i] ?? 0);
    const to = norm360(from + 180);

    const diff = angDiff(to, bearingDeg);
    const rad = (diff * Math.PI) / 180;

    const along = ws * Math.cos(rad);
    const cross = Math.abs(ws * Math.sin(rad));

    const head = Math.max(0, -along);
    const tail = Math.max(0, along);
    return { head, tail, cross };
  }

  function rainPenalty(i){
    const mm = Math.max(0, prcp[i] ?? 0);
    const p  = Math.max(0, Math.min(100, pop[i] ?? 0)) / 100;
    return (mm * 1.0) + (p * 0.6);
  }

  function chillPenalty(i){
    const f = (feels[i] ?? temp[i] ?? 0);
    if (f >= 12) return 0;
    return (12 - f) / 6;
  }

  function blockScore(i, bearingDeg){
    const { head, cross } = windComponents(i, bearingDeg);
    const g = Math.max(0, gust[i] ?? 0);
    const rp = rainPenalty(i);
    const cp = chillPenalty(i);
    const thunder = isThunder(wcode[i]) ? 6 : 0;

    return (
      WEIGHTS.head  * head +
      WEIGHTS.cross * cross +
      WEIGHTS.gust  * (g / 10) +
      WEIGHTS.rain  * (rp * 3) +
      WEIGHTS.chill * (cp * 2) +
      thunder
    );
  }

  function simulate(option){
    const scores = [];
    let thunderHit = false;

    for (let b=0; b<blocks; b++){
      const i = idxForBlock(b);
      const bearing = (b < half) ? option.b1 : option.b2;
      if (isThunder(wcode[i])) thunderHit = true;
      scores.push(blockScore(i, bearing));
    }

    const avg = (arr) => arr.reduce((a,c)=>a+c,0) / Math.max(1, arr.length);
    const first = scores.slice(0, half);
    const second = scores.slice(half);

    const firstAvg = avg(first);
    const secondAvg = avg(second);
    const totalAvg = avg(scores);
    const improvement = firstAvg - secondAvg;

    const mean = totalAvg;
    const variance = scores.reduce((a,c)=>a + (c-mean)*(c-mean), 0) / Math.max(1, scores.length);
    const std = Math.sqrt(variance);

    return { firstAvg, secondAvg, totalAvg, improvement, std, thunderHit };
  }

  const windFromNow = norm360(wdirFrom[startIndex] ?? 0);
  const windToNow   = norm360(windFromNow + 180);

  const bearingA1 = snapTo8(windToNow);
  const bearingB1 = snapTo8(windFromNow);
  const bearingA2 = norm360(bearingA1 + 180);
  const bearingB2 = norm360(bearingB1 + 180);

  const A = simulate({ b1: bearingA1, b2: bearingA2 });
  const B = simulate({ b1: bearingB1, b2: bearingB2 });

  if (A.thunderHit && B.thunderHit){
    return `⚠️ Trovoada prevista durante o período do treino. Evita uma volta longa agora (segurança > sentido).`;
  }

  const candidates = [
    { key: "A", b1: bearingA1, b2: bearingA2, sim: A },
    { key: "B", b1: bearingB1, b2: bearingB2, sim: B },
  ].filter(c => !c.sim.thunderHit);

  candidates.sort((c1, c2) => {
    if (c2.sim.improvement !== c1.sim.improvement) return c2.sim.improvement - c1.sim.improvement;
    return c1.sim.totalAvg - c2.sim.totalAvg;
  });

  const best = candidates[0] ?? { key:"A", b1:bearingA1, b2:bearingA2, sim:A };
  const other = (best.key === "A") ? B : A;

  const diff = Math.abs(best.sim.improvement - other.improvement);
  const denom = (best.sim.std + other.std) / 2 || 1;
  const ratio = diff / denom;

  let conf = "Baixa";
  if (ratio >= 1.2) conf = "Alta";
  else if (ratio >= 0.6) conf = "Média";

  const reasons = [];
  if (best.sim.improvement > 0.6) reasons.push("2ª metade claramente mais confortável");
  else if (best.sim.improvement > 0.2) reasons.push("2ª metade ligeiramente melhor");
  else reasons.push("diferenças pequenas (pouco impacto)");

  const avgOf = (arr) => arr.reduce((a,c)=>a+c,0)/Math.max(1,arr.length);
  const blocksIdx = Array.from({length: blocks}, (_,b)=>idxForBlock(b));
  const firstIdx = blocksIdx.slice(0, half);
  const secondIdx = blocksIdx.slice(half);

  const gustFirst = avgOf(firstIdx.map(i=>gust[i] ?? 0));
  const gustSecond = avgOf(secondIdx.map(i=>gust[i] ?? 0));
  if (gustSecond < gustFirst - 3) reasons.push("rajadas descem no final");
  else if (gustSecond > gustFirst + 3) reasons.push("rajadas sobem no final");

  const rainFirst = avgOf(firstIdx.map(i=>prcp[i] ?? 0));
  const rainSecond = avgOf(secondIdx.map(i=>prcp[i] ?? 0));
  if (rainSecond < rainFirst - 0.2) reasons.push("menos chuva no final");
  else if (rainSecond > rainFirst + 0.2) reasons.push("mais chuva no final");

  const startDir = dir8(best.b1);
  const endDir   = dir8(best.b2);

  const sportLabel = (sport === "bike") ? "Bicicleta" : (sport === "run") ? "Corrida" : "Caminhada";

  return `Sentido recomendado (${sportLabel} ~${durationH}h) — começa para ${startDir} e fecha para ${endDir}.
Confiança: ${conf}.
Razões: ${reasons.slice(0,3).join(" · ")}.`;
}

/* O que vestir — versão simples (as tuas regras) */
function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }){
  const rainy = (pop ?? 0) >= 25 || (prcp ?? 0) >= 0.2;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let base = "";
  if (temp <= 6) base = "Muito Frio";
  else if (temp <= 11) base = "Frio";
  else if (temp <= 16) base = "Fresco";
  else if (temp <= 22) base = "Agradável";
  else base = "Quente";

  const rainAddon = rainy ? " + Impermeável" : "";
  const windAddon = windy ? " + Corta-vento/Colete" : "";

  if (sport === "bike"){
    if (temp <= 6)  return `${base}: Base layer + Jersey M.Comp. + Colete + Luvas grossas + Calças + Proteção sapatos${rainAddon}`;
    if (temp <= 11) return `${base}: Base layer + Jersey M.Comp. + Colete + Luvas finas + Calção${windAddon}${rainAddon}`;
    if (temp <= 16) return `${base}: Base layer + Jersey M.Comp.. + Colete opcional${rainAddon}`;
    if (temp <= 22) return `${base}: Jersey M.Comp.${windAddon}${rainAddon}`;
    return `${base}: Jersey leve + proteção solar${rainAddon}`;
  }

  if (sport === "run"){
    if (temp <= 6)  return `${base}: Térmica ML + Calças + Corta-vento leve${rainAddon}${windAddon}`;
    if (temp <= 11) return `${base}: Manga comprida leve${rainAddon}${windAddon}`;
    if (temp <= 16) return `${base}: T-shirt + camada fina opcional${rainAddon}${windAddon}`;
    if (temp <= 22) return `${base}: T-shirt leve${rainAddon}${windAddon}`;
    return `${base}: Muito leve + hidratação${rainAddon}${windAddon}`;
  }

  // walk
  if (temp <= 6)  return `${base}: Camadas (térmica + casaco)${rainAddon}${windAddon}`;
  if (temp <= 11) return `${base}: Casaco leve${rainAddon}${windAddon}`;
  if (temp <= 16) return `${base}: Camisola leve + camada extra opcional${rainAddon}${windAddon}`;
  if (temp <= 22) return `${base}: Confortável, camada leve opcional${rainAddon}${windAddon}`;
  return `${base}: Leve e respirável + água${rainAddon}${windAddon}`;
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

  make(8,  els.table8,  (iso) => hourLabel(iso));
  make(48, els.table48, (iso) => weekdayHourLabel(iso));
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
    els.dirNeedle.style.transform = `translate(-50%, -92%) rotate(${(dir + 180) % 360}deg)`;
  }

  const tempEff = (feels ?? temp);

  setText(els.dressBike, clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"bike" }));
  setText(els.dressRun,  clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"run" }));
  setText(els.dressWalk, clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"walk" }));

  renderAlerts(data);
  renderTables(data);

  const bw = computeBestWindowNext12h(data);
  const startLbl = weekdayHourLabel(t[bw.idx]);
  const endLbl   = weekdayHourLabel(t[bw.idx + 2] ?? t[bw.idx + 1]);
  setText(els.bestWindow, `${startLbl} → ${endLbl}\nMenos chuva + menos rajadas.`);

  // ✅ Só muda esta caixa (Sugestão de sentido)
  setText(
    els.windSuggestion,
    routeSenseSuggestion(data, i, { sport: "bike", durationH: 3, blockMin: 15 })
  );

  setText(els.source, sourceName);
}

async function refresh(){
  const locId = els.select?.value;
  const loc = LOCATIONS.find(x => x.id === locId) ?? LOCATIONS[0];

  updateWindyCam(loc.lat, loc.lon);
  setText(els.updated, "A atualizar…");
  setText(els.source, "—");

  try{
    const { json, source
