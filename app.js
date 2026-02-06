// Localizações + câmaras (uma por localidade)
const LOCATIONS = [
  { id: "alcabideche", name: "Alcabideche", lat: 38.7330, lon: -9.4100, camUrl: null },

  // Guincho — tenta embed; se bloquear, abre link
  { id: "guincho", name: "Guincho", lat: 38.732733, lon: -9.472520,
    camUrl: "https://beachcam.meo.pt/livecams/praia-do-guincho/" },

  // Cascais — Praia da Ribeira (boa hipótese para embed)
  { id: "cascais", name: "Cascais (Ribeira)", lat: 38.6979, lon: -9.4206,
    camUrl: "https://balticlivecam.com/cameras/portugal/cascais/praia-da-ribeira/" },

  { id: "peninha", name: "Peninha", lat: 38.769232, lon: -9.458909, camUrl: null },
  { id: "culatra", name: "Ilha da Culatra", lat: 36.988889, lon: -7.833611, camUrl: null },
];

const REFRESH_MS = 60 * 60 * 1000; // 1h

const els = {
  updated: document.getElementById("updated"),
  select: document.getElementById("locationSelect"),
  source: document.getElementById("source"),

  nowTemp: document.getElementById("nowTemp"),
  nowFeels: document.getElementById("nowFeels"),
  nowWind: document.getElementById("nowWind"),
  nowGust: document.getElementById("nowGust"),
  nowDirTxt: document.getElementById("nowDirTxt"),
  nowArrow: document.getElementById("nowArrow"),
  nowRain: document.getElementById("nowRain"),
  nowPop: document.getElementById("nowPop"),

  bestWindow: document.getElementById("bestWindow"),
  windSuggestion: document.getElementById("windSuggestion"),
  alerts: document.getElementById("alerts"),

  table8: document.getElementById("table8"),
  table48: document.getElementById("table48"),
  toggle48: document.getElementById("toggle48"),
  wrap48: document.getElementById("wrap48"),
};

const cam = {
  wrap: document.getElementById("camEmbedWrap"),
  frame: document.getElementById("camFrame"),
  status: document.getElementById("camStatus"),
  open: document.getElementById("camOpen"),
  retry: document.getElementById("camRetry"),
};

function fmtKmh(x){ return `${Math.round(x)} km/h`; }
function fmtMm(x){ return `${(Math.round(x * 10) / 10).toFixed(1)} mm`; }
function fmtPct(x){ return `${Math.round(x)}%`; }

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

function rotateArrow(deg){
  // a seta desenhada aponta "para NE" (45°)
  const rot = (deg - 45);
  els.nowArrow.style.transform = `rotate(${rot}deg)`;
}

