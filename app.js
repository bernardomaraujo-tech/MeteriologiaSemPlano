const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

const LOCATIONS = [
  { id: "alcabideche", name: "Alcabideche", lat: 38.7330, lon: -9.4100 },
  { id: "algueirao", name: "Algueirão", lat: 38.7936, lon: -9.3417 },
  { id: "amadora", name: "Amadora", lat: 38.7569, lon: -9.2308 },
  { id: "azeitao", name: "Azeitão", lat: 38.5180, lon: -9.0130 },
  { id: "cais_sodre", name: "Cais do Sodré", lat: 38.7069, lon: -9.1444 },
  { id: "carcavelos", name: "Carcavelos", lat: 38.6910, lon: -9.3317 },
  { id: "cascais", name: "Cascais", lat: 38.6979, lon: -9.4206 },
  { id: "columbeira", name: "Columbeira", lat: 39.2650, lon: -9.1800 },
  { id: "culatra", name: "Ilha da Culatra", lat: 36.9889, lon: -7.8336 },
  { id: "estoril", name: "Estoril", lat: 38.7057, lon: -9.3977 },
  { id: "guincho", name: "Guincho", lat: 38.72948, lon: -9.47457 },
  { id: "peninha", name: "Peninha", lat: 38.7692, lon: -9.4589 },
  { id: "praia_tocha", name: "Praia da Tocha", lat: 40.3300, lon: -8.7860 },
  { id: "sdr", name: "São Domingos de Rana", lat: 38.7019, lon: -9.3389 },
  { id: "sintra", name: "Sintra", lat: 38.8029, lon: -9.3817 },
  { id: "setubal", name: "Setúbal", lat: 38.5244, lon: -8.8882 },
  { id: "santacombadao", name: "Santa Comba Dão", lat: 40.3979, lon: -8.1304 }
];

const POIS = [
  { name: "Serra", label: "Serra (Sintra)", type: "serra", bank: "N", lat: 38.7760, lon: -9.3900 },
  { name: "Costa", label: "Costa (Marginal)", type: "costa", bank: "N", lat: 38.6920, lon: -9.3300 },
  { name: "Rio", label: "Rio (Tejo)", type: "rio", bank: "N", lat: 38.7070, lon: -9.1500 },
  { name: "Lisboa", label: "Lisboa", type: "cidade", bank: "N", lat: 38.7223, lon: -9.1393 },
  { name: "Cascais", label: "Cascais", type: "cidade", bank: "N", lat: 38.6979, lon: -9.4206 },

  { name: "Costa", label: "Costa (Caparica)", type: "costa", bank: "S", lat: 38.6440, lon: -9.2350 },
  { name: "Serra", label: "Serra (Arrábida)", type: "serra", bank: "S", lat: 38.4890, lon: -9.0280 },
  { name: "Rio", label: "Rio (Tejo)", type: "rio", bank: "S", lat: 38.6800, lon: -9.1600 },
  { name: "Almada", label: "Almada", type: "cidade", bank: "S", lat: 38.6790, lon: -9.1569 },
  { name: "Azeitão", label: "Azeitão", type: "cidade", bank: "S", lat: 38.5180, lon: -9.0130 },

  { name: "Costa", label: "Costa", type: "costa", bank: "X", lat: 40.1508, lon: -8.8618 },
  { name: "Cidade", label: "Centro urbano", type: "cidade", bank: "X", lat: 40.2033, lon: -8.4103 }
];

const $ = (id) => document.getElementById(id);

