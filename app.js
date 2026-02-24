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

/**
 * POIs/Âncoras com tipo e “margem” para evitar sugestões parvas (ex.: Lisboa -> Azeitão).
 * type:
 *  - "serra"  (serra/montanha)
 *  - "costa"  (linha atlântica / marginal / costa)
 *  - "rio"    (rio / estuário)
 *  - "cidade" (fallback urbano)
 *
 * bank:
 *  - "N" Norte do Tejo (Lisboa/linha/Serra de Sintra)
 *  - "S" Sul do Tejo (Almada/Caparica/Arrábida/Azeitão)
 *  - "X" indiferente/sem margem
 */
const POIS = [
  // NORTE (Lisboa / Linha / Sintra)
  { name:"Serra",   label:"Serra (Sintra)", type:"serra",  bank:"N", lat:38.7760, lon:-9.3900 },
  { name:"Costa",   label:"Costa (Marginal)", type:"costa", bank:"N", lat:38.6920, lon:-9.3300 }, // Carcavelos como âncora “costa”
  { name:"Rio",     label:"Rio (Tejo)", type:"rio",        bank:"N", lat:38.7070, lon:-9.1500 },   // Cais do Sodré como âncora “rio”
  { name:"Lisboa",  label:"Lisboa", type:"cidade",         bank:"N", lat:38.7223, lon:-9.1393 },
  { name:"Cascais", label:"Cascais", type:"cidade",        bank:"N", lat:38.6979, lon:-9.4206 },

  // SUL (Margem Sul / Arrábida)
  { name:"Costa",   label:"Costa (Caparica)", type:"costa", bank:"S", lat:38.6440, lon:-9.2350 },
  { name:"Serra",   label:"Serra (Arrábida)", type:"serra", bank:"S", lat:38.4890, lon:-9.0280 },
  { name:"Rio",     label:"Rio (Tejo)", type:"rio",         bank:"S", lat:38.6800, lon:-9.1600 },  // Almada como âncora “rio”
  { name:"Almada",  label:"Almada", type:"cidade",          bank:"S", lat:38.6790, lon:-9.1569 },
  { name:"Azeitão", label:"Azeitão", type:"cidade",         bank:"S", lat:38.5180, lon:-9.0130 },

  // X (indiferente/fora destas zonas, para evitar inventar)
  { name:"Costa",   label:"Costa", type:"costa",            bank:"X", lat:40.1508, lon:-8.8618 }, // Figueira (ancora genérica centro)
  { name:"Cidade",  label:"Centro urbano", type:"cidade",   bank:"X", lat:40.2033, lon:-8.4103 }  // Coimbra
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
  heroSun: $("heroSun"),

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


function windDirShort(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45)) % 8;
  return `${dirs[idx]}`;
}


function hourLabel(iso){ return String(iso).slice(11,16); }

