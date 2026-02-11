const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
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

  skyImg: $("skyImg"),
  skyFx: $("skyFx"),
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

function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return `De ${from}. Favorece ir para sul; regresso para norte é mais pesado.`;
  if (d >= 45 && d < 135) return `De ${from}. Favorece ir para oeste; regresso para leste é mais pesado.`;
  if (d >= 135 && d < 225) return `De ${from}. Favorece ir para norte; regresso para sul é mais pesado.`;
  return `De ${from}. Favorece ir para leste; regresso para oeste é mais pesado.`;
}

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
    if (temp <= 16) return `${base}: Base layer + Jersey M.Comp. + Colete opcional${rainAddon}`;
    if (temp <= 22) return `${base}: Jersey Manga Curta${windAddon}${rainAddon}`;
    return `${base}: Jersey leve + proteção solar${rainAddon}`;
  }

  if (sport === "run"){
    if (temp <= 6)  return `${base}: Térmica ML + Calças + Corta-vento leve${rainAddon}${windAddon}`;
    if (temp <= 11) return `${base}: Manga comprida leve${rainAddon}${windAddon}`;
    if (temp <= 16) return `${base}: T-shirt + camada fina opcional${rainAddon}${windAddon}`;
    if (temp <= 22) return `${base}: T-shirt leve${rainAddon}${windAddon}`;
    return `${base}: Muito leve + hidratação${rainAddon}${windAddon}`;
  }

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

function updateSkyHeight(){
  const vh = Math.round(window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--sky-height", `${vh}px`);
}

function applyDayNight(isDay){
  document.body.classList.toggle("is-day", !!isDay);
  document.body.classList.toggle("is-night", !isDay);
}

function skyFileFor(code, isDay){
  const storm = [95,96,99].includes(code);
  const rain  = [61,63,65,80,81,82].includes(code);
  const fog   = [45,48].includes(code);
  const cloud = [2,3].includes(code);

  if (isDay){
    if (storm) return "day_storm.jpg";
    if (rain)  return "day_rain.jpg";
    if (fog)   return "day_fog.jpg";
    if (cloud) return "day_cloudy.jpg";
    return "day_clear.jpg";
  } else {
    if (storm) return "night_storm.jpg";
    if (rain)  return "night_rain.jpg";
    if (fog)   return "night_fog.jpg";
    if (cloud) return "night_cloudy.jpg";
    return "night_clear.jpg";
  }
}

function setSkyFx(code){
  if (!els.skyFx) return;

  const rainy = [61,63,65,80,81,82,95,96,99].includes(code);
  const foggy = [45,48].includes(code);

  if (rainy){
    els.skyFx.style.opacity = ".45";
    els.skyFx.style.background =
      "repeating-linear-gradient(115deg, rgba(255,255,255,.14) 0 2px, rgba(255,255,255,0) 2px 12px)";
    els.skyFx.style.animation = "rainMove 1.05s linear infinite";
    return;
  }

  if (foggy){
    els.skyFx.style.opacity = ".25";
    els.skyFx.style.background =
      "radial-gradient(closest-side at 30% 40%, rgba(255,255,255,.18), rgba(255,255,255,0) 70%)," +
      "radial-gradient(closest-side at 70% 55%, rgba(255,255,255,.14), rgba(255,255,255,0) 72%)";
    els.skyFx.style.animation = "cloudsDrift 46s linear infinite";
    return;
  }

  els.skyFx.style.opacity = "0";
  els.skyFx.style.background = "none";
  els.skyFx.style.animation = "none";
}

function tintBackgroundFromImage(path){
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `./${path}`;

  img.onload = () => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    c.width = 24; c.height = 24;
    ctx.drawImage(img, 0, 0, 24, 24);

    const data = ctx.getImageData(0, 0, 24, 24).data;
    let r=0,g=0,b=0,n=0;

    for (let i=0; i<data.length; i+=4){
      const a = data[i+3];
      if (a < 200) continue;
      r += data[i]; g += data[i+1]; b += data[i+2];
      n++;
    }
    if (!n) return;

    r = Math.round(r/n);
    g = Math.round(g/n);
    b = Math.round(b/n);

    // Gradiente base
    document.documentElement.style.setProperty("--bg1", `rgb(${Math.min(255, r+14)}, ${Math.min(255, g+14)}, ${Math.min(255, b+14)})`);
    document.documentElement.style.setProperty("--bg2", `rgb(${r}, ${g}, ${b})`);
    document.documentElement.style.setProperty("--bg3", `rgb(${Math.max(0, r-22)}, ${Math.max(0, g-22)}, ${Math.max(0, b-22)})`);

    // Luminosidade (0..1)
    const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;

    // ✅ Regra simples e eficaz:
    // Imagem clara => caixas escuras
    // Imagem escura => caixas claras
    const isBright = lum > 0.58;

    if (isBright){
      // GLASS DARK
      document.documentElement.style.setProperty("--cardBg",  "rgba(0,0,0,.42)");
      document.documentElement.style.setProperty("--cardBg2", "rgba(0,0,0,.30)");
      document.documentElement.style.setProperty("--pillBg",  "rgba(0,0,0,.22)");
      document.documentElement.style.setProperty("--selectBg","rgba(0,0,0,.22)");
      document.documentElement.style.setProperty("--stickyBg","rgba(0,0,0,.58)");
      document.documentElement.style.setProperty("--line",    "rgba(255,255,255,.22)");
      document.documentElement.style.setProperty("--textShadow","0 2px 10px rgba(0,0,0,.55)");
    } else {
      // GLASS LIGHT (para fundos escuros)
      document.documentElement.style.setProperty("--cardBg",  "rgba(255,255,255,.22)");
      document.documentElement.style.setProperty("--cardBg2", "rgba(255,255,255,.12)");
      document.documentElement.style.setProperty("--pillBg",  "rgba(0,0,0,.10)");
      document.documentElement.style.setProperty("--selectBg","rgba(255,255,255,.18)");
      document.documentElement.style.setProperty("--stickyBg","rgba(0,0,0,.34)");
      document.documentElement.style.setProperty("--line",    "rgba(255,255,255,.26)");
      document.documentElement.style.setProperty("--textShadow","0 2px 8px rgba(0,0,0,.45)");
    }

    // Texto fica sempre branco (consistente)
    document.documentElement.style.setProperty("--text", "#ffffff");
    document.documentElement.style.setProperty("--muted","rgba(255,255,255,.82)");
  };
}

function setSkyFromWeather(code, isDay){
  applyDayNight(isDay);

  const file = skyFileFor(code, isDay);
  if (els.skyImg){
    els.skyImg.style.backgroundImage = `url(./${file})`;
  }

  tintBackgroundFromImage(file);
  setSkyFx(code);
  updateSkyHeight();
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

  setText(els.windSuggestion, windDirectionSuggestion(dir));
  setText(els.source, sourceName);

  const code = data.hourly.weather_code?.[i] ?? 0;
  const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;
  setSkyFromWeather(code, isDay);
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
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`
    );
    renderAll(json, source, loc.name);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: recarrega e/ou limpa dados do site.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) return;

  const alc = LOCATIONS.find(l => l.id === "alcabideche");
  const rest = LOCATIONS
    .filter(l => l.id !== "alcabideche")
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name, "pt-PT", { sensitivity:"base" }));
  const ordered = [alc, ...rest].filter(Boolean);

  els.select.innerHTML = "";
  for (const l of ordered){
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

  updateSkyHeight();
  window.addEventListener("resize", updateSkyHeight);

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