const els = {
  heroLoc: $("heroLoc"),
  heroTemp: $("heroTemp"),
  heroIcon: $("heroIcon"),
  heroMeta: $("heroMeta"),
  heroSun: $("heroSun"),
  updated: $("updated"),

  quickText: $("quickText"),
  quickWindow: $("quickWindow"),

  select: $("locationSelect"),
  source: $("source"),

  nowWind: $("nowWind"),
  nowGust: $("nowGust"),
  nowDirTxt: $("nowDirTxt"),
  nowRain: $("nowRain"),
  nowPop: $("nowPop"),
  dirNeedle: $("dirNeedle"),

  alertCard: $("alertCard"),
  alertHeadline: $("alertHeadline"),
  alertAdvice: $("alertAdvice"),
  alerts: $("alerts"),

  bestWindow: $("bestWindow"),
  bestChart: $("bestChart"),

  windSuggestion: $("windSuggestion"),

  dressBike: $("dressBike"),
  dressRun: $("dressRun"),
  dressWalk: $("dressWalk"),

  hourlyCards: $("hourlyCards"),
  table8: $("table8"),
  table48: $("table48"),

  toggle48: $("toggle48"),
  wrap48: $("wrap48"),

  windyCam: $("windyCam"),
  windyLink: $("windyLink")
};

function setText(el, value) {
  if (el) el.textContent = value;
}

function setHTML(el, value) {
  if (el) el.innerHTML = value;
}

function fmtKmh(value) {
  return `${Math.round(value ?? 0)} km/h`;
}

function fmtMm(value) {
  return `${(Math.round(((value ?? 0) * 10)) / 10).toFixed(1)} mm`;
}

function fmtPct(value) {
  return `${Math.round(value ?? 0)}%`;
}

