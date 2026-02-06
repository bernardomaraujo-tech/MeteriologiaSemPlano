const REFRESH_MS = 5 * 60 * 1000;

/* LOCALIZAÇÕES */
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

const els = {
  updated: document.getElementById("updated"),
  select: document.getElementById("locationSelect"),
  source: document.getElementById("source"),

  heroLoc: document.getElementById("heroLoc"),
  heroTemp: document.getElementById("heroTemp"),
  heroMeta: document.getElementById("heroMeta"),

  nowWind: document.getElementById("nowWind"),
  nowGust: document.getElementById("nowGust"),
  nowDirTxt: document.getElementById("nowDirTxt"),
  nowArrow: document.getElementById("nowArrow"),
  nowRain: document.getElementById("nowRain"),
  nowPop: document.getElementById("nowPop"),

  alerts: document.getElementById("alerts"),
  table8: document.getElementById("table8"),
  table48: document.getElementById("table48"),
  toggle48: document.getElementById("toggle48"),
  wrap48: document.getElementById("wrap48"),

  bestWindow: document.getElementById("bestWindow"),
  windSuggestion: document.getElementById("windSuggestion"),
};

/* HELPERS */
const kmh = v => `${Math.round(v)} km/h`;
const mm  = v => `${(v ?? 0).toFixed(1)} mm`;
const pct = v => `${Math.round(v ?? 0)}%`;

function windDir(deg){
  const d = ["N","NE","E","SE","S","SO","O","NO"];
  return `${d[Math.round(deg/45)%8]} (${Math.round(deg)}°)`;
}

function hourLabel(iso){ return iso.slice(11,16); }

function weekdayHour(iso){
  const d = new Date(iso);
  return d.toLocaleDateString("pt-PT",{weekday:"short"}) +
         " " +
         d.toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
}

function weatherIcon(code,isDay){
  if(code===0) return isDay?"☀️":"🌙";
  if(code<=2) return "⛅";
  if(code===3) return "☁️";
  if(code===45||code===48) return "🌫️";
  if(code>=51&&code<=67) return "🌧️";
  if(code>=71&&code<=77) return "❄️";
  if(code>=80&&code<=82) return "🌧️";
  if(code>=95) return "⛈️";
  return "•";
}

function buildUrl(loc){
  const p = new URLSearchParams({
    latitude:loc.lat,
    longitude:loc.lon,
    timezone:"Europe/Lisbon",
    forecast_hours:"48",
    wind_speed_unit:"kmh",
    precipitation_unit:"mm",
    hourly:[
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "precipitation_probability",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "weather_code",
      "is_day"
    ].join(",")
  });
  return "https://api.open-meteo.com/v1/ecmwf?" + p.toString();
}

function nearestHour(times){
  const now = Date.now();
  return times.reduce((b,t,i)=>{
    const d = Math.abs(new Date(t)-now);
    return d < b.d ? {i,d} : b;
  },{i:0,d:1e18}).i;
}

/* MELHOR JANELA 07–22 */
function bestWindow(data){
  const t = data.hourly.time;
  const i0 = nearestHour(t);
  let best = null, score = -1;

  for(let i=i0;i<i0+12 && i<t.length-2;i++){
    const h = new Date(t[i]).getHours();
    if(h<7||h>20) continue;

    const rain = (data.hourly.precipitation_probability[i]??0)/100;
    const gust = (data.hourly.wind_gusts_10m[i]??0)/60;
    const s = (1-rain)*0.6 + (1-gust)*0.4;

    if(s>score){ score=s; best=i; }
  }
  return best ?? i0;
}

/* RENDER */
function render(data, loc){
  const t = data.hourly.time;
  const i = nearestHour(t);

  els.heroLoc.textContent = loc.name;
  els.heroTemp.textContent = Math.round(data.hourly.temperature_2m[i])+"°";
  els.heroMeta.textContent =
    "Sensação "+Math.round(data.hourly.apparent_temperature[i])+"°";

  els.nowWind.textContent = kmh(data.hourly.wind_speed_10m[i]);
  els.nowGust.textContent = kmh(data.hourly.wind_gusts_10m[i]);
  els.nowDirTxt.textContent = windDir(data.hourly.wind_direction_10m[i]);
  els.nowRain.textContent = mm(data.hourly.precipitation[i]);
  els.nowPop.textContent = pct(data.hourly.precipitation_probability[i]);

  /* Alertas */
  els.alerts.innerHTML =
    (data.hourly.wind_gusts_10m[i]>45 ? "💨 Rajadas fortes" :
     data.hourly.precipitation_probability[i]>60 ? "☔ Chuva provável" :
     "✅ Sem alertas");

  /* Tabelas */
  const make = (n, tbl, lbl) => {
    let h = `
      <tr>
        <th>Hora</th><th></th><th>Temp</th><th>Vento</th><th>Raj.</th>
      </tr>`;
    for(let k=i;k<i+n && k<t.length;k++){
      h+=`
      <tr>
        <td>${lbl(t[k])}</td>
        <td class="iconCell">${weatherIcon(data.hourly.weather_code[k],data.hourly.is_day[k])}</td>
        <td>${Math.round(data.hourly.temperature_2m[k])}°</td>
        <td>${kmh(data.hourly.wind_speed_10m[k])}</td>
        <td>${kmh(data.hourly.wind_gusts_10m[k])}</td>
      </tr>`;
    }
    tbl.innerHTML=h;
  };

  make(8, els.table8, hourLabel);
  make(48, els.table48, weekdayHour);

  const bw = bestWindow(data);
  els.bestWindow.textContent =
    weekdayHour(t[bw])+" → "+weekdayHour(t[bw+2]??t[bw+1]);

  els.windSuggestion.textContent =
    "Vento de "+windDir(data.hourly.wind_direction_10m[i]);

  els.source.textContent = "ECMWF (Open-Meteo)";
}

/* REFRESH */
async function refresh(){
  const loc = LOCATIONS.find(l=>l.id===els.select.value);
  els.updated.textContent="A atualizar…";
  try{
    const r = await fetch(buildUrl(loc),{cache:"no-store"});
    const j = await r.json();
    render(j,loc);
    els.updated.textContent =
      "Atualizado "+new Date().toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
  }catch{
    els.updated.textContent="Erro ao atualizar";
  }
}

function init(){
  LOCATIONS.forEach(l=>{
    const o=document.createElement("option");
    o.value=l.id; o.textContent=l.name;
    els.select.appendChild(o);
  });
  els.select.value="alcabideche";
  els.select.onchange=refresh;

  els.toggle48.onclick=()=>{
    els.wrap48.classList.toggle("hidden");
  };

  refresh();
  setInterval(refresh,REFRESH_MS);
}

init();