function weekdayHourLabel(iso){
  const d = new Date(iso);
  let w = d.toLocaleDateString("pt-PT", { weekday: "short" });
  w = w.charAt(0).toUpperCase() + w.slice(1);
  const h = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${w} ${h}`;
}

function fmtTimeFromISO(iso){
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function getSunTimes(data){
  const sunriseISO = data?.daily?.sunrise?.[0];
  const sunsetISO  = data?.daily?.sunset?.[0];
  return {
    sunriseStr: fmtTimeFromISO(sunriseISO),
    sunsetStr:  fmtTimeFromISO(sunsetISO)
  };
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
    forecast_days: "2",
    daily: "sunrise,sunset",
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

function toRad(d){ return d * Math.PI / 180; }
function toDeg(r){ return r * 180 / Math.PI; }

function angleDiff(a, b){
  return Math.abs(((a - b + 540) % 360) - 180);
}

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1);
  const la2 = toRad(lat2);
  const a = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingBetween(lat1, lon1, lat2, lon2){
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function dirBucket(deg){
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return "norte";
  if (d < 67.5) return "nordeste";
  if (d < 112.5) return "este";
  if (d < 157.5) return "sudeste";
  if (d < 202.5) return "sul";
  if (d < 247.5) return "sudoeste";
  if (d < 292.5) return "oeste";
  return "noroeste";
}

// Regra simples para margem do Tejo (boa o suficiente para Lisboa/linha vs margem sul)
function inferBank(loc){
  // Lisboa/Cais do Sodré/linha: ~38.69+; margem sul típica: <38.67
  if ((loc?.lat ?? 0) < 38.67) return "S";
  return "N";
}

function pickPOIForBearing(userLat, userLon, targetBearing, pois, bank){
  const MAX_KM  = 20; // ✅ raio máximo (pedido: 15-20km)
  const MAX_DEG = 50; // tolerância angular (mantém alguma flexibilidade)

  let best = null;
  let bestScore = Infinity;

  for (const p of pois){
    // ✅ não sugerir atravessar o rio: filtra por margem quando aplicável
    if (bank && p.bank !== "X" && p.bank !== bank) continue;

    const km = haversineKm(userLat, userLon, p.lat, p.lon);
    if (km > MAX_KM) continue;

    const b = bearingBetween(userLat, userLon, p.lat, p.lon);
    const a = angleDiff(b, targetBearing);

    // score: prioriza alinhamento, depois distância
    const score = a + km * 0.55;
    if (score < bestScore){
      bestScore = score;
      best = { ...p, km, bearing: b, ang: a };
    }
  }

  if (!best) return null;
  if (best.ang > MAX_DEG) return null;
  return best;
}

function poiLabel(p){
  if (!p) return null;
  // ✅ preferir “Serra / Costa / Rio”
  if (p.type === "serra") return p.label || "Serra";
  if (p.type === "costa") return p.label || "Costa";
  if (p.type === "rio")   return p.label || "Rio";
  // cidade: usa nome
  return p.label || p.name;
}

// windDir = “de onde vem” (meteorologia)
function windDirectionSuggestionSmart(windDir, loc){
  const fromTxt = windDirText(windDir);

  const headBearing = windDir;               // contra o vento
  const tailBearing = (windDir + 180) % 360; // vento de costas

  const bank = inferBank(loc);

  const goPOI   = pickPOIForBearing(loc.lat, loc.lon, headBearing, POIS, bank);
  const backPOI = pickPOIForBearing(loc.lat, loc.lon, tailBearing, POIS, bank);

  const goLbl = poiLabel(goPOI);
  const backLbl = poiLabel(backPOI);

  if (goLbl && backLbl){
    // evita repetir exatamente a mesma label
    if (goLbl === backLbl){
      const goDir = dirBucket(headBearing);
      const backDir = dirBucket(tailBearing);
      return `Vento de ${fromTxt}. Arranca contra o vento para ${goDir} e regressa para ${backDir} com vento de costas.`;
    }

    // texto mais “ciclista”
    return `Vento de ${fromTxt}. Arranca contra o vento na direção de ${goLbl} e guarda o regresso com vento de costas pela ${backLbl}.`;
  }

  // fallback direcional
  const goDir = dirBucket(headBearing);
  const backDir = dirBucket(tailBearing);
  shown = true;
  return `Vento de ${fromTxt}. Arranca contra o vento para ${goDir} e regressa para ${backDir} com vento de costas.`;
}

// ===== O que vestir (mantém lógica; textos revistos) =====
function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }){
  const rainy = (pop ?? 0) >= 25 || (prcp ?? 0) >= 0.2;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let base = "";
  if (temp <= 6) base = "Muito Frio";
  else if (temp <= 11) base = "Frio";
  else if (temp <= 16) base = "Fresco";
  else if (temp <= 22) base = "Agradável";
  else base = "Quente";

  const rainAddon = rainy ? " · Leva impermeável" : "";
  const windAddon = windy ? " · Protege do vento" : "";

  if (sport === "bike"){
    if (temp <= 6)  return `${base}: Protege bem o corpo — base layer quente + manga comprida + colete + gola + luvas grossas + calças + proteções de sapatos${windAddon}${rainAddon}`;
    if (temp <= 11) return `${base}: Manga comprida + colete + gola + luvas leves. Mantém o conforto e deixa o ritmo aquecer${windAddon}${rainAddon}`;
    if (temp <= 16) return `${base}: Manga comprida leve + calção. Começa protegido, ajusta ao longo da volta${windAddon}${rainAddon}`;
    if (temp <= 22) return `${base}: Manga curta + colete opcional. Clima perfeito para rolar sem pressa${windAddon}${rainAddon}`;
    return `${base}: Equipamento leve + proteção solar. Hidrata e aproveita a estrada${rainAddon}`;
  }

  if (sport === "run"){
    if (temp <= 6)  return `${base}: Camada térmica + proteção leve contra o vento. O frio faz parte do desafio${windAddon}${rainAddon}`;
    if (temp <= 11) return `${base}: Manga comprida leve. Começa fresco, termina quente${windAddon}${rainAddon}`;
    if (temp <= 16) return `${base}: T-shirt + calções. Ritmo confortável${windAddon}${rainAddon}`;
    if (temp <= 22) return `${base}: Leve e solto. Ideal para alongar a passada${windAddon}${rainAddon}`;
    return `${base}: Muito leve + hidratação. Corre com cabeça${windAddon}${rainAddon}`;
  }

  if (temp <= 6)  return `${base}: Camadas quentes e casaco. Explora, mas mantém conforto${windAddon}${rainAddon}`;
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

  if (code === 45 || code === 48) return "☁️";

  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 56 || code === 57) return "🌧️";

  if (code === 61 || code === 63 || code === 65) return "🌧️";
  if (code === 66 || code === 67) return "🌧️";
  if (code === 80 || code === 81 || code === 82) return "🌧️";

  if (code === 71 || code === 73 || code === 75) return "🌨️";
  if (code === 77) return "🌨️";
  if (code === 85 || code === 86) return "🌨️";

  if (code === 95) return "⛈️";
  if (code === 96 || code === 99) return "⛈️";

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
    if (fog)   return "Day_fog.jpg";
    if (cloudy) return "day_cloudy.jpg";
    return "day_clear.jpg";
  }

  if (storm) return "Night_storm.jpg";
  if (rainy) return "night_rain.jpg";
  if (fog)   return "night_fog.jpg";
  if (cloudy) return "night_cloudy.jpg";
  return "night_clear.jpg";
}

function applyDayNight(isDay){
  document.body.classList.toggle("is-day", isDay);
  document.body.classList.toggle("is-night", !isDay);
}

function updateSkyHeight(){
  // Mantém o céu full-screen (via CSS) — esta função pode evoluir.
}

function updateWindyCam(lat, lon){
  if (!els.windyLink) return;
  const url = `https://www.windy.com/?${lat},${lon},11`;
  els.windyLink.href = url;
}

