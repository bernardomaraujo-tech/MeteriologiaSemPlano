const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },

  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },

  { id:"azeitao", name:"Azeitão", lat:38.5180, lon:-9.0130 },
  { id:"cais_sodre", name:"Cais do Sodré", lat:38.7069, lon:-9.1444 },

  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },

  { id:"columbeira", name:"Columbeira", lat:39.2650, lon:-9.1800 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },

  { id:"estoril", name:"Estoril", lat:38.7057, lon:-9.3977 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },

  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"praia_tocha", name:"Praia da Tocha", lat:40.3300, lon:-8.7860 },

  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 }
];

const els = {
  select: document.getElementById("locationSelect"),
  updated: document.getElementById("updated"),

  heroLoc: document.getElementById("heroLoc"),
  heroTemp: document.getElementById("heroTemp"),
  heroMeta: document.getElementById("heroMeta"),
  heroSun: document.getElementById("heroSun"),

  nowWind: document.getElementById("nowWind"),
  nowGust: document.getElementById("nowGust"),
  nowDirTxt: document.getElementById("nowDirTxt"),
  nowRain: document.getElementById("nowRain"),
  nowPop: document.getElementById("nowPop"),

  dirNeedle: document.getElementById("dirNeedle"),

  dressBike: document.getElementById("dressBike"),
  dressRun: document.getElementById("dressRun"),
  dressWalk: document.getElementById("dressWalk"),

  alerts: document.getElementById("alerts"),

  table8: document.getElementById("table8"),
  table48: document.getElementById("table48"),
  wrap48: document.getElementById("wrap48"),
  toggle48: document.getElementById("toggle48"),

  bestWindow: document.getElementById("bestWindow"),
  windSuggestion: document.getElementById("windSuggestion"),

  windyLink: document.getElementById("windyLink"),
  source: document.getElementById("source"),

  skyImg: document.getElementById("skyImg"),
  skyFx: document.getElementById("skyFx"),
};

function setText(el, txt){
  if (!el) return;
  el.textContent = txt;
}

