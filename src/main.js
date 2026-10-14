import './style.css';
import { PulseMap } from './map.js';

const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-GB');
const compact = n => new Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:2}).format(n);
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { index:14, metric:'entries', line:'all', station:null, playing:false, speed:1, view:'map' };
let data, map, lines, stations, timer, networkSeries;

function seriesPath(values,w,h,max=Math.max(...values)){
  return values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*w).toFixed(2)},${(h-v/(max||1)*(h-3)).toFixed(2)}`).join(' ');
}
function chart(values,w,h,color='#90f2ce'){
  const path=seriesPath(values,w,h);
  return `<path d="${path} L${w},${h} L0,${h} Z" fill="${color}" opacity=".1"/><path d="${path}" stroke="${color}" stroke-width="1.6" fill="none"/>`;
}
function subset(){return data.stations.filter(s=>s.dailyEntries+s.dailyExits>0&&(state.line==='all'||s.lines.includes(state.line)));}
function calculateSeries(){
  networkSeries=Array(96).fill(0);
  for(const s of subset())s[state.metric].forEach((n,i)=>networkSeries[i]+=n);
  $('#mini-trend').innerHTML=chart(networkSeries,70,25);
  const max=Math.max(...networkSeries);
  $('#day-chart').innerHTML=networkSeries.map((n,i)=>`<rect x="${i*10}" y="${42-n/(max||1)*39}" width="6.8" height="${Math.max(1,n/(max||1)*39)}" rx="1" fill="${i<=state.index?'#84c9b1':'#365951'}"/>`).join('');
}
function update(){
  const i=state.index;
  const minutes=(300+i*15)%1440,h=Math.floor(minutes/60),m=minutes%60;
  $('#time-display').innerHTML=`${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')}<span>${h<12?'AM':'PM'}${i>=76?' +1':''}</span>`;
  $('#period-name').textContent=h<5?'AFTER MIDNIGHT':h<7?'EARLY MORNING':h<10?'MORNING PEAK':h<16?'MIDDAY':h<19?'EVENING PEAK':h<22?'EVENING':'LATE NIGHT';
  $('#time-range').value=i;$('#time-range').setAttribute('aria-valuetext',`${data.intervals[i].slice(0,2)}:${data.intervals[i].slice(2,4)} to ${data.intervals[i].slice(5,7)}:${data.intervals[i].slice(7)}${i>=76?', next day':''}`);
  $('#time-marker').style.left=`${i/95*100}%`;
  $('#network-value').textContent=fmt(networkSeries[i]);
  $('#metric-label').textContent=`${state.line==='all'?'NETWORK':'SERVED STATIONS'} ${state.metric.toUpperCase()} / 15 MIN`;
  $('#network-context').textContent=state.line==='all'?`${(networkSeries[i]/Math.max(...networkSeries)*100).toFixed(0)}% of the daily peak`:'Station totals include all lines';
  $('#ranking-title').textContent=state.line==='all'?'BUSIEST RIGHT NOW':'BUSIEST SERVED STATIONS';
  $('#coverage').textContent=`${subset().length} stations · ${state.line==='all'?data.summary.activeLines:1} ${state.line==='all'?'lines':'line'}`;
  $('#ranking').innerHTML=subset().sort((a,b)=>b[state.metric][i]-a[state.metric][i]).slice(0,4).map((s,k)=>`<button class="rank-row" data-station="${s.id}" title="Inspect ${escape(s.name)}"><span class="rank-number">0${k+1}</span><span class="rank-name">${escape(s.name.replace(/ LU$| EL$/,''))}</span><span class="rank-value">${fmt(s[state.metric][i])}</span></button>`).join('');
  document.querySelectorAll('#day-chart rect').forEach((el,j)=>el.setAttribute('fill',j<=i?'#84c9b1':'#365951'));
  document.querySelectorAll('[data-time]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.time)===i));
  if(map)map.setData(i,state.metric,state.line);
  if(state.station)renderStation();
}
function selectStation(id,focus=true){
  state.station=Number(id);renderStation();$('#station-card').hidden=false;
  map?.select(state.station,focus);
  $('#close-station').focus({preventScroll:true});
  if(innerWidth<=760)$('#station-card').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function renderStation(){
  const s=stations.get(state.station);if(!s)return;
  $('#station-zone').textContent=`STATION ${s.code} · ZONE ${s.zone}`;
  $('#station-name').textContent=s.name;
  $('#station-lines').innerHTML=s.lines.map(id=>`<span style="--color:${lines.get(id).color}">${escape(lines.get(id).name)}</span>`).join('');
  $('#station-entries').textContent=fmt(s.entries[state.index]);$('#station-exits').textContent=fmt(s.exits[state.index]);
  const max=Math.max(...s.entries,...s.exits),x=state.index/95*290;
  $('#station-chart').innerHTML=`<path d="${seriesPath(s.entries,290,65,max)}" stroke="#90f2ce" stroke-width="1.8" fill="none"/><path d="${seriesPath(s.exits,290,65,max)}" stroke="#749daa" stroke-width="1.5" fill="none"/><path d="M${x},0 L${x},65" stroke="#ecfff4" opacity=".55" stroke-dasharray="2 3"/>`;
  $('#station-total').textContent=`${fmt(s.dailyEntries)} entries across the traffic day. Station totals cover every line at this station.`;
  $('#coordinate-note').textContent=s.coordinateMethod.includes('proxy')?'Location uses the Custom House DLR station complex as a geographic proxy.':'';
}
function setLine(id){
  state.line=id;$('#line-select').value=id;
  document.querySelectorAll('.line-chip').forEach(b=>{b.classList.toggle('active',b.dataset.line===id);b.setAttribute('aria-pressed',String(b.dataset.line===id));});
  calculateSeries();update();
}
function setPlaying(value){
  state.playing=value;clearInterval(timer);
  $('#play').setAttribute('aria-label',value?'Pause the traffic day':'Play the traffic day');
  $('#play').innerHTML=value?'<svg viewBox="0 0 20 20"><path d="M5 4h3v12H5zm7 0h3v12h-3Z"/></svg>':'<svg viewBox="0 0 20 20"><path d="m7 4 9 6-9 6Z"/></svg>';
  if(value)timer=setInterval(()=>{if(!document.hidden&&state.view==='map'){state.index=(state.index+1)%96;update();}},1200/state.speed);
}
function setView(view){
  if(!['map','insights','method'].includes(view))return;
  state.view=view;
  for(const name of ['map','insights','method'])$(`#${name}-view`).hidden=name!==view;
  document.querySelectorAll('.nav-button').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  if(view!=='map')setPlaying(false);else requestAnimationFrame(()=>map?.onResize());
  window.scrollTo(0,0);
}
function buildDocuments(){
  const s=data.summary, peak=s.peakEntryInterval;
  const top=data.stations.filter(s=>s.dailyEntries>0).sort((a,b)=>b.dailyEntries-a.dailyEntries).slice(0,7);
  const lineTop=data.lines.filter(l=>l.total>0).sort((a,b)=>b.total-a.total).slice(0,7);
  const bars=(items,value,name,color)=>`<div class="story-bars">${items.map(x=>`<div><div class="story-bar-label"><span>${escape(name(x))}</span><span>${compact(value(x))}</span></div><div class="story-bar-track"><span style="width:${value(x)/value(items[0])*100}%;background:${color(x)}"></span></div></div>`).join('')}</div>`;
  $('#insights-view').innerHTML=`<div class="eyebrow">THE DATA STORY / 2025</div><h1>A city with two rush hours.<br>And millions of reasons to move.</h1><p class="lede">One typical autumn Tuesday–Thursday, seen through TfL’s NUMBAT estimates. Follow how demand changes across a full traffic day.</p>
    <div class="insight-stats"><div class="insight-stat"><strong>${compact(s.dailyEntries)}</strong><span>Station entries across the traffic day</span></div><div class="insight-stat"><strong>${s.activeStations}</strong><span>Rail stations with recorded demand</span></div><div class="insight-stat"><strong>${peak.slice(0,2)}:${peak.slice(2,4)}</strong><span>Start of the busiest 15 minutes for entries</span></div></div>
    <div class="story-grid"><article class="story-card wide"><h2>The rhythm of a weekday</h2><p>Entry demand reaches ${fmt(s.peakEntries)} in the busiest quarter-hour. The chart follows the traffic day from 05:00 through to 05:00 the following morning.</p><svg viewBox="0 0 960 180" role="img" aria-label="Network entries over the traffic day">${chart(s.entriesByTime,960,180)}</svg><div class="chart-ticks"><span>05:00</span><span>09:00</span><span>13:00</span><span>17:00</span><span>21:00</span><span>01:00 +1</span><span>05:00 +1</span></div></article>
    <article class="story-card"><h2>Where the journeys begin</h2><p>The busiest entry points, ranked by daily station entries. Separate station records in the workbook remain separate here.</p>${bars(top,x=>x.dailyEntries,x=>x.name,()=> '#90f2ce')}</article>
    <article class="story-card"><h2>The lines that carry London</h2><p>Daily boardings by line. A passenger who changes lines can contribute more than one boarding.</p>${bars(lineTop,x=>x.total,x=>x.name,x=>x.color)}</article>
    <article class="story-card wide"><h2>A map is only as honest as its definitions</h2><p>There are ${s.stationCount} station records in the workbook, including ${s.zeroDemandStations} zero-total tram records. These records are preserved in the Python outputs and left out of the active rail view. The animation expresses relative passenger demand along station-to-station links. It does not track individual people or trains.</p><button class="text-button" data-view="method">Explore the cleaning decisions</button></article></div><button class="back-map" data-view="map">Return to the map</button>`;
  $('#method-view').innerHTML=`<div class="eyebrow">BEHIND THE DATA</div><h1>Beautiful maps.<br>Transparent methods.</h1><p class="lede">Python does the cleaning and exploratory analysis. Three.js renders the resulting geographic network in your browser.</p>
    <section class="method-section"><h2>01 / The source</h2><p><a href="https://crowding.data.tfl.gov.uk/" target="_blank" rel="noreferrer">TfL NUMBAT</a> models travel demand from ticketing and gateline counts. This project uses <code>NBT25TWT_Outputs.xlsx</code>, representing a typical autumn Tuesday–Thursday in 2025 (the TWT filename convention). Its traffic day starts at 05:00 and runs to 04:59 the next day, in 96 quarter-hour intervals. The workbook assumes the scheduled service operated in full. This is a historical representative day, not a live feed.</p></section>
    <section class="method-section"><h2>02 / What each number means</h2><table class="source-table"><thead><tr><th>Measure</th><th>Workbook sheet</th><th>Interpretation</th></tr></thead><tbody><tr><td>Station size & ranking</td><td>Station_Entries / Exits</td><td>Estimated entries or exits in the selected quarter-hour</td></tr><tr><td>Moving particles</td><td>Link_Loads</td><td>Relative directional demand between stations</td></tr><tr><td>Line rankings</td><td>Line_Boarders</td><td>Boardings, including transfers between lines</td></tr></tbody></table><p>Line filters show that line’s links and the stations it serves. Station entries and exits still include all lines at each station. Summing links counts passenger-segments and must not be described as unique journeys. Particle speed is illustrative; it does not encode actual journey time.</p></section>
    <section class="method-section"><h2>03 / Cleaning that can be reproduced</h2><ul><li>Read the true headers from Excel row 3 and remove empty formatting rows and columns.</li><li>Exclude the explicit TOTAL row from line-level aggregation to prevent double counting.</li><li>Validate numeric values, non-negativity, finite values, primary keys and all 96 ordered time bins. No demand values are imputed or rounded during analysis.</li><li>Reconcile each daily total to the sum of its quarter-hours; preserve the 39 zero-total tram records as a coverage caveat.</li><li>Platform boarding/alighting IDs repeat across lines, so their logical key includes the line. Ambiguous Station_Flows IDs and repeated rows are preserved with Excel-row provenance, reported separately, and excluded from the map.</li><li>Keep the traffic-day order after midnight. Export tidy Python tables, a quality report, charts, an executed notebook and a compact JSON snapshot.</li></ul><p>The reproducible pipeline lives in <code>analysis/pipeline.py</code>; the exploratory notebook is <code>notebooks/02_london_pulse_eda.ipynb</code>.</p></section>
    <section class="method-section"><h2>04 / Geographic joins & visual encoding</h2><p>Station locations use the NLC reference compiled by <a href="https://github.com/Osakwe1/TFL_Stations" target="_blank" rel="noreferrer">Osakwe1 / TFL_Stations</a>. Headstone Lane’s duplicated code is explicitly corrected from 3186 to 1434. Custom House EL uses the DLR station-complex coordinate as a disclosed proxy. All ${s.stationCount} station records resolve after these two documented adjustments.</p><p>The River Thames and Greater London outline come from the <a href="https://gis.london.gov.uk/arcgis/rest/services/apps/webmap_context_layer/MapServer" target="_blank" rel="noreferrer">Greater London Authority’s geographic context service</a>. Links connect station coordinates and are not surveyed track alignments. Station radius and column height use a square-root scale of demand against a fixed network-wide maximum. Particle brightness and size increase with link demand; the particle count is an illustrative sampling budget, not a passenger count.</p></section>
    <section class="method-section"><h2>05 / Limits worth keeping visible</h2><p>TfL assigns estimated routes to observed ticketing demand. Interchange choices and paths parallel to non-TfL rail are less certain. The map cannot establish capacity utilisation, actual crowding, delays, individual trajectories or annual passenger totals. Separate NLC records in a single interchange complex are not automatically merged. Some workbook demand extends beyond Greater London.</p><p>Contains TfL open data. Station reference credited to its compiler. Geographic context credited to GLA. See the repository’s data provenance document for source links and reuse notes.</p></section><button class="back-map" data-view="map">Return to the map</button>`;
}

async function init(){
  const response=await fetch(`${import.meta.env.BASE_URL}data/network.json`);if(!response.ok)throw new Error('The prepared dataset could not be loaded.');data=await response.json();
  lines=new Map(data.lines.map(l=>[l.id,l]));stations=new Map(data.stations.map(s=>[s.id,s]));
  const active=data.lines.filter(l=>l.total>0);
  $('#line-select').innerHTML='<option value="all">All rail lines</option>'+active.map(l=>`<option value="${l.id}">${escape(l.name)}</option>`).join('');
  $('#line-count').textContent=`${active.length} lines`;
  $('#line-grid').innerHTML=active.map(l=>`<button class="line-chip" style="--color:${l.color}" data-line="${l.id}" title="${escape(l.name)}" aria-label="Focus ${escape(l.name)} line" aria-pressed="false"></button>`).join('');
  calculateSeries();update();buildDocuments();
  try{
    const [thames,london]=await Promise.all(['thames','london'].map(async name=>{const r=await fetch(`${import.meta.env.BASE_URL}data/${name}.geojson`);if(!r.ok)throw new Error(`Missing ${name} geography`);return r.json();}));
    map=new PulseMap($('#map-canvas'),data,{thames,london},id=>selectStation(id,false));
    $('#map-status').hidden=true;
  }catch(error){console.error(error);$('#map-status').textContent='The 3D map is unavailable on this device. Explore the station search, timeline and Data story below.';document.querySelectorAll('.map-tools button').forEach(b=>b.disabled=true);}
  $('#line-select').addEventListener('change',e=>setLine(e.target.value));
  $('#time-range').addEventListener('input',e=>{state.index=Number(e.target.value);setPlaying(false);update();});
  $('#play').onclick=()=>setPlaying(!state.playing);
  $('#speed').onclick=()=>{state.speed=state.speed===1?2:state.speed===2?4:1;$('#speed').textContent=`${state.speed}×`;if(state.playing)setPlaying(true);};
  $('#close-station').onclick=()=>{state.station=null;$('#station-card').hidden=true;map?.select(null);};
  $('#station-search').addEventListener('input',e=>{
    const normalize=s=>s.toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/&/g,'and');
    const q=normalize(e.target.value.trim());
    const found=data.stations.filter(s=>s.dailyEntries+s.dailyExits>0&&normalize(s.name).includes(q)).slice(0,7);
    $('#search-results').innerHTML=!q?'':found.length?found.map(s=>`<button data-station="${s.id}">${escape(s.name)}</button>`).join(''):'<p>No matching station. Try another name.</p>';
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.view)setView(b.dataset.view);
    if(b.dataset.line)setLine(state.line===b.dataset.line?'all':b.dataset.line);
    if(b.dataset.station){selectStation(b.dataset.station);$('#search-results').innerHTML='';}
    if(b.dataset.metric){state.metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});calculateSeries();update();}
    if(b.dataset.time){state.index=Number(b.dataset.time);setPlaying(false);update();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#close-station').click();$('#search-results').innerHTML='';}if(e.code==='Space'&&e.target===document.body&&state.view==='map'){e.preventDefault();setPlaying(!state.playing);}});
  window.addEventListener('pagehide',()=>{clearInterval(timer);map?.dispose();});
  document.body.dataset.ready='true';
}
init().catch(error=>{console.error(error);$('#map-status').textContent=`${error.message} Run the Python pipeline and reload.`;$('#network-context').textContent='Dataset unavailable';document.querySelectorAll('button,input,select').forEach(x=>x.disabled=true);});