function fmtDateTime(date = new Date()) {
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fmtHour(iso) {
  return String(iso).slice(11, 16);
}

function fmtTimeFromISO(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function weekdayHourLabel(iso) {
  if (!iso) return "—";
  const date = new Date(iso);

  let weekday = date.toLocaleDateString("pt-PT", { weekday: "short" });
  weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

  const hour = date.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${weekday} ${hour}`;
}

function windDirShort(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45)) % 8;
  return dirs[idx];
}

function windDirText(deg) {
  return `${windDirShort(deg)} (${Math.round(deg ?? 0)}°)`;
}

function iconForWeatherCode(code, isDay) {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";

  if (code === 45 || code === 48) return "🌫️";

  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";

  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([95, 96, 99].includes(code)) return "⛈️";

  return isDay ? "🌤️" : "🌙";
}

function buildUrlForecast(loc, modelsCsv) {
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

  if (modelsCsv) {
    params.set("models", modelsCsv);
  }

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: "no-store",
      mode: "cors",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWeather(loc) {
  const modelsCsv = PREFERRED_MODELS.join(",");

  try {
    const responsePreferred = await fetchWithTimeout(buildUrlForecast(loc, modelsCsv));

    if (responsePreferred.ok) {
      const json = await responsePreferred.json();

      if (json?.hourly?.time?.length) {
        return {
          json,
          source: "Open-Meteo (HARMONIE-AROME)"
        };
      }
    }
  } catch (_) {}

  const responseFallback = await fetchWithTimeout(buildUrlForecast(loc));

  if (!responseFallback.ok) {
    throw new Error(`HTTP ${responseFallback.status}`);
  }

  const json = await responseFallback.json();

  if (!json?.hourly?.time?.length) {
    throw new Error("Sem dados horários");
  }

  return {
    json,
    source: "Open-Meteo (Best match)"
  };
}

function nearestHourIndex(times) {
  const now = new Date();
  let bestIndex = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - now.getTime());

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function computeMinMaxNext24h(temps, startIndex) {
  const endIndex = Math.min(startIndex + 24, temps.length);
  let min = Infinity;
  let max = -Infinity;

  for (let i = startIndex; i < endIndex; i++) {
    const value = temps[i];

    if (value < min) min = value;
    if (value > max) max = value;
  }

  return { min, max };
}

function getSunTimes(data) {
  return {
    sunriseStr: fmtTimeFromISO(data?.daily?.sunrise?.[0]),
    sunsetStr: fmtTimeFromISO(data?.daily?.sunset?.[0])
  };
}

function computeBestWindowNext12h(data) {
  const times = data.hourly.time;
  const gust = data.hourly.wind_gusts_10m ?? [];
  const pop = data.hourly.precipitation_probability ?? Array(times.length).fill(0);
  const prcp = data.hourly.precipitation ?? Array(times.length).fill(0);

  const start = nearestHourIndex(times);
  const end = Math.min(start + 12, times.length - 2);

  const START_HOUR = 7;
  const LAST_START_HOUR = 20;

  let bestIndex = null;
  let bestScore = -1;

  function scoreHour(index) {
    const popN = Math.min(Math.max(pop[index] ?? 0, 0), 100) / 100;
    const gustN = Math.min(Math.max(gust[index] ?? 0, 0), 70) / 70;
    const prcpN = Math.min(Math.max(prcp[index] ?? 0, 0), 4) / 4;

    return (1 - (0.58 * popN + 0.42 * prcpN)) * 0.62 + (1 - gustN) * 0.38;
  }

  for (let i = start; i <= end; i++) {
    const hour = new Date(times[i]).getHours();

    if (hour < START_HOUR || hour > LAST_START_HOUR) {
      continue;
    }

    const score = (scoreHour(i) + scoreHour(i + 1)) / 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex === null) {
    bestIndex = start;
  }

  return {
    idx: bestIndex,
    score: bestScore
  };
}

function quickSummary({ wind, gust, pop, prcp }) {
  const rainy = (pop ?? 0) >= 45 || (prcp ?? 0) >= 0.8;
  const veryWindy = (gust ?? 0) >= 55 || (wind ?? 0) >= 32;
  const windy = (gust ?? 0) >= 42 || (wind ?? 0) >= 25;

  if (rainy && veryWindy) {
    return {
      title: "Evitar sair",
      desc: "chuva e vento forte."
    };
  }

  if (veryWindy) {
    return {
      title: "Sair com cuidado",
      desc: "rajadas fortes."
    };
  }

  if (windy) {
    return {
      title: "Bom para sair",
      desc: "mas atenção ao vento."
    };
  }

  if (rainy) {
    return {
      title: "Possível sair",
      desc: "mas há risco de chuva."
    };
  }

  return {
    title: "Bom para sair",
    desc: "condições favoráveis."
  };
}

function renderQuickSummary({ wind, gust, pop, prcp, bestStart, bestEnd }) {
  const summary = quickSummary({ wind, gust, pop, prcp });

  setHTML(
    els.quickText,
    `<strong>${summary.title}</strong>${summary.desc}`
  );

  setText(els.quickWindow, `${bestStart} – ${bestEnd}`);
}

function renderAlerts({ wind, gust, pop, prcp }) {
  const alertItems = [];

  if ((gust ?? 0) >= 45) {
    alertItems.push(`Rajadas fortes: até ${Math.round(gust)} km/h`);
  } else if ((gust ?? 0) >= 35) {
    alertItems.push(`Rajadas moderadas: até ${Math.round(gust)} km/h`);
  }

  if ((wind ?? 0) >= 25) {
    alertItems.push(`Vento sustentado: ${Math.round(wind)} km/h`);
  }

  if ((pop ?? 0) >= 70) {
    alertItems.push(`Elevada probabilidade de chuva: ${Math.round(pop)}%`);
  } else if ((pop ?? 0) >= 40) {
    alertItems.push(`Possibilidade de chuva: ${Math.round(pop)}%`);
  }

  if ((prcp ?? 0) >= 2) {
    alertItems.push(`Chuva moderada: ${fmtMm(prcp)}`);
  }

  if (!alertItems.length) {
    els.alertCard?.classList.add("is-ok");

    setText(els.alertHeadline, "Sem alertas relevantes");
    setText(els.alertAdvice, "Condições estáveis para outdoor.");
    setHTML(els.alerts, "");
    return;
  }

  els.alertCard?.classList.remove("is-ok");

  const main = alertItems[0];

  if (main.toLowerCase().includes("rajadas")) {
    setHTML(els.alertHeadline, `Rajadas fortes:<br><strong>até ${Math.round(gust)} km/h</strong>`);
    setText(els.alertAdvice, "Evita zonas expostas, descidas rápidas e regressos contra vento.");
  } else if (main.toLowerCase().includes("vento")) {
    setHTML(els.alertHeadline, `Vento forte:<br><strong>${Math.round(wind)} km/h</strong>`);
    setText(els.alertAdvice, "Planeia o sentido da volta e evita zonas muito expostas.");
  } else {
    setHTML(els.alertHeadline, `Atenção:<br><strong>${main}</strong>`);
    setText(els.alertAdvice, "Leva proteção adequada e confirma a evolução antes de sair.");
  }

  setHTML(
    els.alerts,
    alertItems.map(item => `<span class="alert-tag">${item}</span>`).join("")
  );
}

function renderHourly(data) {
  if (!els.hourlyCards) return;

  const times = data.hourly.time;
  const start = nearestHourIndex(times);
  const rows = [];

  for (let i = start; i < Math.min(start + 8, times.length); i++) {
    const temp = data.hourly.temperature_2m?.[i] ?? 0;
    const pop = data.hourly.precipitation_probability?.[i] ?? 0;
    const wind = data.hourly.wind_speed_10m?.[i] ?? 0;
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <div class="hour-card">
        <div class="hour-time">${fmtHour(times[i])}</div>
        <div class="hour-icon">${iconForWeatherCode(code, isDay)}</div>
        <div class="hour-temp">${Math.round(temp)}°</div>
        <div class="hour-extra">
          <span>${fmtPct(pop)}</span>
          <span>${fmtKmh(wind)}</span>
        </div>
      </div>
    `);
  }

  setHTML(els.hourlyCards, rows.join(""));
}