function renderAlerts(data){
  if (!els.alerts) return;

  const times = data?.hourly?.time ?? [];
  const i = times.length ? nearestHourIndex(times) : 0;

  const wind = data?.hourly?.wind_speed_10m?.[i];
  const gust = data?.hourly?.wind_gusts_10m?.[i];
  const pop  = data?.hourly?.precipitation_probability?.[i];
  const prcp = data?.hourly?.precipitation?.[i];

  const alerts = [];

  // Vento
  if ((gust ?? 0) >= 45) alerts.push("Rajadas fortes (≥45 km/h)");
  else if ((gust ?? 0) >= 35) alerts.push("Rajadas moderadas (≥35 km/h)");

  if ((wind ?? 0) >= 25) alerts.push("Vento sustentado (≥25 km/h)");

  // Chuva / probabilidade
  if ((pop ?? 0) >= 70) alerts.push("Elevada probabilidade de chuva (≥70%)");
  else if ((pop ?? 0) >= 40) alerts.push("Possibilidade de chuva (≥40%)");

  if ((prcp ?? 0) >= 2.0) alerts.push("Chuva moderada (≥2.0 mm/h)");

  // Render
  if (!alerts.length){
    els.alerts.innerHTML = "<span class=\"pill\">Sem alertas</span>";
    return;
  }

  els.alerts.innerHTML = alerts.map(a => `<span class="pill">${a}</span>`).join("");
}

