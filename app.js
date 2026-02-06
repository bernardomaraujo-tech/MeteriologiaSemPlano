/* =========================
   CONFIG
========================= */

const REFRESH_MS = 5 * 60 * 1000; // 5 minutos
const TIMEZONE = "Europe/Lisbon";

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },
  { id:"algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },
  { id:"sintra", name:"Sintra", lat:38.8029, lon:-9.3817 }
];

/* =========================
   HELPERS
========================= */

const $ = id => document.getElementById(id);
const setText = (el, v) => { if (el) el.textContent = v; };
const show = el => el && el.classList.remove("hidden");
const hide = el => el && el.classList.add("hidden");

const kmh = v => `${Math.round(v)} km/h`;
const mm  = v => `${v.toFixed(1)} mm`;
const pct = v => `${Math.round(v)}%`;

function windDirText(deg){
  const dirs = ["N","NE","E","SE","S","SO","O","NO"];
  const idx = Math.round((deg % 360) / 45) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

function hourLabel(iso){
  return iso.slice(11,16);
}

function weekdayHour(iso){
  const d = new Date(iso);
  const w = d.toLocaleDateString("pt-PT",{weekday:"short"});
  const h = d.toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
  return `${w.charAt(0).toUpperCase()+w.slice(1)} ${h}`;
}

/* =========================
   ELEMENTS
========================= */

const els = {
  heroLoc: $("heroLoc"),
  heroTemp: $("heroTemp"),
  heroMeta: $("heroMeta"),
  updated: $("updated"),
  select: $("locationSelect"),

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
  wrap48: $("wrap48"),
  toggle48: $("toggle48"),

  bestWindow: $("bestWindow"),
  windSuggestion: $("windSuggestion"),

  windyCam: $("windyCam"),
  windyLink: $("windyLink"),
  source: $("source")
};

/* =========================
   FETCH
========================= */

async function fetchForecast(loc){
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${loc.lat}` +
    `&longitude=${loc.lon}` +
    `&timezone=${TIMEZONE}` +
    "&wind_speed_unit=kmh" +
    "&precipitation_unit=mm" +
    "&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Erro ao obter dados meteo");
  return res.json();
}

/* =========================
   RENDER
========================= */

function renderHero(data){
  const t = data.hourly;
  const i = 0;

  setText(els.heroTemp, `${Math.round(t.temperature_2m[i])}°`);
  setText(
    els.heroMeta,
    `Sensação: ${Math.round(t.apparent_temperature[i])}° · ` +
    `Máx: ${Math.round(Math.max(...t.temperature_2m.slice(0,24)))}° · ` +
    `Mín: ${Math.round(Math.min(...t.temperature_2m.slice(0,24)))}°`
  );

  setText(
    els.updated,
    `Última atualização: ${new Date().toLocaleString("pt-PT")}`
  );
}

function renderNow(data){
  const t = data.hourly;
  const i = 0;

  setText(els.nowWind, kmh(t.wind_speed_10m[i]));
  setText(els.nowGust, kmh(t.wind_gusts_10m[i]));
  setText(els.nowDirTxt, windDirText(t.wind_direction_10m[i]));
  setText(els.nowRain, mm(t.precipitation[i]));
  setText(els.nowPop, pct(t.precipitation_probability[i]));

  /* roda a seta da rosa dos ventos */
  if (els.dirNeedle){
    els.dirNeedle.style.transform =
      `translate(-50%,-90%) rotate(${t.wind_direction_10m[i]}deg)`;
  }
}

function renderDress(data){
  const t = data.hourly;
  const temp = t.apparent_temperature[0];
  const wind = t.wind_speed_10m[0];
  const rain = t.precipitation_probability[0];

  els.dressBike.textContent =
    temp < 10 ? "Frio: manga comprida/colete + luvas finas. Corta-vento ajuda."
    : wind > 20 ? "Vento: corta-vento leve recomendado."
    : "Condições amenas.";

  els.dressRun.textContent =
    temp < 8 ? "Frio: manga comprida leve. Corta-vento fino."
    : "Condições confortáveis.";

  els.dressWalk.textContent =
    rain > 40 ? "Possível chuva: impermeável fino."
    : "Casaco leve suficiente.";
}

function renderAlerts(data){
  const t = data.hourly;
  const alerts = [];

  if (t.precipitation_probability[0] > 60)
    alerts.push("🌧️ Chuva provável nas próximas 2h");

  if (t.wind_gusts_10m[0] > 40)
    alerts.push("💨 Rajadas fortes nas próximas horas");

  els.alerts.innerHTML = alerts.length
    ? alerts.map(a => `<div class="pill">${a}</div>`).join("")
    : "<div class='muted'>Sem alertas relevantes</div>";
}

function renderTables(data){
  const t = data.hourly;

  /* 8h */
  let h8 = `
    <tr>
      <th>Hora</th><th></th><th>Raj.</th><th>Dir</th><th>Chuva</th><th>Prob.</th>
    </tr>`;
  for (let i=0;i<8;i++){
    h8 += `
      <tr>
        <td>${hourLabel(t.time[i])}</td>
        <td class="iconCell">🌤️</td>
        <td>${kmh(t.wind_gusts_10m[i])}</td>
        <td>${windDirText(t.wind_direction_10m[i])}</td>
        <td>${mm(t.precipitation[i])}</td>
        <td>${pct(t.precipitation_probability[i])}</td>
      </tr>`;
  }
  els.table8.innerHTML = h8;

  /* 48h */
  let h48 = `
    <tr>
      <th>Dia</th><th></th><th>Temp</th><th>Vento</th><th>Chuva</th>
    </tr>`;
  for (let i=0;i<48;i++){
    h48 += `
      <tr>
        <td>${weekdayHour(t.time[i])}</td>
        <td class="iconCell">🌤️</td>
        <td>${Math.round(t.temperature_2m[i])}°</td>
        <td>${kmh(t.wind_speed_10m[i])}</td>
        <td>${mm(t.precipitation[i])}</td>
      </tr>`;
  }
  els.table48.innerHTML = h48;
}

function renderBestWindow(data){
  const t = data.hourly;
  els.bestWindow.textContent =
    "Menos chuva e menos rajadas previstas nas próximas horas.";
}

function renderWindSuggestion(data){
  const d = data.hourly.wind_direction_10m[0];
  els.windSuggestion.textContent =
    `Vento dominante de ${windDirText(d)}. Planeia ida com vento de costas.`;
}

/* =========================
   MAIN
========================= */

async function refresh(){
  const loc = LOCATIONS.find(l => l.id === els.select.value);
  if (!loc) return;

  setText(els.heroLoc, loc.name);

  const data = await fetchForecast(loc);

  renderHero(data);
  renderNow(data);
  renderDress(data);
  renderAlerts(data);
  renderTables(data);
  renderBestWindow(data);
  renderWindSuggestion(data);

  els.source.textContent = "Dados: Open-Meteo.com";

  /* Windy */
  if (els.windyCam){
    els.windyCam.setAttribute(
      "data-params",
      JSON.stringify({ lat:loc.lat, lon:loc.lon, radius:15, limit:1 })
    );
    els.windyLink.href =
      `https://www.windy.com/webcams?lat=${loc.lat}&lon=${loc.lon}`;
  }
}

function init(){
  LOCATIONS.forEach(l=>{
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    els.select.appendChild(o);
  });

  els.select.value = "alcabideche";
  els.select.addEventListener("change", refresh);

  els.toggle48?.addEventListener("click", ()=>{
    els.wrap48.classList.toggle("hidden");
    els.toggle48.textContent =
      els.wrap48.classList.contains("hidden") ? "Mostrar" : "Ocultar";
  });

  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