function hourLabel(iso){ return iso.slice(11,16); }      // "10:00"
function dayHourLabel(iso){
  const d = iso.slice(8,10);
  const m = iso.slice(5,7);
  const h = iso.slice(11,16);
  return `${d}/${m} ${h}`;
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
      "precipitation_probability"
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

function computeBestWindow(data){
  const times = data.hourly.time;
  const gust  = data.hourly.wind_gusts_10m;
  const pop   = data.hourly.precipitation_probability ?? Array(times.length).fill(0);
  const prcp  = data.hourly.precipitation ?? Array(times.length).fill(0);

  const start = nearestHourIndex(times);
  const end = Math.min(start + 24, times.length - 2);

  let bestI = start;
  let bestScore = -1;

  for (let i=start; i<=end; i++){
    const scoreHour = (j) => {
      const popN = Math.min(Math.max(pop[j] ?? 0, 0), 100) / 100;
      const gustN = Math.min(Math.max(gust[j] ?? 0, 0), 60) / 60;
      const prcpN = Math.min(Math.max(prcp[j] ?? 0, 0), 3) / 3;
      return (1 - (0.65*popN + 0.35*prcpN)) * 0.65 + (1 - gustN) * 0.35;
    };

    const s = (scoreHour(i) + scoreHour(i+1)) / 2;
    if (s > bestScore){ bestScore = s; bestI = i; }
  }

  return { idx: bestI, score: bestScore };
}

function windDirectionSuggestion(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;

  let tip = "";
  if (d >= 315 || d < 45) tip = "Vento de norte: costuma favorecer segmentos para sul.";
  else if (d >= 45 && d < 135) tip = "Vento de leste: costuma favorecer ir para oeste.";
  else if (d >= 135 && d < 225) tip = "Vento de sul: costuma favorecer segmentos para norte.";
  else tip = "Vento de oeste: costuma favorecer ir para leste.";

  return `De ${from}. ${tip}`;
}

function renderTables(data){
  const t = data.hourly.time;
  const temp = data.hourly.temperature_2m;
  const wind = data.hourly.wind_speed_10m;
  const gust = data.hourly.wind_gusts_10m;
  const dir  = data.hourly.wind_direction_10m;
  const prcp = data.hourly.precipitation;
  const pop  = data.hourly.precipitation_probability ?? Array(t.length).fill(null);

  const start = nearestHourIndex(t);

  const make = (n, tableEl, labelFn) => {
    const rows = [];
    rows.push(`<tr>
      <th>Hora</th><th>Temp</th><th>Vento</th><th>Raj.</th><th>Dir</th><th>Chuva</th><th>Prob.</th>
    </tr>`);

    for (let i=start; i<Math.min(start+n, t.length); i++){
      rows.push(`<tr>
        <td>${labelFn(t[i])}</td>
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

  make(8, els.table8, (iso) => hourLabel(iso));
  make(48, els.table48, (iso) => dayHourLabel(iso));
}

function renderNowAndInsights(data, sourceName){
  const t = data.hourly.time;
  const i = nearestHourIndex(t);

  const temp = data.hourly.temperature_2m[i];
  const feels = data.hourly.apparent_temperature?.[i];
  const wind = data.hourly.wind_speed_10m[i];
  const gust = data.hourly.wind_gusts_10m[i];
  const dir  = data.hourly.wind_direction_10m[i];
  const prcp = data.hourly.precipitation?.[i] ?? 0;
  const pop  = data.hourly.precipitation_probability?.[i];

  els.nowTemp.textContent = `${Math.round(temp)}°`;
  els.nowFeels.textContent = (feels == null) ? "" : `Sensação ${Math.round(feels)}°`;
  els.nowWind.textContent = fmtKmh(wind);
  els.nowGust.textContent = fmtKmh(gust);
  els.nowDirTxt.textContent = windDirText(dir);
  rotateArrow(dir);
  els.nowRain.textContent = fmtMm(prcp);
  els.nowPop.textContent = (pop == null) ? "—" : fmtPct(pop);

  const bw = computeBestWindow(data);
  const startIso = t[bw.idx];
  const endIso = t[bw.idx + 2] ?? t[bw.idx + 1];
  els.bestWindow.textContent = `${dayHourLabel(startIso)} → ${dayHourLabel(endIso)}`;

  els.windSuggestion.textContent = windDirectionSuggestion(dir);

  const start = nearestHourIndex(t);
  const next2 = [start, start+1].filter(x => x < t.length);

  const pops = data.hourly.precipitation_probability ?? Array(t.length).fill(0);
  const prcps = data.hourly.precipitation ?? Array(t.length).fill(0);
  const gusts = data.hourly.wind_gusts_10m ?? Array(t.length).fill(0);

  const anyRainSoon = next2.some(k => (pops[k] ?? 0) >= 60 || (prcps[k] ?? 0) >= 0.4);
  const anyGustSoon = next2.some(k => (gusts[k] ?? 0) >= 45);

  const pills = [];
  if (anyRainSoon) pills.push(`<div class="pill">☔ Chuva provável nas próximas 2h</div>`);
  if (anyGustSoon) pills.push(`<div class="pill">🌬️ Rajadas fortes nas próximas 2h</div>`);
  if (!pills.length) pills.push(`<div class="pill">✅ Sem alertas relevantes nas próximas 2h</div>`);
  els.alerts.innerHTML = pills.join("");

  els.source.textContent = sourceName;
}

function setupCamera(loc) {
  cam.frame.src = "about:blank";
  cam.wrap.classList.add("hidden");
  cam.open.style.display = "none";
  cam.retry.style.display = "none";

  if (!loc.camUrl) {
    cam.status.textContent = "Sem câmara para esta localidade.";
    return;
  }

  cam.open.href = loc.camUrl;
  cam.open.style.display = "inline-block";
  cam.retry.style.display = "inline-block";

  const tryEmbed = () => {
    cam.status.textContent = "A tentar embutir…";
    cam.wrap.classList.remove("hidden");

    let loaded = false;

    const onLoad = () => {
      loaded = true;
      cam.status.textContent = "Embutido (se estiver em branco, abre no botão).";
      cam.frame.removeEventListener("load", onLoad);
    };

    cam.frame.addEventListener("load", onLoad);
    cam.frame.src = loc.camUrl;

    setTimeout(() => {
      if (!loaded) {
        cam.wrap.classList.add("hidden");
        cam.status.textContent = "Esta câmara parece bloquear embed. Usa “Abrir câmara”.";
        cam.frame.removeEventListener("load", onLoad);
      }
    }, 8000);
  };

  cam.retry.onclick = tryEmbed;
  tryEmbed();
}

async function refresh(){
  const locId = els.select.value;
  const loc = LOCATIONS.find(x => x.id === locId) ?? LOCATIONS[0];

  setupCamera(loc);
  els.updated.textContent = "A atualizar…";

  try{
    const { json, source } = await fetchWithFallback(loc);
    const now = new Date();
    els.updated.textContent = `Atualizado: ${now.toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`;

    renderNowAndInsights(json, source);
    renderTables(json);
  } catch (e){
    els.updated.textContent = "Erro a obter dados.";
    els.source.textContent = String(e);
  }
}

function init(){
  for (const l of LOCATIONS){
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    els.select.appendChild(opt);
  }
  els.select.value = "alcabideche";

  els.select.addEventListener("change", refresh);

  els.toggle48.addEventListener("click", () => {
    const isHidden = els.wrap48.classList.contains("hidden");
    els.wrap48.classList.toggle("hidden", !isHidden);
    els.toggle48.textContent = isHidden ? "Esconder" : "Mostrar";
  });

  if ("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