function renderTables(data){
  render8h(data);
  render48h(data);
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
    const wind = data.hourly.wind_speed_10m?.[i] ?? 0;
    const gust = data.hourly.wind_gusts_10m?.[i] ?? 0;
    const dir  = data.hourly.wind_direction_10m?.[i] ?? 0;
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <tr>
        <td>${hourLabel(t[i])}</td>
        <td class="iconCell"><span class="icon">${iconForWeatherCode(code, isDay)}</span></td>
        <td>${Math.round(temp)}°</td>
        <td>${fmtPct(pop)}</td>
        <td>${fmtMm(prcp)}</td>
        <td>${fmtKmh(wind)}</td>
        <td>${fmtKmh(gust)}</td>
        <td>${windDirShort(dir)}</td>
      </tr>
    `);
  }

  // o #table8 já é uma <table>, por isso só metemos thead/tbody (sem criar outra <table>)
  els.table8.innerHTML = `
    <thead>
      <tr>
        <th>Hora</th>
        <th></th>
        <th>Temp.</th>
        <th>Prob.</th>
        <th>Chuva</th>
        <th>Vento</th>
        <th>Rajadas</th>
        <th>Dir. Vento</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  `;
}

function render48h(data){
  if (!els.table48 || !els.wrap48) return;

  const t = data.hourly.time;
  const i0 = nearestHourIndex(t);
  const rows = [];

  for (let i=i0; i<Math.min(i0+48, t.length); i++){
    const temp = data.hourly.temperature_2m[i];
    const pop  = data.hourly.precipitation_probability?.[i] ?? 0;
    const prcp = data.hourly.precipitation?.[i] ?? 0;
    const wind = data.hourly.wind_speed_10m?.[i] ?? 0;
    const gust = data.hourly.wind_gusts_10m?.[i] ?? 0;
    const dir  = data.hourly.wind_direction_10m?.[i] ?? 0;
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <tr>
        <td>${weekdayHourLabel(t[i])}</td>
        <td class="iconCell"><span class="icon">${iconForWeatherCode(code, isDay)}</span></td>
        <td>${Math.round(temp)}°</td>
        <td>${fmtPct(pop)}</td>
        <td>${fmtMm(prcp)}</td>
        <td>${fmtKmh(wind)}</td>
        <td>${fmtKmh(gust)}</td>
        <td>${windDirShort(dir)}</td>
      </tr>
    `);
  }

  // o #table48 já é uma <table>, por isso só metemos thead/tbody (sem criar outra <table>)
  els.table48.innerHTML = `
    <thead>
      <tr>
        <th>Dia/Hora</th>
        <th></th>
        <th>Temp.</th>
        <th>Prob.</th>
        <th>Chuva</th>
        <th>Vento</th>
        <th>Rajadas</th>
        <th>Dir. Vento</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  `;
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
      r += data[i];
      g += data[i+1];
      b += data[i+2];
      n++;
    }
    if (!n) return;

    r = Math.round(r/n);
    g = Math.round(g/n);
    b = Math.round(b/n);

    document.documentElement.style.setProperty("--bg1", `rgb(${Math.min(255, r+14)}, ${Math.min(255, g+14)}, ${Math.min(255, b+14)})`);
    document.documentElement.style.setProperty("--bg2", `rgb(${r}, ${g}, ${b})`);
    document.documentElement.style.setProperty("--bg3", `rgb(${Math.max(0, r-22)}, ${Math.max(0, g-22)}, ${Math.max(0, b-22)})`);

    const isDayImage = path.startsWith("day_");

    if (isDayImage){
      // DIA → mantém cartões claros, mas texto sempre branco com sombra forte (definida no CSS)
      document.documentElement.style.setProperty("--cardBg",  "rgba(255,255,255,.55)");
      document.documentElement.style.setProperty("--cardBg2", "rgba(255,255,255,.35)");
      document.documentElement.style.setProperty("--pillBg",  "rgba(255,255,255,.28)");
      document.documentElement.style.setProperty("--selectBg","rgba(255,255,255,.75)");
      document.documentElement.style.setProperty("--stickyBg","rgba(255,255,255,.70)");
      document.documentElement.style.setProperty("--line",    "rgba(255,255,255,.25)");

      // Texto sempre branco (dia/noite)
      document.documentElement.style.setProperty("--text", "#ffffff");
      document.documentElement.style.setProperty("--muted","rgba(255,255,255,.92)");

      // Bússola (dia): ponteiro mais forte para se distinguir das letras
      document.documentElement.style.setProperty("--needleStrong","rgba(0,0,0,.85)");
      document.documentElement.style.setProperty("--needleMid","rgba(0,0,0,.55)");
      document.documentElement.style.setProperty("--needleDot","rgba(0,0,0,.85)");
    } else {
      // NOITE → mantém como está no teu layout atual (não alterar o aspeto)
      document.documentElement.style.setProperty("--cardBg",  "rgba(255,255,255,.45)");
      document.documentElement.style.setProperty("--cardBg2", "rgba(255,255,255,.30)");
      document.documentElement.style.setProperty("--pillBg",  "rgba(0,0,0,.18)");
      document.documentElement.style.setProperty("--selectBg","rgba(255,255,255,.50)");
      document.documentElement.style.setProperty("--stickyBg","rgba(0,0,0,.55)");
      document.documentElement.style.setProperty("--line",    "rgba(255,255,255,.26)");

      document.documentElement.style.setProperty("--text", "#ffffff");
      document.documentElement.style.setProperty("--muted","rgba(255,255,255,.82)");
      document.documentElement.style.setProperty("--textShadow","0 2px 8px rgba(0,0,0,.45)");

      // Bússola (noite): mantém como está (branco)
      document.documentElement.style.setProperty("--needleStrong","rgba(255,255,255,.95)");
      document.documentElement.style.setProperty("--needleMid","rgba(255,255,255,.35)");
      document.documentElement.style.setProperty("--needleDot","rgba(255,255,255,.92)");
    }
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

  setText(els.heroLoc, loc.name);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroMeta, `Sensação: ${Math.round(feels ?? temp)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`);

  const { sunriseStr, sunsetStr } = getSunTimes(data);
  setText(els.heroSun, `Nascer: ${sunriseStr} · Pôr: ${sunsetStr}`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  if (els.dirNeedle){
    els.dirNeedle.style.transform = `translate(-50%, -50%) rotate(${(dir + 180) % 360}deg)`;
  }

  const tempEff = (feels ?? temp);
  setText(els.dressBike, clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"bike" }));
  setText(els.dressRun,  clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"run" }));
  setText(els.dressWalk, clothingSuggestion({ temp: tempEff, wind, gust, pop, prcp, sport:"walk" }));

  renderAlerts(data);
  renderTables(data);

  // Melhor janela (2h nas próximas 12h) — robusto (não rebenta a UI)
  try{
    const bw = computeBestWindowNext12h(data);
    const startLbl = weekdayHourLabel(t[bw.idx]);
    const endLbl   = weekdayHourLabel(t[bw.idx + 2] ?? t[bw.idx + 1]);
    setText(els.bestWindow, `${startLbl} → ${endLbl}\nMenos chuva + menos rajadas.`);
  } catch (e){
    console.warn("[bestWindow] falhou:", e);
    setText(els.bestWindow, "—");
  }

  // Sugestão de sentido — robusto
  try{
    setHTML(els.windSuggestion, `<div>${windDirectionSuggestionSmart(dir, loc)}</div>`);
  } catch (e){
    console.warn("[windSuggestion] falhou:", e);
    setText(els.windSuggestion, "—");
  }
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
    renderAll(json, source, loc);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: recarrega e/ou limpa dados do site.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) return;

  // popular select
  els.select.innerHTML = LOCATIONS.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
  els.select.value = "alcabideche";

  // toggle 48h
  if (els.toggle48 && els.wrap48){
    els.toggle48.addEventListener("click", () => {
      const hidden = els.wrap48.classList.toggle("hidden");
      els.toggle48.textContent = hidden ? "Mostrar 48h" : "Ocultar 48h";
    });
  }

  els.select.addEventListener("change", () => refresh());

  refresh();
  setInterval(refresh, REFRESH_MS);
}

window.addEventListener("DOMContentLoaded", init);