function withTimeout(promise, ms){
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function fmtKmh(v){
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(v)} km/h`;
}
function fmtMm(v){
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)} mm`;
}
function fmtPct(v){
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${Math.round(v)}%`;
}

function hourLabel(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour:"2-digit", minute:"2-digit" });
}
function dayLabel(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT", { weekday:"short", day:"2-digit", month:"2-digit" });
}

function nearestHourIndex(times){
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  for (let i=0; i<times.length; i++){
    const t = new Date(times[i]).getTime();
    const diff = Math.abs(t - now);
    if (diff < bestDiff){
      bestDiff = diff;
      best = i;
    }
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
  if (!Number.isFinite(min) || !Number.isFinite(max)){
    return { min: NaN, max: NaN };
  }
  return { min, max };
}

function windDirText(deg){
  if (deg === null || deg === undefined || Number.isNaN(deg)) return "—";
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

function getSelectedLocation(){
  const id = els.select?.value ?? "alcabideche";
  return LOCATIONS.find(l => l.id === id) ?? LOCATIONS[0];
}

async function fetchWeather(loc){
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "weather_code",
      "is_day"
    ].join(","),
    daily: ["sunrise","sunset"].join(","),
    timezone: "auto"
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await withTimeout(fetch(url, { cache:"no-store" }), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { json, source: "Open-Meteo" };
}

function getSunTimes(data){
  const sunrise = data?.daily?.sunrise?.[0];
  const sunset  = data?.daily?.sunset?.[0];
  return {
    sunriseStr: sunrise ? hourLabel(sunrise) : "—",
    sunsetStr:  sunset  ? hourLabel(sunset)  : "—"
  };
}

/* ===== Sugestões simples ===== */
function cyclingSuggestion(temp, wind, rain){
  const windAddon = wind >= 25 ? " + atenção ao vento" : "";
  const rainAddon = rain > 0 ? " + impermeável leve" : "";
  const base = "Agradável";
  if (temp <= 8)  return `${base}: Camadas (manga comprida + corta-vento)${windAddon}${rainAddon}`;
  if (temp <= 13) return `${base}: Manga comprida + colete opcional${windAddon}${rainAddon}`;
  if (temp <= 17) return `${base}: Manga curta + colete opcional. Clima perfeito${windAddon}${rainAddon}`;
  if (temp <= 22) return `${base}: Manga curta. Ideal para rolar sem pressa${windAddon}${rainAddon}`;
  return `${base}: Leve e respirável. Hidrata bem${windAddon}${rainAddon}`;
}
function runSuggestion(temp, wind, rain){
  const windAddon = wind >= 25 ? " + corta-vento fino" : "";
  const rainAddon = rain > 0 ? " + impermeável leve" : "";
  const base = "Agradável";
  if (temp <= 8)  return `${base}: Manga comprida + camada térmica${windAddon}${rainAddon}`;
  if (temp <= 13) return `${base}: Manga comprida leve${windAddon}${rainAddon}`;
  if (temp <= 17) return `${base}: T-shirt + manga fina opcional${windAddon}${rainAddon}`;
  if (temp <= 23) return `${base}: T-shirt + calções. Bom para soltar${windAddon}${rainAddon}`;
  return `${base}: Muito leve. Hidratação extra${windAddon}${rainAddon}`;
}
function walkSuggestion(temp, wind, rain){
  const windAddon = wind >= 25 ? " + corta-vento" : "";
  const rainAddon = rain > 0 ? " + impermeável leve" : "";
  const base = "Agradável";
  if (temp <= 11) return `${base}: Manga comprida + calças. Temperatura perfeita para trilho${windAddon}${rainAddon}`;
  if (temp <= 16) return `${base}: Camada leve. Ideal para ganhar altitude${windAddon}${rainAddon}`;
  if (temp <= 22) return `${base}: T-shirt confortável. Dia convidativo${windAddon}${rainAddon}`;
  return `${base}: Roupa leve e respirável. Aproveita o ar livre${windAddon}${rainAddon}`;
}

function iconForWeatherCode(code, isDay){
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙☁️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if ([51,53,55].includes(code)) return "🌦️";
  if ([56,57,61,63,65,66,67,80,81,82].includes(code)) return "🌧️";
  if ([71,73,75,77,85,86].includes(code)) return "🌨️";
  if ([95,96,99].includes(code)) return "⛈️";
  return isDay ? "🌤️" : "🌙";
}

function skyFileFor(code, isDay){
  const rainy = [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);
  const storm = [95,96,99].includes(code);
  const fog   = [45,48].includes(code);
  const cloudy= [2,3].includes(code);

  if (isDay){
    if (storm) return "day_storm.jpg";
    if (rainy) return "day_rain.jpg";
    if (fog)   return "day_fog.jpg";
    if (cloudy) return "day_cloudy.jpg";
    return "day_clear.jpg";
  } else {
    if (storm) return "night_storm.jpg";
    if (rainy) return "night_rain.jpg";
    if (fog)   return "night_fog.jpg";
    if (cloudy) return "night_cloudy.jpg";
    return "night_clear.jpg";
  }
}

function applyDayNight(isDay){
  document.body.classList.toggle("is-day", isDay);
  document.body.classList.toggle("is-night", !isDay);
}

function setSkyFx(code){
  if (!els.skyFx) return;

  const rainy = [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);
  const storm = [95,96,99].includes(code);
  const foggy = [45,48].includes(code);

  els.skyFx.style.animation = "none";

  if (storm){
    els.skyFx.style.opacity = ".52";
    els.skyFx.style.background =
      "radial-gradient(closest-side at 20% 30%, rgba(255,255,255,.08), rgba(255,255,255,0) 60%)," +
      "radial-gradient(closest-side at 70% 55%, rgba(255,255,255,.06), rgba(255,255,255,0) 65%)," +
      "linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0))";
    els.skyFx.style.animation = "rainMove 2.8s linear infinite";
    return;
  }

  if (rainy){
    els.skyFx.style.opacity = ".38";
    els.skyFx.style.background =
      "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 55%)," +
      "radial-gradient(closest-side at 30% 40%, rgba(255,255,255,.06), rgba(255,255,255,0) 70%)," +
      "radial-gradient(closest-side at 75% 60%, rgba(255,255,255,.05), rgba(255,255,255,0) 72%)";
    els.skyFx.style.animation = "rainMove 3.6s linear infinite";
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

function setSkyFromWeather(code, isDay){
  applyDayNight(isDay);
  const file = skyFileFor(code, isDay);
  if (els.skyImg) els.skyImg.style.backgroundImage = `url(./${file})`;
  setSkyFx(code);
}

function renderAlerts(){
  if (!els.alerts) return;
  els.alerts.textContent = "—";
}

function render8h(data){
  if (!els.table8) return;

  const t = data.hourly.time;
  const i0 = nearestHourIndex(t);
  const rows = [];

  for (let i=i0; i<Math.min(i0+8, t.length); i++){
    const temp = data.hourly.temperature_2m[i];
    const pop  = data.hourly.precipitation_probability?.[i] ?? 0;
    const prcp = data.hourly.precipitation?.[i] ?? 0;
    const wind = data.hourly.wind_speed_10m[i];
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <tr>
        <td>${hourLabel(t[i])}</td>
        <td class="iconCell">${iconForWeatherCode(code, isDay)}</td>
        <td>${Math.round(temp)}°</td>
        <td>${fmtPct(pop)}</td>
        <td>${fmtMm(prcp)}</td>
        <td>${fmtKmh(wind)}</td>
      </tr>
    `);
  }

  els.table8.innerHTML = `
    <thead>
      <tr>
        <th>Hora</th><th></th><th>Temp</th><th>Prob.</th><th>Chuva</th><th>Vento</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  `;
}

