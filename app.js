const REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;

// Preferência: modelos HARMONIE-AROME (Europa) via Open-Meteo
const PREFERRED_MODELS = [
  "knmi_harmonie_arome_europe",
  "dmi_harmonie_arome_europe"
];

// Duração assumida para a sugestão de sentido (só afeta a caixa "Sugestão de sentido")
const DEFAULT_RIDE_HOURS = 3; // bicicleta ~3h (podes ajustar para 2..4)
const SENSE_MIN_CONFIDENCE = 0.12; // abaixo disto diz "indiferente"

// Localizações (mantém como tinhas; se quiseres, depois ordenamos sem mexer em mais nada)
const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 },

  { id:"sdr", name:"São Domingos de Rana", lat:38.7019, lon:-9.3389 },
  { id:"carcavelos", name:"Carcavelos", lat:38.6910, lon:-9.3317 },
  { id:"estoril", name:"Estoril", lat:38.7057, lon:-9.39773 },
  { id:"columbeira", name:"Columbeira", lat:39.2629, lon:-9.1888 },
  { id:"praiatocha", name:"Praia da Tocha", lat:40.3334, lon:-8.8415 }
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
function dirShort(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((((deg ?? 0) % 360) / 45)) % 8;
  return dirs[idx];
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

/* =========================
   SUGESTÃO DE SENTIDO (NOVO)
   Só isto afeta a caixa windSuggestion
   ========================= */

function degToRad(d){ return (d * Math.PI) / 180; }
function clamp(x,a,b){ return Math.min(Math.max(x,a),b); }

/**
 * Converte vento "FROM" (graus) em vetor "TO" (para onde sopra),
 * usando bearing meteorológico: 0=N, 90=E.
 */
function windVecTo(speedKmh, windFromDeg){
  const toDeg = ((windFromDeg ?? 0) + 180) % 360;
  const r = degToRad(toDeg);
  // x=Este, y=Norte
  return { x: (speedKmh ?? 0) * Math.sin(r), y: (speedKmh ?? 0) * Math.cos(r), toDeg };
}

/** unit vector do movimento (bearing) */
function moveUnit(headingDeg){
  const r = degToRad(((headingDeg ?? 0) % 360 + 360) % 360);
  return { x: Math.sin(r), y: Math.cos(r) };
}

/**
 * Componentes do vento relativo ao movimento:
 * headKmh: positivo = vento contra; negativo = vento a favor
 * crossKmh: magnitude do vento lateral
 */
function windComponents(speedKmh, windFromDeg, headingDeg){
  const w = windVecTo(speedKmh, windFromDeg);
  const m = moveUnit(headingDeg);

  const dot = w.x*m.x + w.y*m.y;              // >0 = vento a favor (mesma direção do movimento)
  const head = -dot;                          // >0 = contra
  const cross = Math.abs(w.x*m.y - w.y*m.x);  // perpendicular
  return { headKmh: head, crossKmh: cross, windToDeg: w.toDeg };
}

function avg(arr){
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}

/**
 * Score "dificuldade" por hora (0..~1.5)
 * (vento conta bastante; rajadas e chuva entram como risco)
 */
function hourDifficulty({ wind, gust, windFromDeg, prcp, pop, headingDeg }){
  const comp = windComponents(wind, windFromDeg, headingDeg);
  const head = clamp(Math.max(0, comp.headKmh) / 40, 0, 1.5);   // contra
  const cross = clamp(comp.crossKmh / 40, 0, 1.5);              // lateral
  const gustN = clamp((gust ?? 0) / 70, 0, 1.5);
  const rainN = clamp(((prcp ?? 0) / 3) + ((pop ?? 0) / 100)*0.6, 0, 1.5);

  // pesos pensados para ciclismo (vento manda)
  return 0.52*head + 0.20*cross + 0.18*gustN + 0.10*rainN;
}

/**
 * Gera sugestão “pior no início / melhor no fim” para uma volta ~N horas.
 * Compara:
 *  - StartInto: 1ª metade heading = windFrom(start); 2ª metade = +180
 *  - StartWith: 1ª metade heading = windFrom(start)+180; 2ª metade = +180
 */
function buildSenseSuggestion(data, startIdx, rideHours){
  const t = data.hourly.time;
  const wind = data.hourly.wind_speed_10m ?? [];
  const gust = data.hourly.wind_gusts_10m ?? [];
  const wdir = data.hourly.wind_direction_10m ?? []; // "from"
  const prcp = data.hourly.precipitation ?? [];
  const pop  = data.hourly.precipitation_probability ?? Array(t.length).fill(0);

  const hours = Math.max(1, Math.min(6, Math.round(rideHours ?? DEFAULT_RIDE_HOURS)));
  const half = Math.max(1, Math.floor(hours / 2));
  const total = half * 2; // força 2 metades iguais (2h, 4h, 6h). Se hours=3 -> 2h (1+1) para consistência.

  const maxIdx = t.length - 1;
  const safeIdx = (k) => Math.min(Math.max(k, 0), maxIdx);

  const baseFrom = (wdir[safeIdx(startIdx)] ?? 0);
  const intoHeading = baseFrom;                // ir "para onde o vento vem" => contra
  const withHeading = (baseFrom + 180) % 360;  // a favor

  const evalOption = (firstHeadingDeg) => {
    const secondHeadingDeg = (firstHeadingDeg + 180) % 360;
    const firstScores = [];
    const secondScores = [];

    const firstHead = [];
    const secondHead = [];
    const firstCross = [];
    const secondCross = [];

    for (let h=0; h<total; h++){
      const idx = safeIdx(startIdx + h);

      const heading = (h < half) ? firstHeadingDeg : secondHeadingDeg;

      const dif = hourDifficulty({
        wind: wind[idx], gust: gust[idx],
        windFromDeg: wdir[idx],
        prcp: prcp[idx], pop: pop[idx],
        headingDeg: heading
      });

      const comp = windComponents(wind[idx], wdir[idx], heading);

      if (h < half){
        firstScores.push(dif);
        firstHead.push(comp.headKmh);
        firstCross.push(comp.crossKmh);
      } else {
        secondScores.push(dif);
        secondHead.push(comp.headKmh);
        secondCross.push(comp.crossKmh);
      }
    }

    const firstAvg = avg(firstScores);
    const secondAvg = avg(secondScores);

    return {
      firstHeadingDeg: firstHeadingDeg,
      secondHeadingDeg: (firstHeadingDeg + 180) % 360,
      firstAvg,
      secondAvg,
      delta: firstAvg - secondAvg, // >0 = pior no início (bom para a tua preferência)
      firstHeadAvg: avg(firstHead),
      secondHeadAvg: avg(secondHead),
      firstCrossAvg: avg(firstCross),
      secondCrossAvg: avg(secondCross)
    };
  };

  const optInto = evalOption(intoHeading);
  const optWith = evalOption(withHeading);

  // Escolhe o que dá "pior no início / melhor no fim"
  const best = (optInto.delta >= optWith.delta) ? optInto : optWith;

  // Confiança simples
  const conf = Math.abs(best.delta);
  const confTxt = conf >= 0.30 ? "Alta" : conf >= 0.18 ? "Média" : conf >= SENSE_MIN_CONFIDENCE ? "Baixa" : "Indiferente";

  const firstDir = dirShort(best.firstHeadingDeg);
  const secondDir = dirShort(best.secondHeadingDeg);

  // resumo vento contra/a favor médio (positivo=contra, negativo=a favor)
  const head1 = Math.round(best.firstHeadAvg);
  const head2 = Math.round(best.secondHeadAvg);

  const crossWarn = (best.firstCrossAvg >= 22 || best.secondCrossAvg >= 22) ? " Atenção a vento lateral." : "";

  if (confTxt === "Indiferente"){
    return `Sugestão de sentido: indiferente (mudança de vento pequena nas próximas ~${total}h). Mantém o plano do percurso.${crossWarn}`;
  }

  const phrHead = (x) => {
    if (x > 3) return `~${x} km/h contra`;
    if (x < -3) return `~${Math.abs(x)} km/h a favor`;
    return `~0 (neutro)`;
  };

  return [
    `Para uma volta ~${total}h: começa a apontar para ${firstDir} e volta para ${secondDir}.`,
    `Objetivo: pior no início, melhor no fim.`,
    `Vento (médio): 1ª metade ${phrHead(head1)} · 2ª metade ${phrHead(head2)}.`,
    `Confiança: ${confTxt}.${crossWarn}`
  ].join(" ");
}

/* =========================
   FIM SUGESTÃO DE SENTIDO
   ========================= */

function windDirectionSuggestionFallback(deg){
  const from = windDirText(deg);
  const d = ((deg % 360) + 360) % 360;
  if (d >= 315 || d < 45) return `De ${from}. Favorece ir para sul; regresso para norte é mais pesado.`;
  if (d >= 45 && d < 135) return `De ${from}. Favorece ir para oeste; regresso para leste é mais pesado.`;
  if (d >= 135 && d < 225) return `De ${from}. Favorece ir para norte; regresso para sul é mais pesado.`;
  return `De ${from}. Favorece ir para leste; regresso para oeste é mais pesado.`;
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
    // a tua agulha aponta "para dentro" e queres direção do vento (FROM).
    // Se a tua forma/triângulo estiver orientada para "cima", isto fica certo.
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

  // ✅ Só aqui é que alterámos o conteúdo da caixa "Sugestão de sentido"
  // Usa o modelo novo; se falhar por algum motivo, cai no fallback antigo.
  let senseTxt = "";
  try{
    senseTxt = buildSenseSuggestion(data, i, DEFAULT_RIDE_HOURS);
  } catch (e){
    senseTxt = windDirectionSuggestionFallback(dir);
  }
  setText(els.windSuggestion, senseTxt);

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
      `Última atualização: ${new Date().toLocaleString("pt-PT", { dateStyle:"medium", timeStyle:"short" })}`
    );
    renderAll(json, source, loc.name);
  } catch (e){
    const msg = String(e?.message ?? e);
    setText(els.updated, `Erro ao atualizar (${new Date().toLocaleTimeString("pt-PT")}): ${msg}`);
    setText(els.source, "Se persistir: cache do Safari. Recarrega e/ou limpa dados do site.");
    console.error("[SEMPLANO] refresh failed:", e);
  }
}

function init(){
  if (!els.select || !els.updated) return;

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
