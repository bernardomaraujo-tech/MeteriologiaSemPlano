const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const GEO_TIMEOUT_MS = 10000;
const FORECAST_HOURS = 48;
const OSM_TILE_SIZE = 256;
const OSM_ZOOM = 12;
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

function buildWeatherUrl(location) {
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

async function fetchWeather(location) {
  const response = await fetchWithTimeout(buildWeatherUrl(location));
  if (!response.ok) throw new Error(`serviço meteorológico indisponível (${response.status})`);
  const data = await response.json();
  if (!data?.hourly?.time?.length) throw new Error("sem dados horários disponíveis");
  return { data, source: "Open-Meteo · melhor modelo disponível" };
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
    uv: finite(data.hourly.uv_index?.[index])
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
  const direction = windDirection(stats.direction);
  const headline = stats.precipitation >= 3 || stats.maxProbability >= 60
    ? "Chuva provável em alguns períodos"
    : stats.precipitation >= .5 || stats.maxProbability >= 35
      ? "Possibilidade de chuva pontual"
      : "Sem chuva relevante";

  setText("forecastHeadline", headline);
  setText("forecastSubline", `Vento dominante ${direction.from} · rajadas até ${Math.round(stats.maxGust)} km/h`);
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
        <td class="direction-cell"><span class="table-arrow" style="transform:rotate(${direction.degrees}deg)">↓</span>${direction.from}<small>→ ${direction.to}</small></td>
        <td class="number-cell"><strong>${Math.round(values.wind)}</strong><small>km/h</small></td>
        <td class="number-cell gust-cell"><strong>${Math.round(values.gust)}</strong><small>km/h</small></td>
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

function tpRenderSetups() {
  const setups = tpGetJson(TP_SETUPS_KEY).filter((setup) => setup?.id && setup?.values);
  const activeId = localStorage.getItem(TP_ACTIVE_SETUP_KEY);
  $("tpEmptySetups").hidden = setups.length > 0;
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
  const setup = { id: `setup-${Date.now()}`, name: name.trim(), createdAt: new Date().toISOString(), values };
  const setups = tpGetJson(TP_SETUPS_KEY);
  setups.push(setup);
  tpSetJson(TP_SETUPS_KEY, setups);
  localStorage.setItem(TP_ACTIVE_SETUP_KEY, setup.id);
  tpRenderSetups();
  showToast(`Setup “${setup.name}” guardado.`);
}

function tpLoadSetup(id) {
  const setup = tpGetJson(TP_SETUPS_KEY).find((item) => item.id === id);
  if (!setup) return;
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

  const activeId = localStorage.getItem(TP_ACTIVE_SETUP_KEY);
  const activeSetup = tpGetJson(TP_SETUPS_KEY).find((setup) => setup.id === activeId);
  tpApplyValues(activeSetup?.values || TP_DEFAULT_VALUES);
  tpRenderSetups();
  tpRenderHistory();
}

function init() {
  $$('[data-app-view]').forEach((button) => button.addEventListener("click", () => setAppView(button.dataset.appView)));
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
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("locationModal").hidden) closeLocationModal(); });

  initPressure();
  updateLocationLabels(selectedLocation);
  setAppView("current");
  setForecastMode("48h");
  refreshWeather();
  setInterval(refreshWeather, REFRESH_MS);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
}

window.addEventListener("DOMContentLoaded", init);