function render48h(data){
  if (!els.table48) return;

  const t = data.hourly.time;
  const i0 = nearestHourIndex(t);
  const rows = [];

  for (let i=i0; i<Math.min(i0+48, t.length); i+=2){
    const temp = data.hourly.temperature_2m[i];
    const pop  = data.hourly.precipitation_probability?.[i] ?? 0;
    const prcp = data.hourly.precipitation?.[i] ?? 0;
    const wind = data.hourly.wind_speed_10m[i];
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <tr>
        <td>${dayLabel(t[i])}</td>
        <td>${hourLabel(t[i])}</td>
        <td class="iconCell">${iconForWeatherCode(code, isDay)}</td>
        <td>${Math.round(temp)}°</td>
        <td>${fmtPct(pop)}</td>
        <td>${fmtMm(prcp)}</td>
        <td>${fmtKmh(wind)}</td>
      </tr>
    `);
  }

  els.table48.innerHTML = `
    <thead>
      <tr>
        <th>Dia</th><th>Hora</th><th></th><th>Temp</th><th>Prob.</th><th>Chuva</th><th>Vento</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  `;
}

function updateWindyLink(lat, lon){
  if (!els.windyLink) return;
  els.windyLink.href = `https://www.windy.com/?${lat},${lon},11`;
}

function renderAll(data, sourceName, loc){
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
  const { sunriseStr, sunsetStr } = getSunTimes(data);

  setText(els.heroLoc, loc.name);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroMeta, `Sensação: ${Math.round(feels ?? temp)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`);
  setText(els.heroSun, `Nascer: ${sunriseStr} · Pôr: ${sunsetStr}`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  // Needle (HTML usa transform em translate/rotate)
  if (els.dirNeedle){
    els.dirNeedle.style.transform = `translate(-50%, -50%) rotate(${(dir + 180) % 360}deg)`;
  }

  setText(els.dressBike, cyclingSuggestion(temp, wind, prcp));
  setText(els.dressRun, runSuggestion(temp, wind, prcp));
  setText(els.dressWalk, walkSuggestion(temp, wind, prcp));

  setText(els.source, sourceName || "—");

  const code = data.hourly.weather_code?.[i] ?? 0;
  const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;
  setSkyFromWeather(code, isDay);

  updateWindyLink(loc.lat, loc.lon);

  renderAlerts();
  render8h(data);
  render48h(data);

  // placeholders (não mexo na tua lógica aqui — só para não ficar “vazio”)
  if (els.bestWindow) setText(els.bestWindow, "—");
  if (els.windSuggestion) setText(els.windSuggestion, "—");
}

async function refresh(){
  const loc = getSelectedLocation();
  setText(els.updated, "A atualizar…");
  setText(els.source, "—");

  try{
    const { json, source } = await fetchWeather(loc);
    setText(
      els.updated,
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`
    );
    renderAll(json, source, loc);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: recarrega e/ou limpa dados do site.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) {
    console.error("[SEMPLANO] IDs do HTML não encontrados. Verifica index.html.");
    return;
  }

  els.select.innerHTML = LOCATIONS.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
  els.select.value = "alcabideche";

  els.select.addEventListener("change", () => refresh());

  if (els.toggle48 && els.wrap48){
    els.toggle48.addEventListener("click", () => {
      const hidden = els.wrap48.classList.toggle("hidden");
      els.toggle48.textContent = hidden ? "Mostrar" : "Ocultar";
    });
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

window.addEventListener("DOMContentLoaded", init);
