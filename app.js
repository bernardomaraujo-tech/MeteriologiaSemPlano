const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },

  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },

  // Se não tiveres estas 2 ainda, podes apagar já (não afeta as imagens)
  { id:"sdrana", name:"São Domingos de Rana", lat:38.7089, lon:-9.3529 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6852, lon:-9.3369 }
];

// ---------- util ----------
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const round0 = (n) => Math.round(n);
const kmh = (ms) => ms * 3.6;

function dirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const i = Math.round(((deg % 360) / 45)) % 8;
  return dirs[i];
}

function setText(el, txt){ if (el) el.textContent = txt; }

function weekdayHourLabel(iso){
  const d = new Date(iso);
  const wd = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()];
  return `${wd} ${pad2(d.getHours())}:00`;
}

/* ---------- Sky (foto real) + Dia/Noite ---------- */

// ficheiros que tens no repo (pelo teu print)
const SKY_FILES = new Set([
  "day_clear.jpg",
  "day_cloudy.jpg",
  "day_fog.jpg",
  "day_storm.jpg",
  "night_clear.jpg",
  "night_cloudy.jpg",
  "night_fog.jpg",
  "night_rain.jpg",
  "night_storm.jpg"
  // NOTA: day_rain.jpg não aparece no print, por isso não conto com ela
]);

function applyDayNight(isDay){
  document.body.classList.toggle("is-day", !!isDay);
  document.body.classList.toggle("is-night", !isDay);

  // Opcional: melhora PWA iOS/Android (barra do browser)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta){
    meta.setAttribute("content", isDay ? "#6fa7c6" : "#1f2f44");
  }
}

function pickExisting(...candidates){
  for (const f of candidates){
    if (SKY_FILES.has(f)) return f;
  }
  return candidates[candidates.length - 1];
}

function skyImageFor(code, isDay){
  const day = !!isDay;

  const isStorm = [95,96,99].includes(code);
  const isRain  = [61,63,65,80,81,82].includes(code);
  const isFog   = [45,48].includes(code);
  const isCloud = [2,3].includes(code);

  if (day){
    if (isStorm) return pickExisting("day_storm.jpg", "day_cloudy.jpg");
    if (isRain)  return pickExisting("day_rain.jpg", "day_cloudy.jpg"); // fallback aqui
    if (isFog)   return pickExisting("day_fog.jpg", "day_cloudy.jpg");
    if (isCloud) return pickExisting("day_cloudy.jpg", "day_clear.jpg");
    return pickExisting("day_clear.jpg");
  } else {
    if (isStorm) return pickExisting("night_storm.jpg", "night_cloudy.jpg");
    if (isRain)  return pickExisting("night_rain.jpg", "night_cloudy.jpg");
    if (isFog)   return pickExisting("night_fog.jpg", "night_cloudy.jpg");
    if (isCloud) return pickExisting("night_cloudy.jpg", "night_clear.jpg");
    return pickExisting("night_clear.jpg");
  }
}

function setSky({ code, isDay }){
  applyDayNight(isDay);

  const img = skyImageFor(code, isDay);
  if (els.skyImg){
    els.skyImg.style.backgroundImage = `url(./${img})`;
  }

  // FX muito leve (chuva/nevoeiro) — não depende de day_rain.jpg
  if (els.skyFx){
    const rainy = [61,63,65,80,81,82,95,96,99].includes(code);
    const foggy = [45,48].includes(code);

    if (rainy){
      els.skyFx.style.opacity = ".45";
      els.skyFx.style.background =
        "repeating-linear-gradient(115deg, rgba(255,255,255,.14) 0 2px, rgba(255,255,255,0) 2px 12px)";
      els.skyFx.style.animation = "rainMove 1.05s linear infinite";
    } else if (foggy){
      els.skyFx.style.opacity = ".30";
      els.skyFx.style.background =
        "radial-gradient(closest-side at 30% 40%, rgba(255,255,255,.18), rgba(255,255,255,0) 70%)," +
        "radial-gradient(closest-side at 70% 55%, rgba(255,255,255,.14), rgba(255,255,255,0) 72%)";
      els.skyFx.style.animation = "cloudsDrift 46s linear infinite";
    } else {
      els.skyFx.style.opacity = "0";
      els.skyFx.style.background = "none";
      els.skyFx.style.animation = "none";
    }
  }
}

function updateSkyHeight(){
  const nowCard = document.getElementById("nowCard");
  if (!nowCard) return;
  const r = nowCard.getBoundingClientRect();
  const h = Math.max(260, Math.round(r.bottom));
  document.documentElement.style.setProperty("--sky-height", `${h}px`);
}

