import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const project = (lon, lat, z = 0) => new THREE.Vector3((lon + .12) * 100, (lat - 51.52) * 160, z);
const mint = new THREE.Color('#90f2ce');

/** Geographic XY map with GPU flow particles. Demand never invents train positions. */
export class PulseMap {
  constructor(container, data, geography, onSelect) {
    this.container = container;
    this.data = data;
    this.onSelect = onSelect;
    this.stations = data.stations.filter(s => s.dailyEntries + s.dailyExits > 0);
    this.byId = new Map(data.stations.map(s => [s.id, s]));
    this.lines = new Map(data.lines.map(l => [l.id, l]));
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 600);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -29, 70);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.reduced;
    this.controls.dampingFactor = .09;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 230;
    this.controls.maxPolarAngle = Math.PI * .46;
    this.controls.target.set(0, 1, 0);
    this.controls.update();
    this.perspective = true;
    this.dummy = new THREE.Object3D();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.time = 0;
    this.selected = null;
    this.current = { index: 14, metric: 'entries', line: 'all' };
    this.addGeography(geography);
    this.addNetwork();
    this.addStations();
    this.addLabels();
    this.bindEvents();
    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(container);
    this.onResize();
    this.setData(14, 'entries', 'all');
    this.lastFrame = 0;
    this.renderer.setAnimationLoop(t => this.animate(t));
  }

  addGeography({ thames, london }) {
    const addGeo = (geo, water) => {
      for (const feature of geo.features) {
        const polys = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
        for (const polygon of polys) {
          const shape = new THREE.Shape(polygon[0].map(([lon, lat]) => { const p = project(lon, lat); return new THREE.Vector2(p.x, p.y); }));
          for (const ring of polygon.slice(1)) shape.holes.push(new THREE.Path(ring.map(([lon, lat]) => { const p = project(lon, lat); return new THREE.Vector2(p.x, p.y); })));
          const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: water ? '#27464f' : '#183136', transparent: true, opacity: water ? .55 : .18, depthWrite: false, side: THREE.DoubleSide }));
          mesh.position.z = water ? -.03 : -.1;
          this.scene.add(mesh);
          const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(polygon[0].map(([lon, lat]) => project(lon, lat, -.02))), new THREE.LineBasicMaterial({ color: water ? '#466a71' : '#345559', transparent: true, opacity: water ? .4 : .25 }));
          this.scene.add(edge);
        }
      }
    };
    addGeo(london, false);
    addGeo(thames, true);
    const points = [];
    for (let x = -110; x < 55; x += 2) for (let y = -48; y < 52; y += 2) points.push(x, y, -.15);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.scene.add(new THREE.Points(grid, new THREE.PointsMaterial({ color: '#658082', size: .055, transparent: true, opacity: .19, sizeAttenuation: true })));
  }

  addNetwork() {
    this.routes = new Map();
    this.particleGroups = [];
    const links = this.data.links.filter(l => l.total > 0);
    this.maxLink = Math.max(...links.map(l => Math.max(...l.values)));
    for (const line of this.data.lines.filter(l => l.total > 0)) {
      const subset = links.filter(l => l.line === line.id);
      const vertices = [], start = [], end = [], phase = [], demand = [];
      const refs = [];
      const unique = new Set();
      for (const link of subset) {
        const from = this.byId.get(link.from), to = this.byId.get(link.to);
        const a = project(from.lon, from.lat, .07), b = project(to.lon, to.lat, .07);
        const offset = new THREE.Vector3(-(b.y-a.y), b.x-a.x, 0).normalize().multiplyScalar(.035);
        a.add(offset); b.add(offset);
        const key = [link.from, link.to].sort((x,y)=>x-y).join('-');
        if (!unique.has(key)) { vertices.push(...a.toArray(), ...b.toArray()); unique.add(key); }
        const count = Math.min(20, Math.max(4, Math.ceil(a.distanceTo(b) * 3)));
        for (let i = 0; i < count; i++) {
          start.push(...a.toArray()); end.push(...b.toArray()); phase.push(i/count);
          demand.push(0); refs.push(link);
        }
      }
      const route = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)), new THREE.LineBasicMaterial({ color: line.color, transparent: true, opacity: .44 }));
      this.scene.add(route); this.routes.set(line.id, route);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(start, 3));
      geo.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 3));
      geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
      geo.setAttribute('aDemand', new THREE.Float32BufferAttribute(demand, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(line.color) }, uPixelRatio: { value: this.renderer.getPixelRatio() } },
        vertexShader: `attribute vec3 aEnd; attribute float aPhase; attribute float aDemand; uniform float uTime; uniform float uPixelRatio; varying float vAlpha;
          void main(){ float d=distance(position,aEnd); float t=fract(aPhase+uTime*.55/max(d, .5)); vec3 p=mix(position,aEnd,t); p.z+=.08; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.8+3.*sqrt(aDemand))*uPixelRatio*clamp(55./-mv.z,.7,2.); vAlpha=smoothstep(0.,.025,aDemand)*(.35+.65*sqrt(aDemand)); }`,
        fragmentShader: `uniform vec3 uColor; varying float vAlpha; void main(){float r=length(gl_PointCoord-.5)*2.; if(r>1.)discard; gl_FragColor=vec4(mix(uColor,vec3(1.),.28),pow(1.-r,1.3)*vAlpha);}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(geo, mat);
      particles.frustumCulled = false;
      this.scene.add(particles);
      this.particleGroups.push({ line: line.id, particles, refs });
    }
  }

  addStations() {
    const count = this.stations.length;
    this.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: '#caf9e7' }), count);
    this.columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI/2), new THREE.MeshBasicMaterial({ color: '#65c9b0', transparent: true, opacity: .3, depthWrite: false }), count);
    this.scene.add(this.nodes, this.columns);
    this.nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.maxStation = Math.max(...this.stations.map(s => Math.max(...s.entries, ...s.exits)));
    this.selectionRing = new THREE.Mesh(new THREE.RingGeometry(.35,.4,48), new THREE.MeshBasicMaterial({color:'#bfffe3',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));
    this.selectionRing.visible=false;
    this.scene.add(this.selectionRing);
  }

  addLabels() {
    const important = [625, 696, 513, 669, 741, 747, 635, 511, 675, 5595, 743, 6560, 694, 778, 602];
    this.labels = [];
    const root = document.querySelector('#map-labels');
    for (const id of important) {
      const s = this.byId.get(id); if (!s) continue;
      const el = document.createElement('span'); el.className = 'station-label';
      el.textContent = s.name.replace(/ LU$| EL$/, '').replace(' and Monument', '');
      root.append(el); this.labels.push({ station: s, el });
    }
  }

  setData(index, metric, line) {
    this.current = { index, metric, line };
    this.stations.forEach((s, i) => {
      const visible = line === 'all' || s.lines.includes(line);
      const amount = Math.sqrt(s[metric][index] / this.maxStation);
      const radius = visible ? .075 + amount*.23 : .035;
      const height = this.perspective && visible ? amount*4.2+.02 : .01;
      const p = project(s.lon,s.lat,.14);
      this.dummy.position.copy(p); this.dummy.scale.setScalar(radius); this.dummy.updateMatrix(); this.nodes.setMatrixAt(i,this.dummy.matrix);
      this.nodes.setColorAt(i, visible ? mint : new THREE.Color('#34474b'));
      this.dummy.position.set(p.x,p.y,height/2+.07); this.dummy.scale.set(radius*.62,radius*.62,height); this.dummy.updateMatrix(); this.columns.setMatrixAt(i,this.dummy.matrix);
      this.columns.setColorAt(i, visible ? mint : new THREE.Color('#16262b'));
    });
    this.nodes.instanceMatrix.needsUpdate = true; this.nodes.instanceColor.needsUpdate = true;
    this.columns.instanceMatrix.needsUpdate = true; this.columns.instanceColor.needsUpdate = true;
    this.nodes.computeBoundingSphere(); this.columns.computeBoundingSphere();
    for (const [id, route] of this.routes) route.material.opacity = line==='all' ? .42 : line===id ? .85 : .065;
    for (const group of this.particleGroups) {
      group.particles.visible = line==='all' || line===group.line;
      const attr = group.particles.geometry.getAttribute('aDemand');
      group.refs.forEach((link,i)=>attr.setX(i, Math.sqrt(link.values[index]/this.maxLink)));
      attr.needsUpdate=true;
    }
  }

  select(id, focus = false) {
    const station = this.byId.get(id);
    this.selected = station || null;
    this.selectionRing.visible = !!station;
    if (station) {
      const p = project(station.lon,station.lat,.2); this.selectionRing.position.copy(p);
      if (focus) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        offset.setLength(Math.min(offset.length(),38));
        this.controls.target.set(p.x,p.y,0); this.camera.position.copy(this.controls.target).add(offset); this.controls.update();
      }
    }
  }

  bindEvents() {
    let down;
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown', e=>{down=[e.clientX,e.clientY];});
    canvas.addEventListener('pointerup', e=>{
      if (!down || Math.hypot(e.clientX-down[0],e.clientY-down[1])>5 || e.button!==0) return;
      const rect=canvas.getBoundingClientRect();
      this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObject(this.nodes)[0];
      if(hit) this.onSelect(this.stations[hit.instanceId].id);
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault(); document.querySelector('#map-status').hidden=false; document.querySelector('#map-status').textContent='Map graphics paused. Reload to restore the map; station search and data remain available.';});
    document.querySelector('#zoom-in').onclick=()=>this.zoom(.75);
    document.querySelector('#zoom-out').onclick=()=>this.zoom(1.3);
    document.querySelector('#reset-map').onclick=()=>this.reset();
    document.querySelector('#fit-map').onclick=()=>this.reset(true);
    document.querySelector('#toggle-3d').onclick=()=>{
      this.perspective=!this.perspective;
      const distance=this.camera.position.distanceTo(this.controls.target);
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0,this.perspective?-.38:0,this.perspective?.925:1).multiplyScalar(distance));
      this.controls.enableRotate=this.perspective;
      const button=document.querySelector('#toggle-3d'); button.textContent=this.perspective?'3D':'2D';button.setAttribute('aria-pressed',String(this.perspective));
      this.setData(this.current.index,this.current.metric,this.current.line);this.controls.update();
    };
  }

  zoom(factor){const v=this.camera.position.clone().sub(this.controls.target);v.setLength(Math.max(9,Math.min(230,v.length()*factor)));this.camera.position.copy(this.controls.target).add(v);this.controls.update();}
  reset(full=false){this.controls.target.set(full?-25:0,1,0);const distance=full?160:76;this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0,this.perspective?-.38:0,this.perspective?.925:1).multiplyScalar(distance));this.controls.update();}
  onResize(){const {clientWidth:w,clientHeight:h}=this.container;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
  animate(timestamp){
    if(document.hidden || this.container.offsetParent===null){this.lastFrame=timestamp;return;}
    const delta=Math.min((timestamp-this.lastFrame)/1000,.05);this.lastFrame=timestamp;
    if(!this.reduced)this.time+=delta;
    for(const g of this.particleGroups)g.particles.material.uniforms.uTime.value=this.time;
    this.controls.update();
    if(this.selected)this.selectionRing.scale.setScalar(this.reduced?1:1+.12*Math.sin(this.time*2));
    if(timestamp-(this.labelTime||0)>100){
      this.labelTime=timestamp;
      const origin=this.controls.target.clone().project(this.camera);
      const north=this.controls.target.clone().add(new THREE.Vector3(0,1,0)).project(this.camera);
      const bearing=Math.atan2((north.x-origin.x)*this.container.clientWidth,(north.y-origin.y)*this.container.clientHeight)*180/Math.PI;
      document.querySelector('.map-location svg').style.transform=`rotate(${bearing}deg)`;
      const taken=[];
      for(const {station:s,el}of this.labels){
        const p=project(s.lon,s.lat,.4).project(this.camera);
        const x=(p.x*.5+.5)*this.container.clientWidth,y=(-p.y*.5+.5)*this.container.clientHeight;
        const show=Math.abs(p.x)<.95&&Math.abs(p.y)<.83&&p.z<1&&(this.current.line==='all'||s.lines.includes(this.current.line))&&!taken.some(a=>Math.abs(a[0]-x)<85&&Math.abs(a[1]-y)<19);
        el.hidden=!show;if(show){el.style.left=`${x}px`;el.style.top=`${y}px`;taken.push([x,y]);}
      }
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.renderer.setAnimationLoop(null);this.resize.disconnect();this.controls.dispose();this.scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material)for(const m of [].concat(obj.material))m.dispose();});this.renderer.dispose();}
}
