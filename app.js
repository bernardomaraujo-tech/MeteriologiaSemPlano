const REFRESH_MS = 5 * 60 * 1000;

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

const els = {
  heroLocation: document.getElementById("heroLocation"),
  heroTemp: document.getElementById("heroTemp"),
  heroMeta: document.getElementById("heroMeta"),
  heroUpdated: document.getElementById("heroUpdated"),

  locationSelect: document.getElementById("locationSelect"),

  nowWind: document.getElementById("nowWind"),
  nowGust: document.getElementById("nowGust"),
  nowDirText: document.getElementById("nowDirText"),
  compassNeedle: document.getElementById("compassNeedle"),
  nowRain: document.getElementById("nowRain"),
  nowPop: document.getElementById("nowPop"),

  wearBike: document.getElementById("wearBike"),
  wearRun: document.getElementById("wearRun"),
  wearWalk: document.getElementById("wearWalk"),

  alerts: document.getElementById("alerts"),

  table8: document.getElementById("table8"),
  table48: document.getElementById("table48"),
  toggle48: document.getElementById("toggle48"),
  wrap48: document.getElementById("wrap48"),

  bestWindow: document.getElementById("bestWindow"),
  windSuggestion: document.getElementById("windSuggestion"),

  windyWebcamAnchor: document.getElementById("windyWebcamAnchor"),
  windyWebcamLink: document.getElementById("windyWebcamLink"),

  source: document.getElementById("source"),
};

function fmtKmh(v){ return `${Math.round(v)} km/h`; }
function fmtMm(v){ return `${(Math.round((v ?? 0) * 10) / 10).toFixed(1)} mm`; }
function fmtPct(v){ return `${Math.round(v ?? 0)}%`; }

function toDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

function setNeedle(deg){
  els.compassNeedle.style.transform = `translateY(-50%) rotate(${deg}deg)`;
}

function weekdayHourLabel(iso){
  const d = new Date(iso);
  const wd = d.toLocaleDateString("pt-PT", { weekday:"short" });
  const hh = iso.slice(11,16);
  return `${wd.charAt(0).toUpperCase()+wd.slice(1)} ${hh}`;
}

/* Ícones (emoji) via weather_code Open-Meteo */
function iconForWeatherCode(code, isDay){
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code === 1) return isDay ? "🌤️" : "🌙☁️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55) return "🌦️";
  if (code === 56 || code === 57) return "🌧️";
  if (code === 61 || code === 63 || code === 65) return "🌧️";
  if (code === 66 || code === 67) return "🌧️";
  if (code === 71 || code === 73 || code === 75) return "🌨️";
  if (code === 77) return "🌨️";
  if (code === 80 || code === 81 || code === 82) return "🌧️";
  if (code === 85 || code === 86) return "🌨️";
  if (code === 95) return "⛈️";
  if (code === 96 || code === 99) return "⛈️";
  return "❓";
}

/* ============================================================
   ✅ ÚNICA ALTERAÇÃO: SUGESTÃO DO QUE VESTIR
   ============================================================ */
function clothingSuggestion({ temp, wind, gust, pop, prcp, sport }){
  const rainy = (pop ?? 0) >= 25 || (prcp ?? 0) >= 0.2;
  const windy = (wind ?? 0) >= 22 || (gust ?? 0) >= 35;

  let band = "";
  if (temp <= 6) band = "Muito Frio";
  else if (temp <= 11) band = "Frio";
  else if (temp <= 16) band = "Fresco";
  else if (temp <= 22) band = "Agradável";
  else band = "Quente";

  const add = (t) => t ? ` ${t}` : "";

  if (sport === "bike"){
    if (temp <= 6){
      return `${band}: base layer + jersey ML + colete/casaco + luvas grossas + calças + proteção sapatos.${add(rainy ? "Impermeável." : "")}`;
    }
    if (temp <= 11){
      return `${band}: base layer + jersey ML + colete + luvas finas + calção.${add(windy ? "Corta-vento." : "")}${add(rainy ? "Capa." : "")}`;
    }
    if (temp <= 16){
      return `${band}: base layer + jersey ML + colete opcional.${add(rainy ? "Capa." : "")}`;
    }
    if (temp <= 22){
      return `${band}: jersey MC.${add(windy ? "Colete fino." : "")}`;
    }
    return `${band}: jersey leve + proteção solar.`;
  }

  if (sport === "run"){
    if (temp <= 6){
      return `${band}: térmica ML + calças + corta-vento leve.`;
    }
    if (temp <= 11){
      return `${band}: manga comprida leve.${add(rainy ? "Corta-vento fino." : "")}`;
    }
    if (temp <= 16){
      return `${band}: t-shirt + camada fina opcional.`;
    }
    if (temp <= 22){
      return `${band}: t-shirt leve.`;
    }
    return `${band}: muito leve + hidratação.`;
  }

  if (temp <= 6){
    return `${band}: vai por camadas.${add(rainy ? "Impermeável fino." : "")}`;
  }
  if (temp <= 11){
    return `${band}: casaco leve por camadas.${add(rainy ? "Impermeável fino." : "")}`;
  }
  if (temp <= 16){
    return `${band}: camisola leve por camadas.${add(rainy ? "Impermeável fino." : "")}`;
  }
  if (temp <= 22){
    return `${band}: confortável por camadas.${add(rainy ? "Impermeável fino." : "")}`;
  }
  return `${band}: leve e respirável + água.`;
}
/* ============================================================ */

