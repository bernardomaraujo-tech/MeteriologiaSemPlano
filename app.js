const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const GEO_TIMEOUT_MS = 10000;
const FORECAST_HOURS = 48;
const OSM_TILE_SIZE = 256;
const OSM_ZOOM = 11;
const ROUTE_SAMPLE_MINUTES = 15;
const ROUTE_MAX_SAMPLES = 48;
const ROUTE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREFERRED_WEATHER_MODEL = "knmi_seamless";
const AUTO_LOCATION_ID = "device_location";
const DEFAULT_LOCATION_ID = "alcabideche";
const LOCATION_STORAGE_KEY = "semPlanoMeteoLocationV2";

const LOCATIONS = [
  { id: "alcabideche", name: "Alcabideche", region: "Cascais", lat: 38.7330, lon: -9.4100 },
  { id: "algueirao", name: "Algueirão", region: "Sintra", lat: 38.7936, lon: -9.3417 },
  { id: "amadora", name: "Amadora", region: "Lisboa", lat: 38.7569, lon: -9.2308 },
  { id: "azeitao", name: "Azeitão", region: "Setúbal", lat: 38.5180, lon: -9.0130 },
  { id: "cais_sodre", name: "Cais do Sodré", region: "Lisboa", lat: 38.7069, lon: -9.1444 },
  { id: "carcavelos", name: "Carcavelos", region: "Cascais", lat: 38.6910, lon: -9.3317 },
  { id: "cascais", name: "Cascais", region: "Lisboa", lat: 38.6979, lon: -9.4206 },
  { id: "columbeira", name: "Columbeira", region: "Bombarral", lat: 39.2650, lon: -9.1800 },
  { id: "culatra", name: "Ilha da Culatra", region: "Faro", lat: 36.9889, lon: -7.8336 },
  { id: "estoril", name: "Estoril", region: "Cascais", lat: 38.7057, lon: -9.3977 },
  { id: "fatima", name: "Fátima", region: "Santarém", lat: 39.6172, lon: -8.6521 },
  { id: "guincho", name: "Guincho", region: "Cascais", lat: 38.72948, lon: -9.47457 },
  { id: "minde", name: "Minde", region: "Alcanena", lat: 39.5153, lon: -8.6871 },
  { id: "peninha", name: "Peninha", region: "Sintra", lat: 38.7692, lon: -9.4589 },
  { id: "praia_tocha", name: "Praia da Tocha", region: "Cantanhede", lat: 40.3300, lon: -8.7860 },
  { id: "santarem", name: "Santarém", region: "Santarém", lat: 39.2369, lon: -8.6850 },
  { id: "santacombadao", name: "Santa Comba Dão", region: "Viseu", lat: 40.3979, lon: -8.1304 },
  { id: "sdr", name: "São Domingos de Rana", region: "Cascais", lat: 38.7019, lon: -9.3389 },
  { id: "setubal", name: "Setúbal", region: "Setúbal", lat: 38.5244, lon: -8.8882 },
  { id: "sintra", name: "Sintra", region: "Lisboa", lat: 38.8029, lon: -9.3817 },
  { id: "vila_franca_xira", name: "Vila Franca de Xira", region: "Lisboa", lat: 38.9553, lon: -8.9897 }
];

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let weatherData = null;
let weatherSource = "—";
let selectedLocation = loadLocationPreference();
let resolvedLocation = null;
let refreshRunId = 0;
let searchTimer = null;
let toastTimer = null;
let routeData = null;
let routeAnalysis = null;
let routeAnalysisRunId = 0;

function setText(idOrElement, value) {
  const element = typeof idOrElement === "string" ? $(idOrElement) : idOrElement;
  if (element) element.textContent = value;
}

function setHTML(idOrElement, value) {
  const element = typeof idOrElement === "string" ? $(idOrElement) : idOrElement;
  if (element) element.innerHTML = value;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function loadLocationPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (saved && saved.id && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon))) {
      return saved;
    }
    if (saved?.id === AUTO_LOCATION_ID) return { id: AUTO_LOCATION_ID, name: "Localização atual" };
  } catch (_) {}
  return { id: AUTO_LOCATION_ID, name: "Localização atual" };
}

function saveLocationPreference(location) {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  } catch (_) {}
}

function getDefaultLocation() {
  return LOCATIONS.find((location) => location.id === DEFAULT_LOCATION_ID) || LOCATIONS[0];
}

function getDevicePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização indisponível"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 5 * 60 * 1000
    });
  });
}

async function resolveActiveLocation() {
  if (selectedLocation.id !== AUTO_LOCATION_ID) return { ...selectedLocation, isDeviceLocation: false };

  try {
    const position = await getDevicePosition();
    return {
      id: AUTO_LOCATION_ID,
      name: "Localização atual",
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: finite(position.coords.accuracy),
      isDeviceLocation: true
    };
  } catch (_) {
    const fallback = getDefaultLocation();
    return { ...fallback, name: `${fallback.name} · localização de recurso`, isFallback: true };
  }
}

function updateLocationLabels(location) {
  const label = location?.isDeviceLocation ? "Localização atual" : (location?.name || "Localização atual");
  $$('[data-location-label]').forEach((element) => setText(element, label));
}

function osmTileCoordinates(lat, lon, zoom = OSM_ZOOM) {
  const scale = 2 ** zoom;
  const latitude = clamp(finite(lat), -85.0511, 85.0511);
  const longitude = clamp(finite(lon), -180, 180);
  const latitudeRadians = latitude * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2 * scale,
    scale
  };
}

function renderWindMap(location) {
  const container = $("windMapTiles");
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!container || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const center = osmTileCoordinates(lat, lon);
  const centerTileX = Math.floor(center.x);
  const centerTileY = Math.floor(center.y);
  const horizontalRadius = (container.clientWidth || 360) > 512 ? 2 : 1;
  container.innerHTML = "";

  for (let y = centerTileY - 1; y <= centerTileY + 1; y += 1) {
    if (y < 0 || y >= center.scale) continue;
    for (let x = centerTileX - horizontalRadius; x <= centerTileX + horizontalRadius; x += 1) {
      const wrappedX = ((x % center.scale) + center.scale) % center.scale;
      const tile = document.createElement("img");
      tile.className = "wind-map-tile";
      tile.alt = "";
      tile.decoding = "async";
      tile.draggable = false;
      tile.src = `https://tile.openstreetmap.org/${OSM_ZOOM}/${wrappedX}/${y}.png`;
      tile.style.left = `calc(50% + ${(x - center.x) * OSM_TILE_SIZE}px)`;
      tile.style.top = `calc(50% + ${(y - center.y) * OSM_TILE_SIZE}px)`;
      tile.addEventListener("load", () => tile.classList.add("is-loaded"), { once: true });
      tile.addEventListener("error", () => tile.remove(), { once: true });
      container.appendChild(tile);
    }
  }
}

function buildWeatherUrl(location, model = "") {
  const params = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    timezone: "Europe/Lisbon",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    timeformat: "iso8601",
    forecast_days: "7",
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "uv_index",
      "is_day"
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "weather_code",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "uv_index_max",
      "sunrise",
      "sunset"
    ].join(",")
  });
  if (model) params.set("models", model);
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", mode: "cors", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function hasCompleteWeatherData(data) {
  const hourlyFields = [
    "temperature_2m",
    "apparent_temperature",
    "relative_humidity_2m",
    "precipitation",
    "precipitation_probability",
    "weather_code",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "uv_index",
    "is_day"
  ];
  const dailyFields = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "weather_code",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
    "uv_index_max"
  ];
  const hourlyTimes = data?.hourly?.time;
  const dailyTimes = data?.daily?.time;
  if (!Array.isArray(hourlyTimes) || hourlyTimes.length < FORECAST_HOURS) return false;
  if (!Array.isArray(dailyTimes) || dailyTimes.length < 7) return false;
  const completeHourly = hourlyFields.every((field) => {
    const values = data.hourly?.[field];
    return Array.isArray(values)
      && values.length >= FORECAST_HOURS
      && values.slice(0, FORECAST_HOURS).every((value) => Number.isFinite(Number(value)));
  });
  const completeDaily = dailyFields.every((field) => {
    const values = data.daily?.[field];
    return Array.isArray(values)
      && values.length >= 7
      && values.slice(0, 7).every((value) => Number.isFinite(Number(value)));
  });
  return completeHourly && completeDaily;
}

