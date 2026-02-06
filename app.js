const REFRESH_MS = 5 * 60 * 1000;

const LOCATIONS = [
  { id:"alcabideche", name:"Alcabideche", lat:38.7330, lon:-9.4100 },
  { id:"Algueirao", name:"Algueirão", lat:38.7936, lon:-9.3417 },
  { id:"Amadora", name:"Amadora", lat:38.7569, lon:-9.2308 },  
  { id:"Cascais", name:"Cascais", lat:38.6979, lon:-9.4206 },
  { id:"Culatra", name:"Ilha da Culatra", lat:36.9889, lon:-7.8336 },  
  { id:"Guincho", name:"Guincho", lat:38.72948, lon:-9.47457 },
  { id:"Peninha", name:"Peninha", lat:38.7692, lon:-9.4589 },
  { id:"Sintra", name:"Sintra", lat:38.8029, lon:-9.3817 }
];

function computeBestWindowNext12h(data){
  const times = data.hourly.time;
  const gust  = data.hourly.wind_gusts_10m;
  const pop   = data.hourly.precipitation_probability ?? [];
  const prcp  = data.hourly.precipitation ?? [];

  const START_H = 7;
  const LAST_START_H = 20;

  let bestIdx = null;
  let bestScore = -1;

  for (let i=0;i<times.length-2;i++){
    const d = new Date(times[i]);
    const h = d.getHours();
    if (h < START_H || h > LAST_START_H) continue;

    const popN = Math.min((pop[i] ?? 0)/100,1);
    const gustN = Math.min((gust[i] ?? 0)/60,1);
    const prcpN = Math.min((prcp[i] ?? 0)/3,1);

    const score = (1-(0.65*popN+0.35*prcpN))*0.65 + (1-gustN)*0.35;

    if (score > bestScore){
      bestScore = score;
      bestIdx = i;
    }
  }

  return { idx: bestIdx ?? 0, score: bestScore };
}