function render48h(data) {
  if (!els.table48) return;

  const times = data.hourly.time;
  const start = nearestHourIndex(times);
  const rows = [];

  for (let i = start; i < Math.min(start + 48, times.length); i++) {
    const temp = data.hourly.temperature_2m?.[i] ?? 0;
    const pop = data.hourly.precipitation_probability?.[i] ?? 0;
    const prcp = data.hourly.precipitation?.[i] ?? 0;
    const wind = data.hourly.wind_speed_10m?.[i] ?? 0;
    const gust = data.hourly.wind_gusts_10m?.[i] ?? 0;
    const dir = data.hourly.wind_direction_10m?.[i] ?? 0;
    const code = data.hourly.weather_code?.[i] ?? 0;
    const isDay = (data.hourly.is_day?.[i] ?? 1) === 1;

    rows.push(`
      <tr>
        <td>${weekdayHourLabel(times[i])}</td>
        <td>${iconForWeatherCode(code, isDay)}</td>
        <td>${Math.round(temp)}°</td>
        <td>${fmtPct(pop)}</td>
        <td>${fmtMm(prcp)}</td>
        <td>${fmtKmh(wind)}</td>
        <td>${fmtKmh(gust)}</td>
        <td>${windDirShort(dir)}</td>
      </tr>
    `);
  }

  setHTML(
    els.table48,
    `
      <thead>
        <tr>
          <th>Dia/Hora</th>
          <th></th>
          <th>Temp.</th>
          <th>Prob.</th>
          <th>Chuva</th>
          <th>Vento</th>
          <th>Rajadas</th>
          <th>Dir.</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    `
  );
}