function buildTable(el, rows, withWeekday){
  const head = `
    <thead>
      <tr>
        <th>${withWeekday ? "Dia/Hora" : "Hora"}</th>
        <th></th>
        <th>Temp</th>
        <th>Vento</th>
        <th>Raj.</th>
        <th>Dir</th>
        <th>Chuva</th>
        <th>Prob.</th>
      </tr>
    </thead>`;

  const body = rows.map(r => `
    <tr>
      <td>${r.time}</td>
      <td class="wxIcon">${r.icon}</td>
      <td>${r.temp}°</td>
      <td>${fmtKmh(r.wind)}</td>
      <td>${fmtKmh(r.gust)}</td>
      <td>${r.dir}</td>
      <td>${fmtMm(r.rain)}</td>
      <td>${fmtPct(r.pop)}</td>
    </tr>
  `).join("");

  el.innerHTML = head + `<tbody>${body}</tbody>`;
}

function best2hWindow(hours){
  const filtered = hours.filter(h => {
    const hr = parseInt(h.iso.slice(11,13), 10);
    return hr >= 7 && hr <= 22;
  });

  if (filtered.length < 3) return null;

  const slice = filtered.slice(0, 12);
  let best = null;

  for (let i=0; i<slice.length-1; i++){
    const a = slice[i];
    const b = slice[i+1];

    const rainScore = (a.pop ?? 0) + (b.pop ?? 0) + 10 * ((a.rain ?? 0) + (b.rain ?? 0));
    const gustScore = (a.gust ?? 0) + (b.gust ?? 0);

    const score = rainScore + gustScore;

    if (!best || score < best.score){
      best = { a, b, score };
    }
  }

  return best;
}

function computeAlerts(now){
  const alerts = [];
  const rainySoon = (now.pop ?? 0) >= 25 || (now.rain ?? 0) >= 0.2;
  const gusty = (now.gust ?? 0) >= 35;

  if (rainySoon) alerts.push({ icon:"☔️", text:"Chuva provável nas próximas 2h" });
  if (gusty) alerts.push({ icon:"💨", text:"Rajadas fortes nas próximas 2h" });

  return alerts;
}

function renderAlerts(alerts){
  if (!alerts.length){
    els.alerts.textContent = "—";
    return;
  }

  els.alerts.innerHTML = alerts.map(a => `
    <div class="alertPill">${a.icon}&nbsp;&nbsp;${a.text}</div>
  `).join("");
}

function windLoopSuggestion(deg){
  const dirs = [
    { name:"N", min:337.5, max:360 },
    { name:"N", min:0, max:22.5 },
    { name:"NE", min:22.5, max:67.5 },
    { name:"E", min:67.5, max:112.5 },
    { name:"SE", min:112.5, max:157.5 },
    { name:"S", min:157.5, max:202.5 },
    { name:"SO", min:202.5, max:247.5 },
    { name:"O", min:247.5, max:292.5 },
    { name:"NO", min:292.5, max:337.5 },
  ];

  const d = ((deg % 360) + 360) % 360;
  const hit = dirs.find(x => d >= x.min && d < x.max) || { name:"—" };
  return `De ${hit.name} (${Math.round(d)}°). Favorece ir para leste; regresso para oeste é mais pesado.`;
}

