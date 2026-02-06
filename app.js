const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 }
];

const REFRESH_MS = 60 * 60 * 1000;

const els = {
  updated:document.getElementById("updated"),
  select:document.getElementById("locationSelect"),
  source:document.getElementById("source"),
  nowTemp:document.getElementById("nowTemp"),
  nowFeels:document.getElementById("nowFeels"),
  nowWind:document.getElementById("nowWind"),
  nowGust:document.getElementById("nowGust"),
  nowDirTxt:document.getElementById("nowDirTxt"),
  nowArrow:document.getElementById("nowArrow"),
  nowRain:document.getElementById("nowRain"),
  nowPop:document.getElementById("nowPop"),
  bestWindow:document.getElementById("bestWindow"),
  windSuggestion:document.getElementById("windSuggestion"),
  alerts:document.getElementById("alerts"),
  table8:document.getElementById("table8"),
  table48:document.getElementById("table48"),
  toggle48:document.getElementById("toggle48"),
  wrap48:document.getElementById("wrap48")
};

function updateWindyCam(lat, lon){
  const el = document.getElementById("windyCam");
  if(!el) return;

  el.setAttribute("data-params", JSON.stringify({
    lat, lon, radius:15, limit:1
  }));

  el.innerHTML="";
  if(window.WindyWebcamsWidget?.reload){
    window.WindyWebcamsWidget.reload();
  }
}

function buildUrl(loc){
  const p=new URLSearchParams({
    latitude:loc.lat,
    longitude:loc.lon,
    timezone:"Europe/Lisbon",
    wind_speed_unit:"kmh",
    precipitation_unit:"mm",
    forecast_hours:"48",
    hourly:[
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
      "wind_direction_10m",
      "precipitation_probability"
    ].join(",")
  });
  return "https://api.open-meteo.com/v1/ecmwf?"+p;
}

function rotateArrow(d){
  els.nowArrow.style.transform=`rotate(${d-45}deg)`;
}

async function refresh(){
  const loc=LOCATIONS.find(l=>l.id===els.select.value);
  updateWindyCam(loc.lat, loc.lon);

  els.updated.textContent="A atualizar…";
  const r=await fetch(buildUrl(loc));
  const j=await r.json();
  els.source.textContent="ECMWF (Open-Meteo)";

  const i=0;
  els.nowTemp.textContent=Math.round(j.hourly.temperature_2m[i])+"°";
  els.nowFeels.textContent="Sensação "+Math.round(j.hourly.apparent_temperature[i])+"°";
  els.nowWind.textContent=j.hourly.wind_speed_10m[i]+" km/h";
  els.nowGust.textContent=j.hourly.wind_gusts_10m[i]+" km/h";
  els.nowDirTxt.textContent=j.hourly.wind_direction_10m[i]+"°";
  rotateArrow(j.hourly.wind_direction_10m[i]);
  els.nowRain.textContent=j.hourly.precipitation[i]+" mm";
  els.nowPop.textContent=j.hourly.precipitation_probability[i]+"%";

  els.updated.textContent="Atualizado: "+new Date().toLocaleString("pt-PT");
}

function init(){
  LOCATIONS.forEach(l=>{
    const o=document.createElement("option");
    o.value=l.id;o.textContent=l.name;
    els.select.appendChild(o);
  });
  els.select.value="alcabideche";
  els.select.onchange=refresh;
  refresh();
  setInterval(refresh, REFRESH_MS);
}

init();