function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }) {
  const rainy = (pop ?? 0) >= 25 || (prcp ?? 0) >= 0.2;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let base = "";

  if (temp <= 6) base = "Muito frio";
  else if (temp <= 11) base = "Frio";
  else if (temp <= 16) base = "Fresco";
  else if (temp <= 22) base = "Agradável";
  else base = "Quente";

  const rainAddon = rainy ? " Leva impermeável." : "";
  const windAddon = windy ? " Protege do vento." : "";

  if (sport === "bike") {
    if (temp <= 6) return `${base}: base layer quente, manga comprida, colete, gola, luvas grossas e calças.${windAddon}${rainAddon}`;
    if (temp <= 11) return `${base}: manga comprida, colete, gola e luvas leves.${windAddon}${rainAddon}`;
    if (temp <= 16) return `${base}: manga comprida leve e calção. Começa protegido e ajusta ao longo da volta.${windAddon}${rainAddon}`;
    if (temp <= 22) return `${base}: manga curta e colete opcional.${windAddon}${rainAddon}`;
    return `${base}: equipamento leve, proteção solar e hidratação.${rainAddon}`;
  }

  if (sport === "run") {
    if (temp <= 6) return `${base}: camada térmica e corta-vento leve.${windAddon}${rainAddon}`;
    if (temp <= 11) return `${base}: manga comprida leve.${windAddon}${rainAddon}`;
    if (temp <= 16) return `${base}: T-shirt e calções. Ritmo confortável.${windAddon}${rainAddon}`;
    if (temp <= 22) return `${base}: roupa leve e respirável.${windAddon}${rainAddon}`;
    return `${base}: muito leve, hidratação e evitar horas de maior calor.${rainAddon}`;
  }

  if (temp <= 6) return `${base}: camadas quentes e casaco.${windAddon}${rainAddon}`;
  if (temp <= 11) return `${base}: manga comprida e calças.${windAddon}${rainAddon}`;
  if (temp <= 16) return `${base}: camada leve. Ideal para ganhar altitude.${windAddon}${rainAddon}`;
  if (temp <= 22) return `${base}: T-shirt confortável.${windAddon}${rainAddon}`;
  return `${base}: roupa leve e respirável.${rainAddon}`;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const la1 = toRad(lat1);
  const la2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function dirBucket(deg) {
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

function inferBank(loc) {
  if ((loc?.lat ?? 0) < 38.67) return "S";
  return "N";
}

function pickPOIForBearing(userLat, userLon, targetBearing, pois, bank) {
  const MAX_KM = 22;
  const MAX_DEG = 55;

  let best = null;
  let bestScore = Infinity;

  for (const poi of pois) {
    if (bank && poi.bank !== "X" && poi.bank !== bank) {
      continue;
    }

    const km = haversineKm(userLat, userLon, poi.lat, poi.lon);

    if (km > MAX_KM) {
      continue;
    }

    const bearing = bearingBetween(userLat, userLon, poi.lat, poi.lon);
    const angle = angleDiff(bearing, targetBearing);
    const score = angle + km * 0.55;

    if (score < bestScore) {
      bestScore = score;
      best = {
        ...poi,
        km,
        bearing,
        angle
      };
    }
  }

  if (!best || best.angle > MAX_DEG) {
    return null;
  }

  return best;
}

function poiLabel(poi) {
  if (!poi) return null;
  return poi.label || poi.name;
}

function windDirectionSuggestionSmart(windDir, loc) {
  const fromText = windDirText(windDir);

  const headBearing = windDir;
  const tailBearing = (windDir + 180) % 360;

  const bank = inferBank(loc);

  const goPOI = pickPOIForBearing(loc.lat, loc.lon, headBearing, POIS, bank);
  const backPOI = pickPOIForBearing(loc.lat, loc.lon, tailBearing, POIS, bank);

  const goLabel = poiLabel(goPOI);
  const backLabel = poiLabel(backPOI);

  if (goLabel && backLabel && goLabel !== backLabel) {
    return `<strong>Vento de ${fromText}.</strong> Arranca contra o vento na direção de ${goLabel} e guarda o regresso com vento de costas pela ${backLabel}.`;
  }

  const goDir = dirBucket(headBearing);
  const backDir = dirBucket(tailBearing);

  return `<strong>Vento de ${fromText}.</strong> Arranca contra o vento para ${goDir} e regressa para ${backDir} com vento de costas.`;
}

function updateWindyCam(loc) {
  if (els.windyLink) {
    els.windyLink.href = `https://www.windy.com/?${loc.lat},${loc.lon},11`;
  }

  if (els.windyCam) {
    els.windyCam.setAttribute(
      "data-params",
      JSON.stringify({
        lat: loc.lat,
        lon: loc.lon,
        radius: 15,
        limit: 1
      })
    );
  }
}

function renderAll(data, sourceName, loc) {
  const times = data.hourly.time;
  const index = nearestHourIndex(times);

  const temp = data.hourly.temperature_2m?.[index] ?? 0;
  const feels = data.hourly.apparent_temperature?.[index] ?? temp;
  const wind = data.hourly.wind_speed_10m?.[index] ?? 0;
  const gust = data.hourly.wind_gusts_10m?.[index] ?? 0;
  const dir = data.hourly.wind_direction_10m?.[index] ?? 0;
  const prcp = data.hourly.precipitation?.[index] ?? 0;
  const pop = data.hourly.precipitation_probability?.[index] ?? 0;
  const code = data.hourly.weather_code?.[index] ?? 0;
  const isDay = (data.hourly.is_day?.[index] ?? 1) === 1;

  const { min, max } = computeMinMaxNext24h(data.hourly.temperature_2m, index);
  const { sunriseStr, sunsetStr } = getSunTimes(data);

  setText(els.heroLoc, loc.name);
  setText(els.heroTemp, `${Math.round(temp)}°`);
  setText(els.heroIcon, iconForWeatherCode(code, isDay));
  setText(
    els.heroMeta,
    `Sensação: ${Math.round(feels)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`
  );
  setText(els.heroSun, `Nascer: ${sunriseStr} · Pôr: ${sunsetStr}`);

  setText(els.nowWind, fmtKmh(wind));
  setText(els.nowGust, fmtKmh(gust));
  setText(els.nowDirTxt, windDirText(dir));
  setText(els.nowRain, fmtMm(prcp));
  setText(els.nowPop, fmtPct(pop));

  if (els.nowGust) {
    els.nowGust.classList.toggle("danger", gust >= 45);
  }

  if (els.dirNeedle) {
    els.dirNeedle.style.transform = `translate(-50%, -50%) rotate(${dir}deg)`;
  }

  const best = computeBestWindowNext12h(data);
  const bestStart = fmtHour(times[best.idx]);
  const bestEnd = fmtHour(times[best.idx + 2] ?? times[best.idx + 1]);

  renderQuickSummary({
    wind,
    gust,
    pop,
    prcp,
    bestStart,
    bestEnd
  });

  setText(
    els.bestWindow,
    `${weekdayHourLabel(times[best.idx])} → ${weekdayHourLabel(times[best.idx + 2] ?? times[best.idx + 1])}\nMenos chuva + menos rajadas.`
  );

  renderAlerts({ wind, gust, pop, prcp });

  setHTML(els.windSuggestion, windDirectionSuggestionSmart(dir, loc));

  setText(
    els.dressBike,
    clothingSuggestion({ temp: feels, wind, gust, pop, prcp, sport: "bike" })
  );

  setText(
    els.dressRun,
    clothingSuggestion({ temp: feels, wind, gust, pop, prcp, sport: "run" })
  );

  setText(
    els.dressWalk,
    clothingSuggestion({ temp: feels, wind, gust, pop, prcp, sport: "walk" })
  );

  renderHourly(data);
  render48h(data);

  setText(els.source, sourceName);

  updateWindyCam(loc);
}

async function refresh() {
  const selectedLocId = els.select?.value || "alcabideche";
  const loc = LOCATIONS.find(item => item.id === selectedLocId) || LOCATIONS[0];

  setText(els.updated, "A atualizar…");
  setText(els.source, "—");

  try {
    const { json, source } = await fetchWeather(loc);

    setText(els.updated, `Última atualização: ${fmtDateTime(new Date())}`);
    renderAll(json, source, loc);
  } catch (error) {
    const message = String(error?.message ?? error);

    setText(
      els.updated,
      `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${message}`
    );

    setText(els.source, "Se persistir, recarrega a página ou limpa os dados do site.");

    console.error("[SEM PLANO] refresh failed:", error);
  }
}

function init() {
  if (!els.select) return;

  els.select.innerHTML = LOCATIONS
    .map(loc => `<option value="${loc.id}">${loc.name}</option>`)
    .join("");

  els.select.value = "alcabideche";

  els.select.addEventListener("change", refresh);

  if (els.toggle48 && els.wrap48) {
    els.toggle48.addEventListener("click", () => {
      const isHidden = els.wrap48.classList.toggle("hidden");

      els.toggle48.setAttribute("aria-expanded", String(!isHidden));
      els.toggle48.querySelector("span:last-child").textContent = isHidden
        ? "Próximas 48h"
        : "Ocultar 48h";
    });
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

window.addEventListener("DOMContentLoaded", init);