// ---------- fetch ----------
function buildUrlForecast(lat, lon, model){
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    forecast_days: "3",
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "is_day"
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min"
    ].join(","),
    wind_speed_unit: "ms",
    precipitation_unit: "mm"
  });

  if (model) params.set("models", model);
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWithTimeout(url, timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { signal: ctrl.signal, cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally{
    clearTimeout(t);
  }
}

async function fetchForecastPreferred(lat, lon){
  for (const m of PREFERRED_MODELS){
    try{
      const url = buildUrlForecast(lat, lon, m);
      const j = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      return { data: j, source: m };
    }catch(e){}
  }
  const url = buildUrlForecast(lat, lon, null);
  const j = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  return { data: j, source: "open-meteo (auto)" };
}

// ---------- lógica “produto” ----------
function thermalLabel(t){
  if (t <= 6) return "Muito Frio";
  if (t <= 11) return "Frio";
  if (t <= 16) return "Fresco";
  if (t <= 22) return "Agradável";
  return "Quente";
}

function clothingSuggestion(temp, windKmh, gustKmh, pop, precip){
  const rainy = (pop >= 25) || (precip >= 0.2);
  const windy = (windKmh >= 22) || (gustKmh >= 35);

  const feel = thermalLabel(temp);

  const base = [];
  if (feel === "Muito Frio") base.push("Base layer", "Jersey ML", "Colete", "Luvas grossas", "Calças", "Proteção sapatos");
  else if (feel === "Frio") base.push("Base layer", "Jersey ML", "Colete", "Luvas", "Calças/Perneiras");
  else if (feel === "Fresco") base.push("Jersey", "Manguitos", "Colete opcional");
  else if (feel === "Agradável") base.push("Jersey", "Calções");
  else base.push("Jersey leve", "Calções");

  if (windy) base.push("Corta-vento");
  if (rainy) base.push("Impermeável");

  return base.join(" + ");
}

function alertsText(temp, windKmh, gustKmh, pop, precip){
  const lines = [];
  const rainy = (pop >= 25) || (precip >= 0.2);
  const windy = (windKmh >= 22) || (gustKmh >= 35);

  if (rainy) lines.push("• Risco de chuva: leva impermeável.");
  if (windy) lines.push("• Vento relevante: corta-vento recomendado.");
  if (temp <= 6) lines.push("• Muito frio: atenção às mãos/pés.");
  return lines.length ? lines.join("\n") : "Sem alertas relevantes.";
}

function bestWindow(data, nowIdx){
  const times = data.hourly.time;
  const n = times.length;
  const start = nowIdx;
  const end = Math.min(n - 2, nowIdx + 12);

  let best = null;

  for (let i = start; i <= end; i++){
    const d1 = new Date(times[i]);
    const d2 = new Date(times[i+1]);

    const h1 = d1.getHours();
    const h2 = d2.getHours();
    if (h1 < 7 || h2 > 22) continue;

    const pop1 = data.hourly.precipitation_probability?.[i] ?? 0;
    const pop2 = data.hourly.precipitation_probability?.[i+1] ?? 0;
    const p1 = data.hourly.precipitation?.[i] ?? 0;
    const p2 = data.hourly.precipitation?.[i+1] ?? 0;

    const w1 = kmh(data.hourly.wind_speed_10m?.[i] ?? 0);
    const w2 = kmh(data.hourly.wind_speed_10m?.[i+1] ?? 0);
    const g1 = kmh(data.hourly.wind_gusts_10m?.[i] ?? 0);
    const g2 = kmh(data.hourly.wind_gusts_10m?.[i+1] ?? 0);

    const rainPenalty = (pop1 + pop2) / 2 + (p1 + p2) * 30;
    const windPenalty = ((w1 + w2) / 2) + ((g1 + g2) / 2) * 0.35;

    const score = 1000 - rainPenalty * 6 - windPenalty * 4;

    if (!best || score > best.score){
      best = { i, score, from: fmtTime(d1), to: fmtTime(d2), pop: Math.round((pop1+pop2)/2), wind: Math.round((w1+w2)/2) };
    }
  }

  if (!best) return "Sem janela boa dentro das próximas 12h (07–22).";
  return `Melhor: ${best.from}–${best.to}\nProb. chuva ~${best.pop}% · Vento ~${best.wind} km/h`;
}

function windSuggestionText(dirDeg){
  const t = dirText(dirDeg);
  return `Vento de ${t}.`;
}

// ---------- UI ----------
const els = {
  heroLoc: $("heroLoc"),
  heroTemp: $("heroTemp"),
  heroMeta: $("heroMeta"),
  updated: $("updated"),
  locationSelect: $("locationSelect"),

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
  bestWindow: $("bestWindow"),
  windSuggestion: $("windSuggestion"),

  toggle48: $("toggle48"),
  wrap48: $("wrap48"),
  table48: $("table48"),

  source: $("source"),
  windyCam: $("windyCam"),
  windyLink: $("windyLink"),

  // Sky
  skyReal: $("skyReal"),
  skyImg: $("skyImg"),
  skyFx: $("skyFx"),
};

let state = { loc: LOCATIONS[0] };

function fillLocations(){
  els.locationSelect.innerHTML = "";
  for (const l of LOCATIONS){
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    els.locationSelect.appendChild(opt);
  }
  els.locationSelect.value = state.loc.id;

  els.locationSelect.addEventListener("change", () => {
    const id = els.locationSelect.value;
    state.loc = LOCATIONS.find(x => x.id === id) || LOCATIONS[0];
    refresh();
  });
}

function renderTableHours(el, data, startIdx, hours){
  const t = data.hourly.time;
  const rows = [];
  rows.push(`<tr>
    <th>Hora</th><th></th><th>Temp</th><th>Chuva</th><th>Prob</th><th>Vento</th><th>Raj</th>
  </tr>`);

  for (let i = startIdx; i < startIdx + hours && i < t.length; i++){
    const label = weekdayHourLabel(t[i]);
    const temp = round0(data.hourly.temperature_2m?.[i] ?? 0);
    const pr = data.hourly.precipitation?.[i] ?? 0;
    const pop = data.hourly.precipitation_probability?.[i] ?? 0;
    const wind = round0(kmh(data.hourly.wind_speed_10m?.[i] ?? 0));
    const gust = round0(kmh(data.hourly.wind_gusts_10m?.[i] ?? 0));
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    const icon = (code >= 61 && code <= 82) ? "🌧️" : (code === 45 || code === 48) ? "🌫️" : (code >= 95) ? "⛈️" : (code === 0) ? (isDay ? "☀️" : "🌙") : "☁️";

    rows.push(`<tr>
      <td>${label}</td>
      <td class="iconCell">${icon}</td>
      <td>${temp}°</td>
      <td>${pr.toFixed(1)} mm</td>
      <td>${pop}%</td>
      <td>${wind} km/h</td>
      <td>${gust} km/h</td>
    </tr>`);
  }

  el.innerHTML = rows.join("");
}

function findNearestHourIndex(times){
  const now = Date.now();
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < times.length; i++){
    const d = Math.abs(new Date(times[i]).getTime() - now);
    if (d < bestD){
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function updateWindNeedle(deg){
  if (!els.dirNeedle) return;
  els.dirNeedle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
}

function updateWindyEmbed(lat, lon){
  if (els.windyCam){
    els.windyCam.setAttribute("data-params", JSON.stringify({ lat, lon, radius: 15, limit: 1 }));
  }
  if (els.windyLink){
    els.windyLink.href = `https://www.windy.com/webcams/${lat}/${lon}`;
  }
}

function renderAll(data, sourceName){
  const i = findNearestHourIndex(data.hourly.time);

  const temp  = data.hourly.temperature_2m?.[i] ?? 0;
  const feels = data.hourly.apparent_temperature?.[i] ?? temp;
  const wind  = kmh(data.hourly.wind_speed_10m?.[i] ?? 0);
  const gust  = kmh(data.hourly.wind_gusts_10m?.[i] ?? 0);
  const dir   = data.hourly.wind_direction_10m?.[i] ?? 0;
  const pr    = data.hourly.precipitation?.[i] ?? 0;
  const pop   = data.hourly.precipitation_probability?.[i] ?? 0;

  // Sky
  const code = data.hourly.weather_code?.[i] ?? 0;
  const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;
  setSky({ code, isDay });

  const dMax = data.daily.temperature_2m_max?.[0] ?? temp;
  const dMin = data.daily.temperature_2m_min?.[0] ?? temp;

  setText(els.heroLoc, state.loc.name);
  setText(els.heroTemp, `${round0(temp)}°`);
  setText(els.heroMeta, `Sensação: ${round0(feels)}° · Máx: ${round0(dMax)}° · Mín: ${round0(dMin)}°`);
  setText(els.updated, `Atualizado: ${fmtTime(new Date())}`);

  setText(els.nowWind, `${round0(wind)} km/h`);
  setText(els.nowGust, `${round0(gust)} km/h`);
  setText(els.nowDirTxt, `${dirText(dir)} (${round0(dir)}°)`);
  setText(els.nowRain, `${pr.toFixed(1)} mm`);
  setText(els.nowPop, `${round0(pop)}%`);

  updateWindNeedle(dir);

  setText(els.dressBike, clothingSuggestion(feels, wind, gust, pop, pr));
  setText(els.dressRun,  clothingSuggestion(feels, wind, gust, pop, pr));
  setText(els.dressWalk, clothingSuggestion(feels, wind, gust, pop, pr));

  setText(els.alerts, alertsText(feels, wind, gust, pop, pr));
  renderTableHours(els.table8, data, i, 8);
  setText(els.bestWindow, bestWindow(data, i));
  setText(els.windSuggestion, windSuggestionText(dir));

  if (els.toggle48 && els.wrap48){
    els.toggle48.onclick = () => {
      const hidden = els.wrap48.classList.toggle("hidden");
      els.toggle48.textContent = hidden ? "Mostrar" : "Esconder";
      if (!hidden) renderTableHours(els.table48, data, i, 48);
    };
  }

  setText(els.source, sourceName);

  updateSkyHeight();
}

async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
}

async function refresh(){
  const { lat, lon } = state.loc;
  updateWindyEmbed(lat, lon);

  try{
    const { data, source } = await fetchForecastPreferred(lat, lon);
    renderAll(data, source);
  }catch(e){
    setText(els.alerts, "Erro a obter previsão. Verifica ligação.");
  }
}

function init(){
  fillLocations();
  registerSW();
  refresh();
  setInterval(refresh, REFRESH_MS);
  window.addEventListener("resize", updateSkyHeight);
}

init();