async function fetchWithFallback(loc){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=Europe%2FLisbon`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("fetch failed");
  const json = await r.json();
  return { json, source: "Open-Meteo" };
}

function renderAll(json, source, locName){
  els.source.textContent = source;

  const h = json.hourly;
  const d = json.daily;

  const nowIdx = (() => {
    const now = new Date();
    const tzNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
    const iso = tzNow.toISOString().slice(0,13) + ":00";
    const idx = h.time.indexOf(iso);
    return idx >= 0 ? idx : 0;
  })();

  const temp = h.temperature_2m[nowIdx];
  const feels = h.apparent_temperature[nowIdx];
  const max = d.temperature_2m_max[0];
  const min = d.temperature_2m_min[0];

  els.heroLocation.textContent = locName;
  els.heroTemp.textContent = `${Math.round(temp)}°`;
  els.heroMeta.textContent = `Sensação: ${Math.round(feels)}° · Máx: ${Math.round(max)}° · Mín: ${Math.round(min)}°`;

  const updated = new Date().toLocaleString("pt-PT");
  els.heroUpdated.textContent = `Última atualização: ${updated}`;

  const wind = h.wind_speed_10m[nowIdx];
  const gust = h.wind_gusts_10m[nowIdx];
  const dirDeg = h.wind_direction_10m[nowIdx];
  const pop = h.precipitation_probability[nowIdx] ?? 0;
  const rain = h.precipitation[nowIdx] ?? 0;

  els.nowWind.textContent = fmtKmh(wind);
  els.nowGust.textContent = fmtKmh(gust);
  els.nowDirText.textContent = toDirText(dirDeg);
  setNeedle(dirDeg);
  els.nowRain.textContent = fmtMm(rain);
  els.nowPop.textContent = fmtPct(pop);

  els.wearBike.textContent = clothingSuggestion({ temp: feels, wind, gust, pop, prcp: rain, sport:"bike" });
  els.wearRun.textContent  = clothingSuggestion({ temp: feels, wind, gust, pop, prcp: rain, sport:"run" });
  els.wearWalk.textContent = clothingSuggestion({ temp: feels, wind, gust, pop, prcp: rain, sport:"walk" });

  renderAlerts(computeAlerts({ pop, rain, gust }));

  const rows8 = [];
  for (let i=0; i<8; i++){
    const idx = nowIdx + i;
    rows8.push({
      time: h.time[idx].slice(11,16),
      icon: iconForWeatherCode(h.weather_code[idx], true),
      temp: Math.round(h.temperature_2m[idx]),
      wind: h.wind_speed_10m[idx],
      gust: h.wind_gusts_10m[idx],
      dir: toDirText(h.wind_direction_10m[idx]).split(" ")[0],
      rain: h.precipitation[idx],
      pop: h.precipitation_probability[idx] ?? 0
    });
  }
  buildTable(els.table8, rows8, false);

  const hours12 = [];
  for (let i=0; i<24; i++){
    const idx = nowIdx + i;
    hours12.push({
      iso: h.time[idx],
      pop: h.precipitation_probability[idx] ?? 0,
      rain: h.precipitation[idx] ?? 0,
      gust: h.wind_gusts_10m[idx] ?? 0
    });
  }
  const best = best2hWindow(hours12);
  if (best){
    const a = best.a.iso;
    const b = best.b.iso;
    const aDay = new Date(a).toLocaleDateString("pt-PT", { weekday:"short" });
    const bDay = new Date(b).toLocaleDateString("pt-PT", { weekday:"short" });
    const aH = a.slice(11,16);
    const bH = b.slice(11,16);
    els.bestWindow.textContent = `${aDay.charAt(0).toUpperCase()+aDay.slice(1)}. ${aH} → ${bDay.charAt(0).toUpperCase()+bDay.slice(1)}. ${bH}`;
  } else {
    els.bestWindow.textContent = "—";
  }

  els.windSuggestion.textContent = windLoopSuggestion(dirDeg);

  const rows48 = [];
  for (let i=0; i<48; i++){
    const idx = nowIdx + i;
    rows48.push({
      time: weekdayHourLabel(h.time[idx]),
      icon: iconForWeatherCode(h.weather_code[idx], true),
      temp: Math.round(h.temperature_2m[idx]),
      wind: h.wind_speed_10m[idx],
      gust: h.wind_gusts_10m[idx],
      dir: toDirText(h.wind_direction_10m[idx]).split(" ")[0],
      rain: h.precipitation[idx],
      pop: h.precipitation_probability[idx] ?? 0
    });
  }
  buildTable(els.table48, rows48, true);

  const params = JSON.stringify({ lat: json.latitude, lon: json.longitude });
  els.windyWebcamAnchor.setAttribute("data-params", params);
  els.windyWebcamLink.href = `https://www.windy.com/webcams?${json.latitude},${json.longitude},12`;
}

async function refresh(){
  try{
    const loc = LOCATIONS.find(l => l.id === els.locationSelect.value) || LOCATIONS[0];
    const { json, source } = await fetchWithFallback(loc);
    renderAll(json, source, loc.name);
  } catch (e){
    els.heroUpdated.textContent = `Última atualização: falhou (${new Date().toLocaleTimeString("pt-PT")})`;
  }
}

function init(){
  els.locationSelect.innerHTML = LOCATIONS.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
  els.locationSelect.value = "alcabideche";

  els.locationSelect.addEventListener("change", refresh);

  els.toggle48.addEventListener("click", () => {
    const isHidden = els.wrap48.classList.contains("hidden");
    els.wrap48.classList.toggle("hidden", !isHidden);
    els.toggle48.textContent = isHidden ? "Esconder" : "Mostrar";
  });

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();