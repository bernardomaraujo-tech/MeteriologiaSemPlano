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
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },
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

function windDirShort(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const d = ((deg ?? 0) % 360 + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return dirs[idx];
}
function windDirText(deg){
  const d = ((deg ?? 0) % 360 + 360) % 360;
  return `${windDirShort(d)} (${Math.round(d)}°)`;
}

function hourLabel(iso){ return String(iso).slice(11,16); }
function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday:"short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
  return `${w} ${h}`;
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

/* ===== Modelo simples de “o que vestir” (o teu original) ===== */

function isRainy(pop, mm){
  return (pop ?? 0) >= 25 || (mm ?? 0) >= 0.2;
}
function isWindy(wind, gust){
  return (wind ?? 0) >= 22 || (gust ?? 0) >= 35;
}
function thermalLabel(t){
  if (t <= 6) return "Muito Frio";
  if (t <= 11) return "Frio";
  if (t <= 16) return "Fresco";
  if (t <= 22) return "Agradável";
  return "Quente";
}

function dressCycling(label){
  switch(label){
    case "Muito Frio":
      return "Base layer + Jersey Manga Comprida + Colete + Luvas Grossas + Calças + Proteção Sapatos";
    case "Frio":
      return "Base layer + Jersey Manga Comprida + Colete/Casaco corta-vento + Luvas finas + (Calção+perneiras ou calças leves)";
    case "Fresco":
      return "Base layer + Jersey Manga Comprida + colete opcional";
    case "Agradável":
      return "Jersey Manga Curta";
    case "Quente":
      return "Jersey leve + proteção solar";
    default:
      return "—";
  }
}
function dressRunning(label){
  switch(label){
    case "Muito Frio":
      return "Térmica Manga Comprida + Calças + Corta-vento leve";
    case "Frio":
      return "Manga comprida leve";
    case "Fresco":
      return "T-shirt + camada fina opcional";
    case "Agradável":
      return "T-shirt leve";
    case "Quente":
      return "Muito leve + hidratação";
    default:
      return "—";
  }
}
function dressWalking(){
  return "Vai por camadas e dá mais peso à chuva quando chove (impermeável fino).";
}

function renderDress(now){
  const tempEff = now.feels ?? now.temp;
  const tLabel = thermalLabel(tempEff);

  const rainy = isRainy(now.pop, now.prcp);
  const windy = isWindy(now.wind, now.gust);

  const extrasCommon = [];
  if (windy) extrasCommon.push("Corta-vento/colete");
  if (rainy) extrasCommon.push("Impermeável fino");

  const header = `${tLabel}${rainy ? " · Chuva provável" : ""}${windy ? " · Vento relevante" : ""}`;
  const extrasTxt = extrasCommon.length ? extrasCommon.join(" + ") : "—";

  // Ciclismo
  const bikeBase = dressCycling(tLabel);
  setHTML(els.dressBike, `
    <div><b>${header}</b></div>
    <div>Base: ${bikeBase}${windy ? " (+ corta-vento)" : ""}${rainy ? " (+ impermeável)" : ""}</div>
    <div>Extras: ${extrasTxt}</div>
  `);

  // Corrida (bias leve)
  const runLabel = (tLabel === "Muito Frio") ? "Frio" : tLabel;
  const runBase = dressRunning(runLabel);
  setHTML(els.dressRun, `
    <div><b>${header}</b></div>
    <div>Base: ${runBase}${windy ? " (+ corta-vento)" : ""}${rainy ? " (+ impermeável)" : ""}</div>
    <div>Extras: ${extrasTxt}</div>
  `);

  // Caminhada
  const walkBase = dressWalking();
  setHTML(els.dressWalk, `
    <div><b>${header}</b></div>
    <div>Base: ${walkBase}</div>
    <div>Extras: ${extrasTxt}</div>
  `);
}

/* ===== Open-Meteo ===== */

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

/* ===== UI ===== */

function renderAlerts(data){
  const t = data.hourly.time;
  const start = nearestHourIndex(t);
  const next2 = [start, start+1].filter(x => x < t.length);

  const pops  = data.hourly.precipitation_probability ?? Array(t.length).fill(0);
  const prcps = data.hourly.precipitation ?? Array(t.length).fill(0);
  const gusts = data.hourly.wind_gusts_10m ?? Array(t.length).fill(0);

  const anyRainSoon = next2.some(k => (pops[k] ?? 0) >= 60 || (prcps[k] ?? 0) >= 0.4);
  const anyGustSoon = next2.some(k => (gusts[k] ?? 0) >= 45);

  const out = [];
  if (anyRainSoon) out.push(`<div class="pill">☔ Chuva provável nas próximas 2h</div>`);
  if (anyGustSoon) out.push(`<div class="pill">💨 Rajadas fortes nas próximas 2h</div>`);
  if (!out.length) out.push(`<div class="pill">✅ Sem alertas relevantes nas próximas 2h</div>`);

  setHTML(els.alerts, out.join(""));
}

/* ✅ TABELAS: Hora/Dia + Ícone juntos e fixos */
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

    rows.push(`
      <colgroup>
        <col class="colTime" />
        <col class="colIcon" />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th class="timeCell">Hora</th>
          <th class="iconCell"></th>
          <th>Temp</th>
          <th>Vento</th>
          <th>Raj.</th>
          <th>Dir</th>
          <th>Chuva</th>
          <th>Prob.</th>
        </tr>
      </thead>
      <tbody>
    `);

    for (let i=start; i<Math.min(start+n, t.length); i++){
      const ico = iconForWeatherCode(wcode[i] ?? -1, (isDayArr[i] ?? 1) === 1);
      rows.push(`
        <tr>
          <td class="timeCell">${labelFn(t[i])}</td>
          <td class="iconCell"><span class="icon">${ico}</span></td>
          <td>${Math.round(temp[i])}°</td>
          <td>${fmtKmh(wind[i])}</td>
          <td>${fmtKmh(gust[i])}</td>
          <td>${windDirShort(dir[i])}</td>
          <td>${fmtMm(prcp[i] ?? 0)}</td>
          <td>${pop[i] == null ? "—" : fmtPct(pop[i])}</td>
        </tr>
      `);
    }

    rows.push(`</tbody>`);
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
    els.dirNeedle.style.transform = `translate(-50%, -92%) rotate(${dir}deg)`;
  }

  renderDress({ temp, feels, wind, gust, dir, prcp, pop });

  renderAlerts(data);
  renderTables(data);

  const bw = computeBestWindowNext12h(data);
  const startLbl = weekdayHourLabel(t[bw.idx]);
  const endLbl   = weekdayHourLabel(t[bw.idx + 2] ?? t[bw.idx + 1]);
  setText(els.bestWindow, `${startLbl} → ${endLbl}\nMenos chuva + menos rajadas.`);

  setText(els.windSuggestion, windDirectionSuggestion(dir));
  setText(els.source, sourceName);
}

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
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"short", timeStyle:"short" })}`
    );

    renderAll(json, source, loc.name);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: recarrega e/ou limpa cache do site no Safari.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) return;

  els.select.innerHTML = "";
  for (const l of LOCATIONS){
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    els.select.appendChild(opt);
  }

  els.select.value = "alcabideche";
  els.select.addEventListener("change", refresh);

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