async function requestWeather(location, model = "") {
  const response = await fetchWithTimeout(buildWeatherUrl(location, model));
  if (!response.ok) throw new Error(`serviço meteorológico indisponível (${response.status})`);
  const data = await response.json();
  if (!hasCompleteWeatherData(data)) throw new Error("dados meteorológicos incompletos");
  return data;
}

async function fetchWeather(location) {
  try {
    const data = await requestWeather(location, PREFERRED_WEATHER_MODEL);
    return { data, source: "Open-Meteo · KNMI Seamless (HARMONIE + ECMWF)" };
  } catch (_) {
    const data = await requestWeather(location);
    return { data, source: "Open-Meteo · Best Match (fallback automático)" };
  }
}

function nearestHourIndex(times) {
  const now = Date.now();
  let best = 0;
  let distance = Infinity;
  times.forEach((time, index) => {
    const nextDistance = Math.abs(new Date(time).getTime() - now);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = index;
    }
  });
  return best;
}

function formatUpdated(date = new Date()) {
  return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function formatHour(iso) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function formatWeekday(iso, long = false) {
  const text = new Date(iso).toLocaleDateString("pt-PT", { weekday: long ? "long" : "short" });
  return text.charAt(0).toUpperCase() + text.slice(1).replace(".", "");
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function windDirection(degrees) {
  const fromDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((finite(degrees) % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return { from: fromDirections[index], to: fromDirections[(index + 4) % 8], degrees: normalized };
}

function humidityLabel(value) {
  if (value < 35) return "Baixa";
  if (value <= 70) return "Moderada";
  if (value <= 85) return "Elevada";
  return "Muito elevada";
}

function uvLabel(value) {
  if (value < 3) return "Baixo";
  if (value < 6) return "Moderado";
  if (value < 8) return "Alto";
  return "Muito Alto";
}

function rainLabel(probability, precipitation) {
  if (precipitation >= 2) return "Chuva relevante";
  if (precipitation >= .2 || probability >= 45) return "Possibilidade de chuva";
  if (probability >= 20) return "Baixa possibilidade de chuva";
  return "Sem chuva relevante";
}

function weatherConditionLabel(code) {
  const value = Math.round(finite(code, -1));
  if (value === 0) return "Céu limpo";
  if (value === 1) return "Céu pouco nublado";
  if (value === 2) return "Céu com nuvens";
  if (value === 3) return "Céu nublado";
  if (value === 45 || value === 48) return "Nevoeiro";
  if ([51, 53, 55, 56, 57].includes(value)) return "Chuvisco";
  if ([61, 63, 66].includes(value)) return "Chuva";
  if ([65, 67].includes(value)) return "Chuva forte";
  if ([71, 73, 75, 77].includes(value)) return "Neve";
  if ([80, 81].includes(value)) return "Aguaceiros";
  if (value === 82) return "Aguaceiros fortes";
  if ([85, 86].includes(value)) return "Aguaceiros de neve";
  if (value === 95) return "Trovoada";
  if ([96, 99].includes(value)) return "Trovoada com granizo";
  return "Condições variáveis";
}

function windStrengthLabel(wind) {
  if (wind < 12) return "Vento fraco";
  if (wind < 20) return "Vento moderado";
  if (wind < 28) return "Vento forte";
  return "Vento muito forte";
}

function gustStrengthLabel(gust) {
  if (gust < 25) return "rajadas fracas";
  if (gust < 40) return "rajadas moderadas";
  if (gust < 55) return "rajadas fortes";
  return "rajadas muito fortes";
}

function relevantRainDescription(probability, precipitation) {
  if (precipitation >= 2) return `Chuva relevante: ${Math.round(probability)}% · ${precipitation.toFixed(1)} mm`;
  if (precipitation >= .2 || probability >= 45) return `Possibilidade de chuva: ${Math.round(probability)}% · ${precipitation.toFixed(1)} mm`;
  if (probability >= 20) return `Baixa possibilidade de chuva: ${Math.round(probability)}%`;
  return "";
}

function currentWeatherDescription(values, direction) {
  const rain = relevantRainDescription(values.probability, values.precipitation);
  const overview = `${weatherConditionLabel(values.weatherCode)}, ${windStrengthLabel(values.wind).toLowerCase()} de ${direction.from}, com ${gustStrengthLabel(values.gust)}`;
  return `${overview}${rain ? `. ${rain}` : ""}.`;
}

function conditionQuality({ wind, gust, probability, precipitation, apparent, humidity, uv }) {
  let score = 100;
  score -= clamp((wind - 12) * 1.15, 0, 25);
  score -= clamp((gust - 22) * .8, 0, 25);
  score -= clamp(probability * .18, 0, 18);
  score -= clamp(precipitation * 5, 0, 18);
  if (apparent < 7) score -= clamp((7 - apparent) * 2, 0, 16);
  if (apparent > 28) score -= clamp((apparent - 28) * 2, 0, 16);
  if (humidity > 82) score -= clamp((humidity - 82) * .4, 0, 7);
  if (uv > 7) score -= clamp((uv - 7) * 1.2, 0, 6);
  const rounded = Math.round(clamp(score, 0, 100));
  const label = rounded >= 85 ? "Muito boa" : rounded >= 70 ? "Boa" : rounded >= 50 ? "Razoável" : rounded >= 30 ? "Exigente" : "Desfavorável";
  return { score: rounded, label };
}

function clothingRecommendation({ temp, apparent, wind, gust, probability, precipitation, humidity }) {
  const feels = finite(apparent, temp);
  const wet = precipitation >= .2 || probability >= 35;
  const windy = wind >= 20 || gust >= 34;
  const veryWindy = wind >= 28 || gust >= 45;
  const humid = humidity >= 80;
  const items = [];

  const add = (label, icon, optional = false) => {
    if (!items.some((item) => item.label === label)) items.push({ label, icon, optional });
  };

  if (feels <= 4) {
    add("Base layer térmica", "jersey");
    add("Jersey manga longa", "jersey");
    add(wet ? "Casaco impermeável" : "Casaco térmico", "vest");
    add("Calças compridas", "tights");
    add("Luvas térmicas", "gloves");
  } else if (feels <= 9) {
    add("Base layer", "jersey");
    add("Jersey manga longa", "jersey");
    add(wet ? "Impermeável" : "Colete corta-vento", "vest");
    add("Calças compridas", "tights");
    add("Luvas térmicas", "gloves");
  } else if (feels <= 13) {
    add("Base layer leve", "jersey");
    add("Jersey manga longa", "jersey");
    add(wet ? "Impermeável" : "Colete corta-vento", "vest");
    add("Calções + pernitos", "tights");
    if (veryWindy || feels <= 11) add("Luvas térmicas", "gloves");
  } else if (feels <= 17) {
    add("Jersey manga curta", "jersey");
    add("Base layer leve", "jersey", true);
    if (windy) add("Colete corta-vento", "vest");
    add("Manguitos", "sleeve", feels >= 16);
    add("Calções", "shorts");
    if (wet) add("Impermeável compacto", "vest");
  } else if (feels <= 22) {
    add("Jersey manga curta", "jersey");
    if (windy) add("Colete corta-vento", "vest");
    if (feels < 19) add("Manguitos", "sleeve", true);
    add("Calções", "shorts");
    if (wet) add("Impermeável compacto", "vest");
  } else {
    add("Jersey leve", "jersey");
    add("Calções", "shorts");
    if (veryWindy) add("Colete corta-vento", "vest", true);
    if (wet) add("Impermeável compacto", "vest");
  }

  const reasonParts = [`${Math.round(temp)} °C`, `sensação ${Math.round(feels)} °C`];
  reasonParts.push(veryWindy ? "vento forte" : windy ? "vento moderado" : "vento fraco");
  if (wet) reasonParts.push("risco de chuva");
  if (humid) reasonParts.push("humidade elevada");

  return { items: items.slice(0, 6), reason: `Sugestão técnica para ${reasonParts.join(", ")}.` };
}

function renderClothing(values) {
  const recommendation = clothingRecommendation(values);
  setText("clothingReason", recommendation.reason);
  setHTML("clothingList", recommendation.items.map((item) => `
    <article class="clothing-item${item.optional ? " optional" : ""}">
      <svg aria-hidden="true"><use href="#i-${item.icon}"/></svg>
      <strong>${escapeHtml(item.label)}</strong>
    </article>
  `).join(""));
}

function currentDayMinMax(data, hourlyIndex) {
  const currentDay = data.hourly.time?.[hourlyIndex]?.slice(0, 10);
  const dailyIndex = (data.daily?.time || []).indexOf(currentDay);
  const dailyMin = Number(data.daily?.temperature_2m_min?.[dailyIndex]);
  const dailyMax = Number(data.daily?.temperature_2m_max?.[dailyIndex]);
  if (Number.isFinite(dailyMin) && Number.isFinite(dailyMax)) return { min: dailyMin, max: dailyMax };

  const values = (data.hourly.temperature_2m || [])
    .slice(hourlyIndex, hourlyIndex + 24)
    .map(Number)
    .filter(Number.isFinite);
  return { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

function currentValues(data, index) {
  return {
    temp: finite(data.hourly.temperature_2m?.[index]),
    apparent: finite(data.hourly.apparent_temperature?.[index]),
    humidity: finite(data.hourly.relative_humidity_2m?.[index]),
    precipitation: finite(data.hourly.precipitation?.[index]),
    probability: finite(data.hourly.precipitation_probability?.[index]),
    wind: finite(data.hourly.wind_speed_10m?.[index]),
    gust: finite(data.hourly.wind_gusts_10m?.[index]),
    direction: finite(data.hourly.wind_direction_10m?.[index]),
    uv: finite(data.hourly.uv_index?.[index]),
    weatherCode: finite(data.hourly.weather_code?.[index], -1)
  };
}

function renderCurrent(data) {
  const index = nearestHourIndex(data.hourly.time);
  const values = currentValues(data, index);
  const direction = windDirection(values.direction);
  const temperatures = currentDayMinMax(data, index);
  const quality = conditionQuality(values);

  setText("currentWind", Math.round(values.wind));
  setText("currentGust", Math.round(values.gust));
  setText("currentDirection", `${direction.from} → ${direction.to}`);
  $("currentWindArrow").style.transform = `rotate(${direction.degrees}deg)`;
  setText("currentWeatherDescription", currentWeatherDescription(values, direction));

  setText("currentPrecipitation", `${Math.round(values.probability)}% · ${values.precipitation.toFixed(1)} mm`);
  setText("currentRainState", rainLabel(values.probability, values.precipitation));
  setText("currentTemperature", `${Math.round(values.temp)} °C`);
  setText("currentTempMeta", `Máx. ${Math.round(temperatures.max)}° · Mín. ${Math.round(temperatures.min)}° · Sensação ${Math.round(values.apparent)}°`);
  setText("currentHumidity", `${Math.round(values.humidity)}%`);
  setText("humidityState", humidityLabel(values.humidity));
  setText("currentUv", values.uv.toFixed(1));
  setText("uvState", uvLabel(values.uv));

  renderClothing(values);
  setText("conditionScore", quality.score);
  setText("qualityRingValue", quality.score);
  setText("conditionLabel", quality.label);
  $("qualityRing").style.setProperty("--score", quality.score);
}

function rangeStats(data, start, count) {
  const end = Math.min(start + count, data.hourly.time.length);
  const slice = (key) => (data.hourly[key] || []).slice(start, end).map(Number).filter(Number.isFinite);
  const winds = slice("wind_speed_10m");
  const gusts = slice("wind_gusts_10m");
  const probabilities = slice("precipitation_probability");
  const precipitation = slice("precipitation");
  const directions = slice("wind_direction_10m");
  return {
    averageWind: winds.length ? winds.reduce((sum, value) => sum + value, 0) / winds.length : 0,
    maxGust: gusts.length ? Math.max(...gusts) : 0,
    maxProbability: probabilities.length ? Math.max(...probabilities) : 0,
    precipitation: precipitation.reduce((sum, value) => sum + value, 0),
    direction: directions.length ? directions[Math.floor(directions.length / 2)] : 0
  };
}

function renderForecastSummary(data) {
  const start = nearestHourIndex(data.hourly.time);
  const stats = rangeStats(data, start, FORECAST_HOURS);
  const current = currentValues(data, start);
  const direction = windDirection(stats.direction);
  const headline = `${weatherConditionLabel(current.weatherCode)}, ${windStrengthLabel(stats.averageWind).toLowerCase()}`;
  const rainDetail = stats.precipitation >= .2 || stats.maxProbability >= 20
    ? ` · chuva máx. ${Math.round(stats.maxProbability)}% · ${stats.precipitation.toFixed(1)} mm/48 h`
    : "";

  setText("forecastHeadline", headline);
  setText("forecastSubline", `Vento dominante ${direction.from} · rajadas até ${Math.round(stats.maxGust)} km/h${rainDetail}`);
  setText("summaryWind", Math.round(stats.averageWind));
  $("summaryWindArrow").style.transform = `rotate(${direction.degrees}deg)`;
}

function renderForecast48(data) {
  const times = data.hourly.time;
  const start = nearestHourIndex(times);
  const rows = [];
  for (let index = start, row = 0; index < Math.min(start + FORECAST_HOURS, times.length); index += 1, row += 1) {
    const values = currentValues(data, index);
    const direction = windDirection(values.direction);
    const quality = conditionQuality(values);
    const timeLabel = row === 0 ? "Agora" : formatHour(times[index]);
    rows.push(`
      <tr class="${row === 0 ? "is-now" : ""}">
        <td class="time-cell"><strong>${timeLabel}</strong><small>${formatWeekday(times[index])}, ${formatShortDate(times[index])}</small></td>
        <td class="wind-summary-cell" aria-label="Direção ${direction.from} para ${direction.to}; vento ${Math.round(values.wind)} quilómetros por hora; rajadas ${Math.round(values.gust)} quilómetros por hora">
          <div class="wind-summary-direction"><span class="table-arrow" style="transform:rotate(${direction.degrees}deg)">↓</span><strong>${direction.from} → ${direction.to}</strong></div>
          <div class="wind-summary-speeds"><b>${Math.round(values.wind)}</b><i>|</i><b class="gust">${Math.round(values.gust)}</b><small>km/h</small></div>
        </td>
        <td class="number-cell rain-cell"><strong>${Math.round(values.probability)}%</strong><small>${values.precipitation.toFixed(1)} mm</small></td>
        <td class="number-cell temp-cell"><strong>${Math.round(values.temp)}°</strong><small>sens. ${Math.round(values.apparent)}°</small></td>
        <td class="number-cell"><strong>${Math.round(values.humidity)}%</strong><small>${humidityLabel(values.humidity)}</small></td>
        <td class="number-cell uv-cell"><strong>${values.uv.toFixed(1)}</strong><small>${uvLabel(values.uv)}</small></td>
        <td><span class="quality-badge">${quality.score}</span></td>
      </tr>
    `);
  }
  const tableBody = $("forecast48Table")?.querySelector("tbody");
  if (tableBody) tableBody.innerHTML = rows.join("");
}

function hourlyDayAverage(data, isoDay, key) {
  const values = [];
  data.hourly.time.forEach((time, index) => {
    if (time.slice(0, 10) === isoDay) {
      const value = Number(data.hourly[key]?.[index]);
      if (Number.isFinite(value)) values.push(value);
    }
  });
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function renderForecast7(data) {
  const daily = data.daily || {};
  const rows = (daily.time || []).slice(0, 7).map((day, index) => {
    const direction = windDirection(daily.wind_direction_10m_dominant?.[index]);
    const humidity = hourlyDayAverage(data, day, "relative_humidity_2m");
    const wind = finite(daily.wind_speed_10m_max?.[index]);
    const gust = finite(daily.wind_gusts_10m_max?.[index]);
    const rain = finite(daily.precipitation_sum?.[index]);
    const probability = finite(daily.precipitation_probability_max?.[index]);
    const min = finite(daily.temperature_2m_min?.[index]);
    const max = finite(daily.temperature_2m_max?.[index]);
    const uv = finite(daily.uv_index_max?.[index]);
    return `
      <article class="daily-row">
        <div class="daily-day"><strong>${index === 0 ? "Hoje" : formatWeekday(day, true)}</strong><small>${formatShortDate(day)}</small></div>
        <div class="daily-metric daily-wind"><strong><span class="table-arrow" style="display:inline-block;transform:rotate(${direction.degrees}deg)">↓</span> ${direction.from} · ${Math.round(wind)}</strong><small>Rajadas ${Math.round(gust)} km/h</small></div>
        <div class="daily-metric daily-rain"><strong>${Math.round(probability)}% · ${rain.toFixed(1)} mm</strong><small>Precipitação</small></div>
        <div class="daily-metric daily-temp"><strong>${Math.round(min)}° / ${Math.round(max)}°</strong><small>Hum. ${Math.round(humidity)}% · UV ${uv.toFixed(1)}</small></div>
      </article>
    `;
  });
  setHTML("dailyList", rows.join(""));
}

function renderWeather(data, source, location) {
  renderCurrent(data);
  renderForecastSummary(data);
  renderForecast48(data);
  renderForecast7(data);
  const fallbackNote = location.isFallback ? " · geolocalização indisponível" : "";
  setText("updated", `Atualizado às ${formatUpdated()}${fallbackNote}`);
  setText("source", `Fonte meteorológica: ${source}`);
  setText("forecastSource", `Fonte meteorológica: ${source}`);
}

async function refreshWeather() {
  const runId = ++refreshRunId;
  const refreshButton = $("refreshCurrent");
  refreshButton?.classList.add("is-spinning");
  setText("updated", "A atualizar as condições…");
  try {
    const location = await resolveActiveLocation();
    if (runId !== refreshRunId) return;
    resolvedLocation = location;
    updateLocationLabels(location);
    renderWindMap(location);
    const response = await fetchWeather(location);
    if (runId !== refreshRunId) return;
    weatherData = response.data;
    weatherSource = response.source;
    renderWeather(weatherData, weatherSource, resolvedLocation);
  } catch (error) {
    if (runId !== refreshRunId) return;
    setText("updated", `Não foi possível atualizar: ${error?.message || error}`);
    setText("forecastHeadline", "Dados temporariamente indisponíveis");
    showToast("Não foi possível obter a meteorologia. Tenta novamente.");
  } finally {
    if (runId === refreshRunId) refreshButton?.classList.remove("is-spinning");
  }
}

function setAppView(view) {
  $$('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$('[data-app-view]').forEach((button) => button.classList.toggle("is-active", button.dataset.appView === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setForecastMode(mode) {
  $$('[data-forecast-mode]').forEach((button) => button.classList.toggle("is-active", button.dataset.forecastMode === mode));
  $("forecast48Panel").hidden = mode !== "48h";
  $("forecast7Panel").hidden = mode !== "7d";
  setText("forecastEyebrow", mode === "48h" ? "PRÓXIMAS 48 HORAS" : "PRÓXIMOS 7 DIAS");
}

function setForecastContext(context) {
  const routeActive = context === "route";
  $$('[data-forecast-context]').forEach((button) => button.classList.toggle("is-active", button.dataset.forecastContext === context));
  $("forecastLocalContent").hidden = routeActive;
  $("forecastRouteContent").hidden = !routeActive;
  if (routeActive && routeAnalysis) requestAnimationFrame(() => renderRouteMap(routeData, routeAnalysis.samples));
}

function routeDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function routeTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initRouteDefaults() {
  const departure = new Date(Date.now() + 60 * 60 * 1000);
  departure.setMinutes(Math.ceil(departure.getMinutes() / ROUTE_SAMPLE_MINUTES) * ROUTE_SAMPLE_MINUTES, 0, 0);
  const maximum = new Date();
  maximum.setDate(maximum.getDate() + 6);
  $("routeStartDate").value = routeDateInputValue(departure);
  $("routeStartDate").min = routeDateInputValue(new Date());
  $("routeStartDate").max = routeDateInputValue(maximum);
  $("routeStartTime").value = routeTimeInputValue(departure);
}

function routeChildText(parent, localName) {
  if (!parent) return "";
  const child = Array.from(parent.children || []).find((element) => element.localName === localName);
  return child?.textContent?.trim() || "";
}

function haversineKm(first, second) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lon - first.lon);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function routeBearing(first, second) {
  const toRadians = (value) => value * Math.PI / 180;
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const longitudeDelta = toRadians(second.lon - first.lon);
  const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
    - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function parseGpx(text, fallbackName = "Rota GPX") {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("O ficheiro GPX não é válido.");
  const trackNodes = Array.from(xml.getElementsByTagNameNS("*", "trkpt"));
  const routeNodes = Array.from(xml.getElementsByTagNameNS("*", "rtept"));
  const pointNodes = trackNodes.length ? trackNodes : routeNodes;
  if (pointNodes.length < 2) throw new Error("O GPX não contém pontos suficientes para formar uma rota.");

  const rawPoints = pointNodes.map((node) => {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    const elevationNode = Array.from(node.children || []).find((element) => element.localName === "ele");
    const elevation = Number(elevationNode?.textContent);
    return { lat, lon, elevation: Number.isFinite(elevation) ? elevation : null };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  const points = [];
  let distanceKm = 0;
  let elevationGain = 0;
  rawPoints.forEach((point) => {
    const previous = points.at(-1);
    if (previous) {
      const segmentDistance = haversineKm(previous, point);
      if (segmentDistance < .0005) return;
      distanceKm += segmentDistance;
      if (point.elevation !== null && previous.elevation !== null) {
        const gain = point.elevation - previous.elevation;
        if (gain > .5 && gain < 100) elevationGain += gain;
      }
    }
    points.push({ ...point, distanceKm });
  });
  if (points.length < 2 || distanceKm < .1) throw new Error("A rota do GPX é demasiado curta para analisar.");

  const metadata = Array.from(xml.documentElement?.children || []).find((element) => element.localName === "metadata");
  const track = Array.from(xml.documentElement?.children || []).find((element) => element.localName === "trk");
  const route = Array.from(xml.documentElement?.children || []).find((element) => element.localName === "rte");
  const name = routeChildText(metadata, "name") || routeChildText(track, "name") || routeChildText(route, "name") || fallbackName;
  return { name, points, distanceKm, elevationGain: Math.round(elevationGain) };
}

function routePointAtDistance(route, targetDistanceKm) {
  const points = route.points;
  const target = clamp(targetDistanceKm, 0, route.distanceKm);
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distanceKm < target) low = middle + 1;
    else high = middle;
  }
  const nextIndex = clamp(low, 1, points.length - 1);
  const previous = points[nextIndex - 1];
  const next = points[nextIndex];
  const segmentDistance = Math.max(next.distanceKm - previous.distanceKm, .000001);
  const ratio = clamp((target - previous.distanceKm) / segmentDistance, 0, 1);
  const elevation = previous.elevation !== null && next.elevation !== null
    ? previous.elevation + (next.elevation - previous.elevation) * ratio
    : (previous.elevation ?? next.elevation);
  return {
    lat: previous.lat + (next.lat - previous.lat) * ratio,
    lon: previous.lon + (next.lon - previous.lon) * ratio,
    elevation,
    distanceKm: target,
    bearing: routeBearing(previous, next)
  };
}

function buildRouteSamples(route, departure, averageSpeed) {
  const durationMinutes = route.distanceKm / averageSpeed * 60;
  const intervalMinutes = Math.max(
    ROUTE_SAMPLE_MINUTES,
    Math.ceil(durationMinutes / (ROUTE_MAX_SAMPLES - 1) / ROUTE_SAMPLE_MINUTES) * ROUTE_SAMPLE_MINUTES
  );
  const elapsedMinutes = [];
  for (let minute = 0; minute < durationMinutes; minute += intervalMinutes) elapsedMinutes.push(minute);
  if (elapsedMinutes.at(-1) !== durationMinutes) elapsedMinutes.push(durationMinutes);
  return elapsedMinutes.map((minute) => ({
    ...routePointAtDistance(route, Math.min(route.distanceKm, averageSpeed * minute / 60)),
    elapsedMinutes: minute,
    arrivalEpoch: Math.round((departure.getTime() + minute * 60 * 1000) / 1000)
  }));
}

function buildRouteWeatherUrl(samples, model = "") {
  const utcHour = (epoch) => {
    const date = new Date(epoch * 1000);
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString().slice(0, 16);
  };
  const params = new URLSearchParams({
    latitude: samples.map((sample) => sample.lat.toFixed(5)).join(","),
    longitude: samples.map((sample) => sample.lon.toFixed(5)).join(","),
    start_hour: utcHour(samples[0].arrivalEpoch - 60 * 60),
    end_hour: utcHour(samples.at(-1).arrivalEpoch + 2 * 60 * 60),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "uv_index"
    ].join(","),
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    timeformat: "unixtime"
  });
  if (model) params.set("models", model);
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function nearestEpochIndex(times, target) {
  let closestIndex = 0;
  let closestDistance = Infinity;
  times.forEach((time, index) => {
    const distance = Math.abs(Number(time) - target);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestDistance <= 90 * 60 ? closestIndex : -1;
}

function routeWeatherAt(dataset, arrivalEpoch) {
  const times = dataset?.hourly?.time;
  if (!Array.isArray(times) || !times.length) throw new Error("Previsão horária incompleta para a rota.");
  const index = nearestEpochIndex(times, arrivalEpoch);
  if (index < 0) throw new Error("A partida selecionada está fora do período de previsão disponível.");
  const read = (key, fallback = NaN) => {
    const raw = dataset.hourly?.[key]?.[index];
    if (raw === null || raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const values = {
    temp: read("temperature_2m"),
    apparent: read("apparent_temperature"),
    humidity: read("relative_humidity_2m"),
    precipitation: read("precipitation"),
    probability: read("precipitation_probability"),
    weatherCode: read("weather_code", -1),
    wind: read("wind_speed_10m"),
    gust: read("wind_gusts_10m"),
    direction: read("wind_direction_10m"),
    uv: read("uv_index", 0)
  };
  const required = [values.temp, values.apparent, values.humidity, values.precipitation, values.probability, values.wind, values.gust, values.direction];
  if (!required.every(Number.isFinite)) throw new Error("Dados meteorológicos incompletos num dos pontos da rota.");
  return values;
}

async function requestRouteWeather(samples, model = "") {
  const response = await fetchWithTimeout(buildRouteWeatherUrl(samples, model));
  if (!response.ok) throw new Error(`serviço meteorológico indisponível (${response.status})`);
  const payload = await response.json();
  const datasets = Array.isArray(payload) ? payload : [payload];
  if (datasets.length !== samples.length) throw new Error("Resposta meteorológica incompleta para a rota.");
  return datasets.map((dataset, index) => routeWeatherAt(dataset, samples[index].arrivalEpoch));
}

async function fetchRouteWeather(samples) {
  try {
    const values = await requestRouteWeather(samples, PREFERRED_WEATHER_MODEL);
    return { values, source: "Open-Meteo · KNMI Seamless (HARMONIE + ECMWF)" };
  } catch (_) {
    const values = await requestRouteWeather(samples);
    return { values, source: "Open-Meteo · Best Match (fallback automático)" };
  }
}

function routeWindRelative(travelBearing, windFrom) {
  const difference = Math.abs(((windFrom - travelBearing + 540) % 360) - 180);
  const category = difference <= 60 ? "headwind" : difference >= 120 ? "tailwind" : "crosswind";
  return { category, difference };
}

function routeWindBreakdown(samples, totalDistanceKm) {
  const distances = { headwind: 0, crosswind: 0, tailwind: 0 };
  samples.slice(0, -1).forEach((sample, index) => {
    distances[sample.relative.category] += Math.max(0, samples[index + 1].distanceKm - sample.distanceKm);
  });
  const percentage = (value) => Math.round(value / Math.max(totalDistanceKm, .001) * 100);
  return {
    distances,
    percentages: {
      headwind: percentage(distances.headwind),
      crosswind: percentage(distances.crosswind),
      tailwind: percentage(distances.tailwind)
    }
  };
}

function routeDurationLabel(minutes) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return hours ? `${hours} h ${String(remainder).padStart(2, "0")}` : `${remainder} min`;
}

function routeWindHeadline(percentages) {
  const entries = [
    ["headwind", percentages.headwind, "Vento frontal"],
    ["crosswind", percentages.crosswind, "Vento lateral"],
    ["tailwind", percentages.tailwind, "Vento favorável"]
  ];
  const dominant = entries.sort((first, second) => second[1] - first[1])[0];
  return `${dominant[2]} em ${dominant[1]}% da rota`;
}

function routeCategoryLabel(category) {
  return { headwind: "Frontal", crosswind: "Lateral", tailwind: "Favorável" }[category] || "Variável";
}

function routeTimeLabel(epoch) {
  return new Date(epoch * 1000).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function renderRouteTimeline(samples) {
  setText("routePointCount", `${samples.length} pontos`);
  setHTML("routeTimeline", samples.map((sample) => {
    const direction = windDirection(sample.weather.direction);
    return `
      <article class="route-point">
        <div class="route-point-time"><strong>${routeTimeLabel(sample.arrivalEpoch)}</strong><small>km ${sample.distanceKm.toFixed(1).replace(".", ",")}</small></div>
        <div class="route-point-wind">
          <span class="route-wind-state ${sample.relative.category}">${routeCategoryLabel(sample.relative.category)}</span>
          <div><span class="route-wind-arrow" style="transform:rotate(${direction.degrees}deg)">↓</span><strong>${direction.from} · ${Math.round(sample.weather.wind)}</strong><small>raj. ${Math.round(sample.weather.gust)} km/h</small></div>
        </div>
        <div class="route-point-weather"><strong>${Math.round(sample.weather.probability)}%</strong><small>${sample.weather.precipitation.toFixed(1)} mm</small></div>
        <div class="route-point-temp"><strong>${Math.round(sample.weather.temp)}°</strong><small>sens. ${Math.round(sample.weather.apparent)}°</small></div>
        <p class="route-point-details">${weatherConditionLabel(sample.weather.weatherCode)} · Hum. ${Math.round(sample.weather.humidity)}% · UV ${sample.weather.uv.toFixed(1)}</p>
      </article>
    `;
  }).join(""));
}

function routeMapPixel(point, zoom) {
  const tile = osmTileCoordinates(point.lat, point.lon, zoom);
  return { x: tile.x * OSM_TILE_SIZE, y: tile.y * OSM_TILE_SIZE };
}

function routeMapZoom(route, width, height) {
  const bounds = route.points.reduce((result, point) => ({
    minLat: Math.min(result.minLat, point.lat),
    maxLat: Math.max(result.maxLat, point.lat),
    minLon: Math.min(result.minLon, point.lon),
    maxLon: Math.max(result.maxLon, point.lon)
  }), { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity });
  const corners = [
    { lat: bounds.minLat, lon: bounds.minLon },
    { lat: bounds.maxLat, lon: bounds.maxLon }
  ];
  for (let zoom = 15; zoom >= 3; zoom -= 1) {
    const first = routeMapPixel(corners[0], zoom);
    const second = routeMapPixel(corners[1], zoom);
    if (Math.abs(second.x - first.x) <= width - 48 && Math.abs(second.y - first.y) <= height - 48) return zoom;
  }
  return 3;
}

function routeMapCategoryAtDistance(samples, distanceKm) {
  for (let index = 0; index < samples.length - 1; index += 1) {
    if (distanceKm <= samples[index + 1].distanceKm) return samples[index].relative.category;
  }
  return samples.at(-1)?.relative.category || "crosswind";
}

function renderRouteMap(route, samples) {
  const container = $("routeMap");
  const tileLayer = $("routeMapTiles");
  const overlay = $("routeMapOverlay");
  if (!container || !tileLayer || !overlay || !route?.points?.length || !samples?.length) return;
  const width = container.clientWidth || 360;
  const height = container.clientHeight || 230;
  const zoom = routeMapZoom(route, width, height);
  const pixels = route.points.map((point) => ({ ...routeMapPixel(point, zoom), distanceKm: point.distanceKm }));
  const bounds = pixels.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    maxX: Math.max(result.maxX, point.x),
    minY: Math.min(result.minY, point.y),
    maxY: Math.max(result.maxY, point.y)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const { minX, maxX, minY, maxY } = bounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const originX = centerX - width / 2;
  const originY = centerY - height / 2;
  const scale = 2 ** zoom;
  tileLayer.innerHTML = "";
  for (let tileY = Math.floor(originY / OSM_TILE_SIZE) - 1; tileY <= Math.floor((originY + height) / OSM_TILE_SIZE) + 1; tileY += 1) {
    if (tileY < 0 || tileY >= scale) continue;
    for (let tileX = Math.floor(originX / OSM_TILE_SIZE) - 1; tileX <= Math.floor((originX + width) / OSM_TILE_SIZE) + 1; tileX += 1) {
      const image = document.createElement("img");
      const wrappedX = ((tileX % scale) + scale) % scale;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      image.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`;
      image.style.left = `${tileX * OSM_TILE_SIZE - originX}px`;
      image.style.top = `${tileY * OSM_TILE_SIZE - originY}px`;
      tileLayer.appendChild(image);
    }
  }

  overlay.innerHTML = "";
  overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const namespace = "http://www.w3.org/2000/svg";
  const displayed = pixels.filter((_, index) => index % Math.max(1, Math.ceil(pixels.length / 700)) === 0 || index === pixels.length - 1);
  const routeLine = document.createElementNS(namespace, "polyline");
  routeLine.setAttribute("class", "route-map-base");
  routeLine.setAttribute("points", displayed.map((point) => `${point.x - originX},${point.y - originY}`).join(" "));
  overlay.appendChild(routeLine);

  let currentCategory = "";
  let segmentPoints = [];
  const appendSegment = () => {
    if (segmentPoints.length < 2) return;
    const line = document.createElementNS(namespace, "polyline");
    line.setAttribute("class", `route-map-line ${currentCategory}`);
    line.setAttribute("points", segmentPoints.join(" "));
    overlay.appendChild(line);
  };
  displayed.forEach((point) => {
    const category = routeMapCategoryAtDistance(samples, point.distanceKm);
    const coordinates = `${point.x - originX},${point.y - originY}`;
    if (currentCategory && category !== currentCategory) {
      segmentPoints.push(coordinates);
      appendSegment();
      segmentPoints = [coordinates];
    } else {
      segmentPoints.push(coordinates);
    }
    currentCategory = category;
  });
  appendSegment();

  [displayed[0], displayed.at(-1)].forEach((point, index) => {
    const marker = document.createElementNS(namespace, "circle");
    marker.setAttribute("class", `route-map-marker ${index ? "finish" : "start"}`);
    marker.setAttribute("cx", point.x - originX);
    marker.setAttribute("cy", point.y - originY);
    marker.setAttribute("r", 5);
    overlay.appendChild(marker);
  });
}

function renderRouteAnalysis(analysis) {
  const { samples, breakdown, source, durationMinutes } = analysis;
  const temperatures = samples.map((sample) => sample.weather.temp);
  const gusts = samples.map((sample) => sample.weather.gust);
  const probabilities = samples.map((sample) => sample.weather.probability);
  const precipitation = samples.map((sample) => sample.weather.precipitation);
  const maxGust = Math.max(...gusts);
  const maxProbability = Math.max(...probabilities);
  const maxPrecipitation = Math.max(...precipitation);
  setText("routeHeadline", routeWindHeadline(breakdown.percentages));
  setText("routeSubline", `Rajadas até ${Math.round(maxGust)} km/h · precipitação máxima ${maxPrecipitation.toFixed(1)} mm/h`);
  setText("routeDepartureBadge", routeTimeLabel(samples[0].arrivalEpoch));
  setText("routeDuration", routeDurationLabel(durationMinutes));
  setText("routeTempRange", `${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))}°`);
  setText("routeMaxGust", `${Math.round(maxGust)} km/h`);
  setText("routeRainRisk", `${Math.round(maxProbability)}%`);
  setText("routeHeadwind", `${breakdown.percentages.headwind}%`);
  setText("routeCrosswind", `${breakdown.percentages.crosswind}%`);
  setText("routeTailwind", `${breakdown.percentages.tailwind}%`);
  const bars = $$("#routeWindBar span");
  if (bars[0]) bars[0].style.width = `${breakdown.percentages.headwind}%`;
  if (bars[1]) bars[1].style.width = `${breakdown.percentages.crosswind}%`;
  if (bars[2]) bars[2].style.width = `${breakdown.percentages.tailwind}%`;
  setText("routeSource", `Fonte meteorológica: ${source}`);
  renderRouteTimeline(samples);
  $("routeResults").hidden = false;
  requestAnimationFrame(() => renderRouteMap(routeData, samples));
}

async function handleRouteFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const runId = ++routeAnalysisRunId;
  $("routeAnalyze").disabled = false;
  if (file.size > ROUTE_MAX_FILE_BYTES) {
    showToast("O ficheiro GPX não pode exceder 10 MB.");
    event.target.value = "";
    return;
  }
  try {
    setText("routeAnalysisState", "A ler o ficheiro GPX…");
    const parsedRoute = parseGpx(await file.text(), file.name.replace(/\.gpx$/i, ""));
    if (runId !== routeAnalysisRunId) return;
    routeData = parsedRoute;
    routeAnalysis = null;
    setText("routeName", routeData.name);
    setText("routeDistance", routeData.distanceKm.toFixed(1).replace(".", ","));
    setText("routeElevation", routeData.elevationGain);
    $("routeSettings").hidden = false;
    $("routeResults").hidden = true;
    setText("routeAnalysisState", "Rota pronta. Confirma a partida e a velocidade média.");
    showToast("Rota GPX carregada.");
  } catch (error) {
    routeData = null;
    $("routeSettings").hidden = true;
    $("routeResults").hidden = true;
    showToast(error?.message || "Não foi possível ler o ficheiro GPX.");
  } finally {
    event.target.value = "";
  }
}

async function analyseRoute() {
  if (!routeData) return;
  const date = $("routeStartDate").value;
  const time = $("routeStartTime").value;
  const speed = Number($("routeAverageSpeed").value);
  const departure = new Date(`${date}T${time || "00:00"}:00`);
  if (!date || !time || !Number.isFinite(departure.getTime())) {
    showToast("Seleciona uma data e hora de partida válidas.");
    return;
  }
  if (!Number.isFinite(speed) || speed < 8 || speed > 50) {
    showToast("A velocidade média deve estar entre 8 e 50 km/h.");
    return;
  }
  if (departure.getTime() < Date.now() - 15 * 60 * 1000) {
    showToast("Seleciona uma hora de partida futura.");
    return;
  }

  const runId = ++routeAnalysisRunId;
  const button = $("routeAnalyze");
  button.disabled = true;
  $("routeResults").hidden = true;
  setText("routeAnalysisState", "A cruzar a rota com a previsão meteorológica…");
  try {
    const samples = buildRouteSamples(routeData, departure, speed);
    const response = await fetchRouteWeather(samples);
    if (runId !== routeAnalysisRunId) return;
    const enrichedSamples = samples.map((sample, index) => ({
      ...sample,
      weather: response.values[index],
      relative: routeWindRelative(sample.bearing, response.values[index].direction)
    }));
    routeAnalysis = {
      samples: enrichedSamples,
      breakdown: routeWindBreakdown(enrichedSamples, routeData.distanceKm),
      source: response.source,
      durationMinutes: routeData.distanceKm / speed * 60
    };
    renderRouteAnalysis(routeAnalysis);
    setText("routeAnalysisState", `Análise concluída para ${enrichedSamples.length} pontos da rota.`);
  } catch (error) {
    if (runId !== routeAnalysisRunId) return;
    setText("routeAnalysisState", `Não foi possível analisar: ${error?.message || error}`);
    showToast("Não foi possível obter a previsão da rota.");
  } finally {
    if (runId === routeAnalysisRunId) button.disabled = false;
  }
}

function locationOptionButton(location, selected) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `location-option${selected ? " is-selected" : ""}`;
  const icon = document.createElement("span");
  icon.className = "soft-icon green";
  icon.innerHTML = '<svg><use href="#i-location"/></svg>';
  const text = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = location.name;
  const subtitle = document.createElement("small");
  subtitle.textContent = location.id === AUTO_LOCATION_ID ? "Usar a posição deste dispositivo" : (location.region || "Portugal");
  text.append(title, subtitle);
  const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  check.innerHTML = '<use href="#i-check"/>';
  button.append(icon, text, check);
  button.addEventListener("click", () => selectLocation(location));
  return button;
}

function renderLocationResults(locations) {
  const container = $("locationResults");
  if (!container) return;
  container.innerHTML = "";
  locations.forEach((location) => {
    const selected = selectedLocation.id === location.id;
    container.appendChild(locationOptionButton(location, selected));
  });
  if (!locations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Não foram encontradas localidades.";
    container.appendChild(empty);
  }
}

function openLocationModal() {
  const modal = $("locationModal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  $("locationSearch").value = "";
  renderLocationResults([{ id: AUTO_LOCATION_ID, name: "Localização atual" }, ...LOCATIONS]);
  setTimeout(() => $("locationSearch")?.focus(), 80);
}

function closeLocationModal() {
  $("locationModal").hidden = true;
  document.body.style.overflow = "";
}

async function selectLocation(location) {
  selectedLocation = location.id === AUTO_LOCATION_ID
    ? { id: AUTO_LOCATION_ID, name: "Localização atual" }
    : { id: location.id, name: location.name, region: location.region || "Portugal", lat: finite(location.lat), lon: finite(location.lon) };
  saveLocationPreference(selectedLocation);
  updateLocationLabels(selectedLocation);
  closeLocationModal();
  await refreshWeather();
}

async function searchLocations(query) {
  const normalized = query.trim().toLocaleLowerCase("pt-PT");
  if (!normalized) {
    renderLocationResults([{ id: AUTO_LOCATION_ID, name: "Localização atual" }, ...LOCATIONS]);
    return;
  }
  const localMatches = LOCATIONS.filter((location) => `${location.name} ${location.region}`.toLocaleLowerCase("pt-PT").includes(normalized));
  renderLocationResults(localMatches);
  if (normalized.length < 2) return;

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=pt&format=json`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return;
    const data = await response.json();
    const remote = (data.results || []).map((result) => ({
      id: `geo_${result.id}`,
      name: result.name,
      region: [result.admin2, result.admin1].filter(Boolean).join(" · ") || "Portugal",
      lat: result.latitude,
      lon: result.longitude
    }));
    const unique = [...localMatches, ...remote].filter((location, index, all) => all.findIndex((candidate) => candidate.name === location.name && Math.abs(finite(candidate.lat) - finite(location.lat)) < .02) === index);
    if ($("locationSearch").value.trim() === query.trim()) renderLocationResults(unique);
  } catch (_) {}
}

/* Pressão Pneus — fórmula preservada da versão anterior */

const TP_DEFAULT_VALUES = {
  riderWeight: 75,
  bikeWeight: 10.5,
  cargoWeight: 1,
  surface: "gravel",
  condition: "dry",
  preference: "balanced",
  system: "tubeless",
  frontWidth: 45,
  rearWidth: 45,
  rimWidth: 27
};

const TP_SETUPS_KEY = "semPlanoTirePressureSetupsV2";
const TP_ACTIVE_SETUP_KEY = "semPlanoTirePressureActiveSetupV2";
const TP_HISTORY_KEY = "semPlanoTirePressureHistoryV1";

function tpNumber(id, fallback = 0) {
  const value = Number($(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function tpGetSystem() {
  return document.querySelector('[data-tp-system].is-active')?.dataset.tpSystem || "tubeless";
}

function tpSetSystem(system) {
  $$('[data-tp-system]').forEach((button) => button.classList.toggle("is-active", button.dataset.tpSystem === system));
}

function tpReadValues() {
  return {
    riderWeight: tpNumber("tpRider", TP_DEFAULT_VALUES.riderWeight),
    bikeWeight: tpNumber("tpBike", TP_DEFAULT_VALUES.bikeWeight),
    cargoWeight: tpNumber("tpCargo", TP_DEFAULT_VALUES.cargoWeight),
    surface: $("tpSurface")?.value || TP_DEFAULT_VALUES.surface,
    condition: $("tpCondition")?.value || TP_DEFAULT_VALUES.condition,
    preference: $("tpPreference")?.value || TP_DEFAULT_VALUES.preference,
    system: tpGetSystem(),
    frontWidth: tpNumber("tpFrontWidth", TP_DEFAULT_VALUES.frontWidth),
    rearWidth: tpNumber("tpRearWidth", TP_DEFAULT_VALUES.rearWidth),
    rimWidth: tpNumber("tpRimWidth", TP_DEFAULT_VALUES.rimWidth)
  };
}

function tpApplyValues(values) {
  const next = { ...TP_DEFAULT_VALUES, ...(values || {}) };
  $("tpRider").value = next.riderWeight;
  $("tpBike").value = next.bikeWeight;
  $("tpCargo").value = next.cargoWeight;
  $("tpFrontWidth").value = next.frontWidth;
  $("tpRearWidth").value = next.rearWidth;
  $("tpRimWidth").value = next.rimWidth;
  $("tpSurface").value = next.surface;
  $("tpCondition").value = next.condition;
  $("tpPreference").value = next.preference;
  tpSetSystem(next.system);
  tpRenderPressure();
}

function tpRoundBar(value) {
  return Math.round(value * 10) / 10;
}

function tpBarToPsi(value) {
  return Math.round(value * 14.5038);
}

function tpCalculate(values) {
  const totalWeight = Math.max(45, values.riderWeight + values.bikeWeight + values.cargoWeight);
  const referenceWeight = 86.5;
  const referenceWidth = 45;
  const widthExponent = 1.45;
  const weightFactor = totalWeight / referenceWeight;

  let frontBar = 1.75 * weightFactor * Math.pow(referenceWidth / Math.max(values.frontWidth, 20), widthExponent);
  let rearBar = 2.0 * weightFactor * Math.pow(referenceWidth / Math.max(values.rearWidth, 20), widthExponent);

  const surfaceAdjustment = { road: .35, allroad: .15, gravel: 0, rough: -.12 };
  const preferenceAdjustment = { comfort: -.1, balanced: 0, performance: .12 };
  const systemAdjustment = values.system === "tube" ? .25 : 0;
  const conditionAdjustment = values.condition === "wet" ? -.1 : 0;
  const finalAdjustment = (surfaceAdjustment[values.surface] || 0) + (preferenceAdjustment[values.preference] || 0) + systemAdjustment + conditionAdjustment;

  frontBar += finalAdjustment;
  rearBar += finalAdjustment;
  const minPressure = values.system === "tube" ? 1.8 : 1.2;
  const maxPressure = values.frontWidth <= 30 || values.rearWidth <= 30 ? 7 : 4;
  return {
    frontBar: tpRoundBar(clamp(frontBar, minPressure, maxPressure)),
    rearBar: tpRoundBar(clamp(rearBar, minPressure, maxPressure))
  };
}

function tpPreferencePosition(preference) {
  if (preference === "comfort") return "25%";
  if (preference === "performance") return "75%";
  return "50%";
}

function tpRenderPressure() {
  const values = tpReadValues();
  const result = tpCalculate(values);
  setText("tpFrontBar", result.frontBar.toFixed(1).replace(".", ","));
  setText("tpRearBar", result.rearBar.toFixed(1).replace(".", ","));
  setText("tpFrontPsi", `${tpBarToPsi(result.frontBar)} psi`);
  setText("tpRearPsi", `${tpBarToPsi(result.rearBar)} psi`);
  $("tpBalanceDot").style.left = tpPreferencePosition(values.preference);
  const wetText = values.condition === "wet" ? " Em piso molhado, a pressão é ligeiramente reduzida." : "";
  const tubeText = values.system === "tube" ? " Com câmara, a pressão sobe para reduzir o risco de snake bite." : "";
  setText("tpTip", `Ponto de partida recomendado. Ajusta ±0,1–0,2 bar conforme o terreno e a tua sensação.${wetText}${tubeText}`);
  return { values, result };
}

function tpGetJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function tpSetJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function tpSurfaceLabel(value) {
  return { road: "Estrada lisa", allroad: "All-road", gravel: "Gravel misto", rough: "Gravel mau piso" }[value] || "Gravel misto";
}

function tpSystemLabel(value) {
  return value === "tube" ? "Câmara" : "Tubeless";
}

function tpSetupSummary(values) {
  const width = values.frontWidth === values.rearWidth ? `${values.frontWidth} mm` : `${values.frontWidth}/${values.rearWidth} mm`;
  return `${tpSurfaceLabel(values.surface)} · ${width} · ${tpSystemLabel(values.system)}`;
}

function tpDefaultSetupName(values) {
  return `${tpSurfaceLabel(values.surface)} ${values.frontWidth}/${values.rearWidth} mm`;
}

function tpSetupTimestamp(setup) {
  const timestamp = Date.parse(setup.lastUsedAt || setup.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function tpRenderRecentSetups(setups, activeId) {
  const recentSetups = [...setups]
    .sort((first, second) => tpSetupTimestamp(second) - tpSetupTimestamp(first))
    .slice(0, 3);
  const section = $("tpRecentSetups");
  if (section) section.hidden = recentSetups.length === 0;
  setHTML("tpRecentSetupList", recentSetups.map((setup) => {
    const values = { ...TP_DEFAULT_VALUES, ...setup.values };
    const result = tpCalculate(values);
    const name = setup.name || "Setup sem nome";
    return `
      <button class="recent-setup${setup.id === activeId ? " is-active" : ""}" type="button" data-load-setup="${escapeHtml(setup.id)}" aria-pressed="${setup.id === activeId}" title="Carregar ${escapeHtml(name)}">
        <span>${escapeHtml(name)}</span>
        <strong>${result.frontBar.toFixed(1).replace(".", ",")} / ${result.rearBar.toFixed(1).replace(".", ",")} <small>bar</small></strong>
        <em>frente / trás</em>
      </button>
    `;
  }).join(""));
}

function tpRenderSetups() {
  const setups = tpGetJson(TP_SETUPS_KEY).filter((setup) => setup?.id && setup?.values);
  const activeId = localStorage.getItem(TP_ACTIVE_SETUP_KEY);
  $("tpEmptySetups").hidden = setups.length > 0;
  tpRenderRecentSetups(setups, activeId);
  setHTML("tpSetupList", setups.map((setup) => `
    <article class="saved-item${setup.id === activeId ? " is-active" : ""}">
      <button class="saved-main" type="button" data-load-setup="${escapeHtml(setup.id)}">
        <strong>${escapeHtml(setup.name || "Setup sem nome")}</strong>
        <small>${escapeHtml(tpSetupSummary(setup.values))}</small>
      </button>
      <div class="saved-actions">${setup.id === activeId ? "<span>ATIVO</span>" : ""}<button class="tiny-button" type="button" data-delete-setup="${escapeHtml(setup.id)}" aria-label="Apagar setup"><svg><use href="#i-trash"/></svg></button></div>
    </article>
  `).join(""));
}

function tpSaveCurrentSetup() {
  const values = tpReadValues();
  const name = window.prompt("Nome do setup", tpDefaultSetupName(values));
  if (!name?.trim()) return;
  const createdAt = new Date().toISOString();
  const setup = { id: `setup-${Date.now()}`, name: name.trim(), createdAt, lastUsedAt: createdAt, values };
  const setups = tpGetJson(TP_SETUPS_KEY);
  setups.push(setup);
  tpSetJson(TP_SETUPS_KEY, setups);
  localStorage.setItem(TP_ACTIVE_SETUP_KEY, setup.id);
  tpRenderSetups();
  showToast(`Setup “${setup.name}” guardado.`);
}

function tpLoadSetup(id) {
  const setups = tpGetJson(TP_SETUPS_KEY);
  const setup = setups.find((item) => item.id === id);
  if (!setup) return;
  setup.lastUsedAt = new Date().toISOString();
  tpSetJson(TP_SETUPS_KEY, setups);
  tpApplyValues(setup.values);
  localStorage.setItem(TP_ACTIVE_SETUP_KEY, id);
  tpRenderSetups();
  setPressureTab("calculator");
  showToast(`Setup “${setup.name}” carregado.`);
}

function tpDeleteSetup(id) {
  const setups = tpGetJson(TP_SETUPS_KEY);
  const setup = setups.find((item) => item.id === id);
  if (!setup || !window.confirm(`Apagar o setup “${setup.name}”?`)) return;
  tpSetJson(TP_SETUPS_KEY, setups.filter((item) => item.id !== id));
  if (localStorage.getItem(TP_ACTIVE_SETUP_KEY) === id) localStorage.removeItem(TP_ACTIVE_SETUP_KEY);
  tpRenderSetups();
}

function tpMarkCustom() {
  localStorage.removeItem(TP_ACTIVE_SETUP_KEY);
  tpRenderSetups();
}

function tpAddHistory() {
  const { values, result } = tpRenderPressure();
  const history = tpGetJson(TP_HISTORY_KEY);
  history.unshift({ id: `history-${Date.now()}`, createdAt: new Date().toISOString(), values, result });
  tpSetJson(TP_HISTORY_KEY, history.slice(0, 40));
  tpRenderHistory();
  showToast("Resultado registado no histórico.");
}

function tpRenderHistory() {
  const history = tpGetJson(TP_HISTORY_KEY).filter((entry) => entry?.result && entry?.values);
  $("tpEmptyHistory").hidden = history.length > 0;
  setHTML("tpHistoryList", history.map((entry) => {
    const date = new Date(entry.createdAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `
      <article class="history-item">
        <div class="history-main"><strong>${escapeHtml(tpSetupSummary(entry.values))}</strong><small>${date} · ${entry.values.riderWeight + entry.values.bikeWeight + entry.values.cargoWeight} kg total</small></div>
        <div class="history-result"><strong>${entry.result.frontBar.toFixed(1).replace(".", ",")} / ${entry.result.rearBar.toFixed(1).replace(".", ",")} bar</strong><small>frente / trás</small></div>
      </article>
    `;
  }).join(""));
  $("tpClearHistory").hidden = history.length === 0;
}

function setPressureTab(tab) {
  $$('[data-pressure-tab]').forEach((button) => button.classList.toggle("is-active", button.dataset.pressureTab === tab));
  $$('[data-pressure-panel]').forEach((panel) => panel.hidden = panel.dataset.pressurePanel !== tab);
}

function initPressure() {
  $$('[data-tp-step]').forEach((button) => button.addEventListener("click", () => {
    const input = $(button.dataset.tpTarget);
    if (!input) return;
    const step = Number(button.dataset.tpStep || input.step || 1);
    const next = clamp(Number(input.value || 0) + step, Number(input.min || -Infinity), Number(input.max || Infinity));
    input.value = Number.isInteger(step) ? Math.round(next) : next.toFixed(1);
    tpMarkCustom();
    tpRenderPressure();
  }));

  $$('.pressure-form input, .pressure-form select').forEach((field) => {
    field.addEventListener("input", () => { tpMarkCustom(); tpRenderPressure(); });
    field.addEventListener("change", () => { tpMarkCustom(); tpRenderPressure(); });
  });

  $$('[data-tp-system]').forEach((button) => button.addEventListener("click", () => {
    tpSetSystem(button.dataset.tpSystem);
    tpMarkCustom();
    tpRenderPressure();
  }));

  $$('[data-pressure-tab]').forEach((button) => button.addEventListener("click", () => setPressureTab(button.dataset.pressureTab)));
  $("tpSaveSetup")?.addEventListener("click", tpSaveCurrentSetup);
  $("tpSaveSetupFromCalc")?.addEventListener("click", tpSaveCurrentSetup);
  $("tpAddHistory")?.addEventListener("click", tpAddHistory);
  $("tpClearHistory")?.addEventListener("click", () => {
    if (!window.confirm("Limpar todo o histórico de pressões?")) return;
    tpSetJson(TP_HISTORY_KEY, []);
    tpRenderHistory();
  });
  $("tpSetupList")?.addEventListener("click", (event) => {
    const load = event.target.closest("[data-load-setup]");
    const remove = event.target.closest("[data-delete-setup]");
    if (remove) tpDeleteSetup(remove.dataset.deleteSetup);
    else if (load) tpLoadSetup(load.dataset.loadSetup);
  });
  $("tpRecentSetupList")?.addEventListener("click", (event) => {
    const load = event.target.closest("[data-load-setup]");
    if (load) tpLoadSetup(load.dataset.loadSetup);
  });
  $("tpOpenSetups")?.addEventListener("click", () => setPressureTab("setups"));

  const activeId = localStorage.getItem(TP_ACTIVE_SETUP_KEY);
  const activeSetup = tpGetJson(TP_SETUPS_KEY).find((setup) => setup.id === activeId);
  tpApplyValues(activeSetup?.values || TP_DEFAULT_VALUES);
  tpRenderSetups();
  tpRenderHistory();
}

function init() {
  $$('[data-app-view]').forEach((button) => button.addEventListener("click", () => setAppView(button.dataset.appView)));
  $$('[data-forecast-context]').forEach((button) => button.addEventListener("click", () => setForecastContext(button.dataset.forecastContext)));
  $$('[data-forecast-mode]').forEach((button) => button.addEventListener("click", () => setForecastMode(button.dataset.forecastMode)));
  $$('[data-open-location]').forEach((button) => button.addEventListener("click", openLocationModal));
  $("closeLocation")?.addEventListener("click", closeLocationModal);
  $("locationModal")?.addEventListener("click", (event) => { if (event.target === $("locationModal")) closeLocationModal(); });
  $("locationSearch")?.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(() => searchLocations(query), 280);
  });
  $("refreshCurrent")?.addEventListener("click", refreshWeather);
  $("routeGpxInput")?.addEventListener("change", handleRouteFile);
  $("routeUploadLabel")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    $("routeGpxInput")?.click();
  });
  $("routeAnalyze")?.addEventListener("click", analyseRoute);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("locationModal").hidden) closeLocationModal(); });

  initPressure();
  initRouteDefaults();
  updateLocationLabels(selectedLocation);
  setAppView("current");
  setForecastContext("local");
  setForecastMode("48h");
  refreshWeather();
  setInterval(refreshWeather, REFRESH_MS);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

window.addEventListener("DOMContentLoaded", init);
