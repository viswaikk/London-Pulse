import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/network.json',import.meta.url),'utf8'));
test('traffic day keeps midnight after 23:45',()=>{assert.equal(data.intervals.length,96);assert.equal(data.intervals[76],'0000-0015');assert.equal(data.intervals[95],'0445-0500');});
test('every link endpoint has one valid geographic station',()=>{const ids=new Set(data.stations.map(s=>s.id));assert.equal(ids.size,data.stations.length);for(const l of data.links){assert.ok(ids.has(l.from));assert.ok(ids.has(l.to));}for(const s of data.stations){assert.ok(Number.isFinite(s.lat)&&Number.isFinite(s.lon));}});
test('all time series are finite nonnegative 96-bin vectors',()=>{for(const a of [...data.stations.flatMap(s=>[s.entries,s.exits]),...data.links.map(l=>l.values),...data.lines.map(l=>l.boarders)]){assert.equal(a.length,96);assert.ok(a.every(n=>Number.isFinite(n)&&n>=0));}});
test('rounded export reconciles with Python daily and interval summaries',()=>{const daily=data.stations.reduce((a,s)=>a+s.dailyEntries,0);assert.ok(Math.abs(daily-data.summary.dailyEntries)<1);for(let i=0;i<96;i++){const total=data.stations.reduce((a,s)=>a+s.entries[i],0);assert.ok(Math.abs(total-data.summary.entriesByTime[i])<data.stations.length*.00051);}});
test('active rail coverage excludes zero-total tram records',()=>{assert.equal(data.stations.filter(s=>s.dailyEntries>0).length,data.summary.activeStations);assert.equal(data.stations.filter(s=>s.dailyEntries===0).length,data.summary.zeroDemandStations);assert.equal(data.lines.filter(l=>l.total>0).length,data.summary.activeLines);});
