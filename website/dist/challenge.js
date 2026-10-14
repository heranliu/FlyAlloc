import { selectInterval } from './interval.js';
import { findReplayIndex } from './replay-date.js';
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { SoftwareRenderer } from './software-renderer.js';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=n=>n!==null&&n!==undefined&&Number.isFinite(+n),pct=(n,d=2)=>finite(n)?`${n>=0?'+':''}${(n*100).toFixed(d)}%`:'—',num=(n,d=2)=>finite(n)?(+n).toFixed(d):'—';
const isDemo=d=>(d||run)?.dataMode==='synthetic_demo';
const weightText=w=>w>0&&w<.001?'＜0.1%':`${num(w*100,1)}%`;
let fullRun=null,run=null,frameIndex=0,playing=false,playTimer=null,chartType='equity',selectedSymbol=null,flyReady=false;
let scene,camera,renderer,controls,fly,flyRoot,brainGroup,nodePoints,edgeLines,neuralGeometry,edgeGeometry,floorRing,brainScene,brainCamera,brainRenderer,brainControls;
const sceneMaterials=[],stationObjects=[],bones=[],bodyMaterials=[],clock=new THREE.Clock(),targetPosition=new THREE.Vector3(),stage=$('#scene');
const settings={activationScale:1,initialCapital:100000};
let visualTheme={light:false,colors:{}};
const visualTokens=['chart-grid','chart-label','chart-strategy','chart-baseline','chart-crosshair','chart-dot','chart-fill-start','chart-fill-end','scene-fog','scene-ground','scene-ring','scene-tick','scene-marker','scene-marker-emissive','scene-marker-active','scene-marker-active-emissive'];
const themeColor=name=>visualTheme.colors[name];

function updateStationColors(){
 const weights=currentFrame()?.weights||[];
 for(const station of stationObjects){
  const weight=weights[run.symbols.findIndex(s=>s.symbol===station.symbol)]||0;
  const active=station.symbol===selectedSymbol&&weight>.0001;
  station.marker.material.color.set(themeColor(active?'scene-marker-active':'scene-marker'));
  station.marker.material.emissive.set(themeColor(active?'scene-marker-active-emissive':'scene-marker-emissive'));
  station.marker.material.emissiveIntensity=active?.45:.10;
 }
}
function applyVisualTheme(){
 const styles=getComputedStyle(document.documentElement);
 visualTheme={light:document.documentElement.dataset.theme==='light',colors:Object.fromEntries(visualTokens.map(name=>[name,styles.getPropertyValue('--'+name).trim()]))};
 if(scene?.fog)scene.fog.color.set(themeColor('scene-fog'));
 for(const binding of sceneMaterials)binding.material.color.set(themeColor(binding.token));
 if(nodePoints){
  nodePoints.material.uniforms.uLightTheme.value=visualTheme.light?1:0;
  nodePoints.material.blending=visualTheme.light?THREE.NormalBlending:THREE.AdditiveBlending;
  nodePoints.material.needsUpdate=true;
 }
 if(edgeLines){
  edgeLines.material.blending=visualTheme.light?THREE.NormalBlending:THREE.AdditiveBlending;
  edgeLines.material.opacity=visualTheme.light?.48:.32;
  edgeLines.material.needsUpdate=true;
 }
 renderer?.setTheme?.(visualTheme.light?'light':'dark');
 brainRenderer?.setTheme?.(visualTheme.light?'light':'dark');
 updateStationColors();
 drawCurve();
}

const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;let motionTime=0,lastRenderTime=0;

function fail(message){$('#scene-error').hidden=false;$('#scene-error').textContent=message;$('#scene-loading').style.display='none';}
function initScene(){try{renderer=new THREE.WebGLRenderer({canvas:$('#fly-canvas'),alpha:true,antialias:true,powerPreference:'high-performance'});}catch(error){renderer=new SoftwareRenderer({canvas:$('#fly-canvas')});}$('#fly-canvas').dataset.renderer=renderer.isSoftware?'software-3d':'webgl';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x111a15,.018);camera=new THREE.PerspectiveCamera(36,1,.1,80);camera.position.set(8,9,12);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.5,0);controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=8;controls.maxDistance=27;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.2;controls.enablePan=false;
 scene.add(new THREE.HemisphereLight(0xe6ffe0,0x243323,3));const key=new THREE.DirectionalLight(0xfff1d4,4);key.position.set(-4,9,7);scene.add(key);const rim=new THREE.DirectionalLight(0x9fffcd,2);rim.position.set(6,5,-8);scene.add(rim);const fill=new THREE.PointLight(0xffb75a,15,20);fill.position.set(-5,4,-4);scene.add(fill);
 const ground=new THREE.Mesh(new THREE.CircleGeometry(6.1,96),new THREE.MeshStandardMaterial({color:0x1c2b20,roughness:1,metalness:0}));ground.rotation.x=-Math.PI/2;ground.position.y=-.055;scene.add(ground);const outer=new THREE.Mesh(new THREE.RingGeometry(5.78,5.81,100),new THREE.MeshBasicMaterial({color:0x49633e,transparent:true,opacity:.46,side:THREE.DoubleSide}));outer.rotation.x=-Math.PI/2;outer.position.y=-.03;scene.add(outer);const mid=new THREE.Mesh(new THREE.RingGeometry(2.32,2.34,100),new THREE.MeshBasicMaterial({color:0x426338,transparent:true,opacity:.25,side:THREE.DoubleSide}));mid.rotation.x=-Math.PI/2;scene.add(mid);const positions=[];for(let i=0;i<64;i++){const angle=i/64*Math.PI*2;positions.push(Math.cos(angle)*4.05,.005,Math.sin(angle)*4.05,Math.cos(angle)*4.13,.005,Math.sin(angle)*4.13)}const ticks=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color:0x4a6842,transparent:true,opacity:.4}));scene.add(ticks);sceneMaterials.push({material:ground.material,token:'scene-ground'},{material:outer.material,token:'scene-ring'},{material:mid.material,token:'scene-ring'},{material:ticks.material,token:'scene-tick'});
 flyRoot=new THREE.Group();flyRoot.position.y=.16;scene.add(flyRoot);initBrainScene();applyVisualTheme();resize();new ResizeObserver(resize).observe(stage);new ResizeObserver(resize).observe($('#brain-scene'));renderer.setAnimationLoop(animate);
 const modelPromise=renderer.isSoftware?loadSoftwareFly():new Promise((resolve,reject)=>new GLTFLoader().load('./assets/fly.glb',gltf=>resolve(gltf.scene),undefined,reject)).catch(error=>{renderer.fallbackGeometry=true;return loadSoftwareFly();});return modelPromise.then(model=>{fly=model;fly.scale.setScalar(.94);flyRoot.add(fly);fly.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{bodyMaterials.push({material:m,opacity:m.opacity,transparent:m.transparent});m.side=THREE.DoubleSide;});}if((o.isBone||renderer.isSoftware||renderer.fallbackGeometry)&&/wing_|coxa_|femur_|tibia_/.test(o.name)&&!o.name.startsWith('mesh_'))bones.push({bone:o,base:o.quaternion.clone(),phase:o.name.includes('left')?0:Math.PI,wing:o.name.includes('wing')});});flyReady=true;if(renderer.isSoftware)$('#fly-canvas').setAttribute('aria-label','兼容模式：真实果蝇几何的可旋转三维投影与神经活动');});}
function initBrainScene(){const canvas=$('#brain-canvas');try{brainRenderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});}catch(error){brainRenderer=new SoftwareRenderer({canvas});}canvas.dataset.renderer=brainRenderer.isSoftware?'software-3d':'webgl';brainRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));brainScene=new THREE.Scene();brainCamera=new THREE.PerspectiveCamera(38,1,.1,50);brainCamera.position.set(0,.4,4.2);brainControls=new OrbitControls(brainCamera,canvas);brainControls.enableDamping=true;brainControls.enablePan=false;brainControls.minDistance=2.6;brainControls.maxDistance=8;brainGroup=new THREE.Group();brainScene.add(brainGroup);}
function resize(){if(renderer){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<600?48:36;camera.updateProjectionMatrix();}if(brainRenderer){const box=$('#brain-scene'),w=box.clientWidth,h=box.clientHeight;brainRenderer.setSize(w,h,false);brainCamera.aspect=w/h;brainCamera.updateProjectionMatrix();}drawCurve();}
function resetCamera(){if(!camera)return;camera.position.set(8,9,12);controls.target.set(0,.5,0);controls.update();}
function makeNetwork(graph){if(nodePoints){brainGroup.remove(nodePoints,edgeLines);neuralGeometry.dispose();edgeGeometry.dispose();}const nodes=graph.nodes||[],allEdges=graph.edges||[],edges=allEdges.slice().sort((a,b)=>Math.abs(b.reservoir_weight??b.weight??b.synapses??1)-Math.abs(a.reservoir_weight??a.weight??a.synapses??1)).slice(0,512),ids=new Map(nodes.map((n,i)=>[String(n.id),i]));const pos=[];nodes.forEach((n,i)=>{const y=1-2*(i+.5)/nodes.length,r=Math.sqrt(1-y*y),a=i*2.399963;pos.push(Math.cos(a)*r*1.1,y*.8,Math.sin(a)*r*.75)});neuralGeometry=new THREE.BufferGeometry();neuralGeometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));neuralGeometry.setAttribute('activation',new THREE.Float32BufferAttribute(nodes.map(()=>0),1));const nodeMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,uniforms:{uLightTheme:{value:0},uTime:{value:0},uViewScale:{value:.55},uScale:{value:1},uPixel:{value:brainRenderer.getPixelRatio()}},vertexShader:`attribute float activation;varying float v;uniform float uScale;uniform float uPixel;uniform float uTime;uniform float uViewScale;void main(){v=min(abs(activation)/max(uScale,0.00001),1.0);vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=(4.0+v*15.0)*(8.0/-p.z)*uPixel*uViewScale*(1.0+.13*v*sin(uTime*4.0+position.x*13.0));}`,fragmentShader:`precision mediump float;varying float v;uniform float uLightTheme;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;vec3 col=v<.35?mix(vec3(.03,.08,.15),vec3(.10,.22,1.),v/.35):v<.7?mix(vec3(.18,.16,1.),vec3(1.,.10,.18),(v-.35)/.35):mix(vec3(1.,.13,.08),vec3(1.,.93,.30),(v-.7)/.3);vec3 lightCol=v<.35?mix(vec3(.15,.25,.40),vec3(.12,.25,.85),v/.35):v<.7?mix(vec3(.30,.15,.78),vec3(.78,.08,.22),(v-.35)/.35):mix(vec3(.80,.10,.08),vec3(.70,.36,.02),(v-.7)/.3);col=mix(col,lightCol,uLightTheme);float a=(1.-smoothstep(.08,.5,d))*(.45+v*.55);gl_FragColor=vec4(col,a);}`});nodePoints=new THREE.Points(neuralGeometry,nodeMat);brainGroup.add(nodePoints);const ep=[],ei=[];for(const e of edges){const si=ids.get(String(e.source)),ti=ids.get(String(e.target));if(si===undefined||ti===undefined)continue;ep.push(...pos.slice(si*3,si*3+3),...pos.slice(ti*3,ti*3+3));ei.push(si,ti)}edgeGeometry=new THREE.BufferGeometry();edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ep,3));edgeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(ep.map(()=>0),3));edgeLines=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));edgeLines.userData.indices=ei;brainGroup.add(edgeLines);$('#graph-facts').textContent=`${nodes.length} 节点 · ${allEdges.length.toLocaleString()} 条连接 · 显示 ${edges.length} 条`;applyVisualTheme();}
function setActivation(state){if(!nodePoints)return;const values=state?.values||[],map=state?.nodeIds?new Map(state.nodeIds.map((id,i)=>[String(id),values[i]])):null;const a=neuralGeometry.attributes.activation;for(let i=0;i<a.count;i++)a.array[i]=finite(map?map.get(String(run.graph.nodes[i].id)):values[i])?+(map?map.get(String(run.graph.nodes[i].id)):values[i]):0;a.needsUpdate=true;nodePoints.material.uniforms.uScale.value=settings.activationScale;const color=edgeGeometry.attributes.color,indices=edgeLines.userData.indices;const c=new THREE.Color();for(let i=0;i<indices.length;i++){const v=Math.min(1,Math.abs(a.array[indices[i]])/settings.activationScale);c.setRGB(.05+v*.85,.08+v*.30,.16+(1-v)*.24);color.setXYZ(i,c.r,c.g,c.b)}color.needsUpdate=true;$('#state-date').textContent=state?`${state.date||currentFrame().decisionDate}${isDemo()?' · 人工数值':''}`:'无状态记录';}
function buildStations(symbols){$('#stock-stations').innerHTML='';for(const o of stationObjects){scene.remove(o.marker);o.marker.geometry.dispose();o.marker.material.dispose()}stationObjects.length=0;symbols.forEach((s,i)=>{const a=i/symbols.length*Math.PI*2+.3,position=new THREE.Vector3(Math.cos(a)*4.8,.15,Math.sin(a)*4.8),marker=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.06,36),new THREE.MeshStandardMaterial({color:0x3c5031,roughness:.7,emissive:0x23381d,emissiveIntensity:.25}));marker.position.copy(position);marker.position.y=.02;scene.add(marker);const div=document.createElement('button');div.className='station';div.style.cssText='border:0;background:none;padding:0';div.innerHTML=`<div class="station-icon">${esc(s.icon||'◈')}</div><div class="station-name">${esc(s.name||s.symbol)}</div><div class="station-ticker">${esc(s.symbol)}</div><div class="station-weight"></div>`;div.setAttribute('aria-label',`${s.name||s.symbol}，查看配置`);div.onclick=()=>{selectedSymbol=s.symbol;updateFrame(frameIndex,false)};$('#stock-stations').appendChild(div);stationObjects.push({symbol:s.symbol,info:s,position,marker,el:div});});}
function currentFrame(){return run?.frames[frameIndex];}
function updateFrame(i,move=true){if(!run)return;frameIndex=Math.max(0,Math.min(run.frames.length-1,i));const f=currentFrame(),weights=f.weights||[];const ordered=run.symbols.map((s,j)=>({...s,weight:weights[j]||0,index:j})).sort((a,b)=>b.weight-a.weight),held=ordered.filter(s=>s.weight>.0001);if(!selectedSymbol||!run.symbols.some(s=>s.symbol===selectedSymbol))selectedSymbol=held[0]?.symbol||run.symbols[0]?.symbol;if(move&&held[0])selectedSymbol=held[0].symbol;const top=held[0],station=stationObjects.find(s=>s.symbol===top?.symbol);if(station)targetPosition.copy(station.position).multiplyScalar(.40);else targetPosition.set(0,0,0);targetPosition.y=.16;
 $('#date-feedback').textContent='';$('#timeline').value=frameIndex;$('#replay-date').value=f.decisionDate;$('#step-number').textContent=`${frameIndex+1} / ${run.frames.length}`;$('#decision-date').textContent=f.decisionDate;$('#playback-date').textContent=f.decisionDate;$('#choice-count').textContent=`${held.length} 只`;$('#cash-weight').textContent=`${num((f.cashWeight??1-weights.reduce((a,b)=>a+b,0))*100,1)}%`;$('#allocation-list').innerHTML=held.length?held.map(s=>`<div class="allocation-item"><span class="sector-icon">${esc(s.icon||'◈')}</span><div><strong>${esc(s.name||s.symbol)}</strong><small>${esc(s.symbol)} · ${esc(s.sector||'')}</small></div><span class="weight">${weightText(s.weight)}</span><div class="weight-bar"><i style="width:${Math.min(100,s.weight*100)}%"></i></div></div>`).join(''):'<p class="empty">无股票持仓</p>';
 $('#decision-headline').textContent=top?`${isDemo()?'示例配置':'主要持仓'} · ${top.name||top.symbol}`:isDemo()?'示例现金':'现金持仓';$('#decision-short').textContent=`入场 ${f.entryDate||'—'} · 估值 ${f.valuationDate||'—'}`;$('#decision-kind').textContent=isDemo()?(f.rebalanceScheduled?'示例调配':'示例持有'):(f.rebalanceScheduled?'调仓日':'持有日');
 stationObjects.forEach(o=>{const j=run.symbols.findIndex(s=>s.symbol===o.symbol),w=weights[j]||0;o.el.classList.toggle('active',o.symbol===selectedSymbol&&w>.0001);o.el.classList.toggle('inactive',w<=.0001);o.el.querySelector('.station-weight').textContent=w>.0001?weightText(w):'';});updateStationColors();
 const states=f.states||[],state=run.stateScope==='joint_portfolio'?states.find(s=>s.symbol==='portfolio'):states.find(s=>s.symbol===selectedSymbol)||states.find(s=>s.symbol==='mean')||null;setActivation(state);drawCurve();}
function animate(){const elapsed=clock.getElapsedTime();if(!renderer||elapsed-lastRenderTime<(renderer.isSoftware?1/18:1/30))return;const delta=elapsed-lastRenderTime;lastRenderTime=elapsed;if(playing&&!reducedMotion)motionTime+=delta;controls.update();const distance=flyRoot.position.distanceTo(targetPosition);if(reducedMotion)flyRoot.position.copy(targetPosition);else flyRoot.position.lerp(targetPosition,.045);if(distance>.03){const dx=targetPosition.x-flyRoot.position.x,dz=targetPosition.z-flyRoot.position.z,angle=Math.atan2(dz,-dx);let d=(angle-flyRoot.rotation.y+Math.PI*3)%(Math.PI*2)-Math.PI;flyRoot.rotation.y+=d*.045;}if(flyReady&&!reducedMotion){bones.forEach(({bone,base,phase,wing})=>{bone.quaternion.copy(base);const q=new THREE.Quaternion();if(wing)q.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(elapsed*(distance>.09?29:5)+phase)*(distance>.09?.10:playing?.025:0));else q.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.sin(elapsed*8+phase+(bone.name.includes('T2')?Math.PI:0))*(distance>.04?.16:playing?.006:0));bone.quaternion.multiply(q)});flyRoot.position.y=.16+(distance>.09?Math.sin(elapsed*8)*.03:0);}
 if(brainControls)brainControls.update();if(nodePoints){nodePoints.material.uniforms.uTime.value=motionTime;nodePoints.material.uniforms.uViewScale.value=.65;}
 for(const o of stationObjects){const p=o.position.clone();p.y=.62;p.project(camera);o.el.style.left=`${(p.x*.5+.5)*stage.clientWidth}px`;o.el.style.top=`${(-p.y*.5+.5)*stage.clientHeight}px`;o.el.style.visibility=p.z>1?'hidden':'visible';}
 renderer.render(scene,camera);if(brainRenderer)brainRenderer.render(brainScene,brainCamera);}
function syncPlaybackControls(){const label=playing?'暂停':'播放';for(const id of ['#play-button','#stage-play']){const button=$(id);button.textContent=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(playing));}}
function stop(){playing=false;clearTimeout(playTimer);syncPlaybackControls();}
function playStep(){if(!playing)return;if(frameIndex>=run.frames.length-1){stop();return}updateFrame(frameIndex+1);playTimer=setTimeout(playStep,+$('#play-speed').value);}
function drawCurve(){
 const canvas=$('#equity-chart');if(!canvas||!run)return;
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,1.5);if(!w||!h)return;
 canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);
 const pad={left:48,right:14,top:17,bottom:24};
 const a=[0,...run.frames.map(f=>chartType==='equity'?f.equity/settings.initialCapital-1:f.drawdown)];
 const b=[0,...run.frames.map(f=>chartType==='equity'?f.baselineEquity/(run.baselineInitialCapital||settings.initialCapital)-1:f.baselineDrawdown)];
 const valid=[...a,...b].filter(Number.isFinite);let lo=Math.min(0,...valid),hi=Math.max(0,...valid);if(lo===hi)hi+=.01;
 const range=hi-lo;lo-=range*.08;hi+=range*.10;
 const x=i=>pad.left+i/Math.max(1,a.length-1)*(w-pad.left-pad.right),y=v=>pad.top+(hi-v)/(hi-lo)*(h-pad.top-pad.bottom);
 c.font='11px FlyMono,monospace';c.textAlign='right';
 for(let i=0;i<4;i++){
  const v=lo+(hi-lo)*i/3,yy=y(v);c.strokeStyle=themeColor('chart-grid');c.setLineDash([2,5]);
  c.beginPath();c.moveTo(pad.left,yy);c.lineTo(w-pad.right,yy);c.stroke();
  c.fillStyle=themeColor('chart-label');c.fillText(`${(v*100).toFixed(0)}%`,pad.left-9,yy+4);
 }
 c.setLineDash([]);const g=c.createLinearGradient(0,pad.top,0,h-pad.bottom);
 g.addColorStop(0,themeColor('chart-fill-start'));g.addColorStop(1,themeColor('chart-fill-end'));
 c.fillStyle=g;c.beginPath();a.forEach((v,i)=>i?c.lineTo(x(i),y(v)):c.moveTo(x(i),y(v)));
 c.lineTo(x(a.length-1),h-pad.bottom);c.lineTo(x(0),h-pad.bottom);c.closePath();c.fill();
 for(const [values,color,dash,width]of [[b,themeColor('chart-baseline'),[4,4],1.3],[a,themeColor('chart-strategy'),[],2]]){
  c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();
  values.forEach((v,i)=>i?c.lineTo(x(i),y(v)):c.moveTo(x(i),y(v)));c.stroke();
 }
 c.setLineDash([]);c.strokeStyle=themeColor('chart-crosshair');c.beginPath();c.moveTo(x(frameIndex+1),pad.top);c.lineTo(x(frameIndex+1),h-pad.bottom);c.stroke();
 c.fillStyle=themeColor('chart-dot');c.beginPath();c.arc(x(frameIndex+1),y(a[frameIndex+1]),3.3,0,Math.PI*2);c.fill();
 c.fillStyle=themeColor('chart-label');c.textAlign='left';c.fillText(run.period.entryStart,x(0),h-4);c.textAlign='right';c.fillText(run.frames.at(-1).valuationDate,w-pad.right,h-4);
 $('#chart-period').textContent=`${isDemo()?'示例日期':'估值'} ${currentFrame().valuationDate}`;
 $('#initial-capital').textContent=isDemo()?(chartType==='equity'?'示例累计变化':'相对示例峰值'):(chartType==='equity'?'区间累计收益':'相对区间峰值');
}
function applyInterval(autoPlay){try{
 stop();run=selectInterval(fullRun,$('#interval-start').value,$('#interval-end').value);settings.initialCapital=run.initialCapital;
 $('#fly-return').classList.remove('pending-score');$('#fly-return').classList.toggle('loss',run.metrics.totalReturn<0);
 $('#fly-return').innerHTML=`${run.metrics.totalReturn>=0?'+':''}${num(run.metrics.totalReturn*100,2)}<span>%</span>`;
 $('#score-eyebrow-text').textContent=isDemo()?'合成区间变化':'区间收益';$('#baseline-label').textContent=isDemo()?'虚构资产买持示例':'七股买入持有';
 $('#period-label').textContent=`${run.period.entryStart} — ${run.period.valuationEnd}`;
 $('#baseline-return').textContent=pct(run.metrics.baselineReturn);$('#max-drawdown').textContent=pct(run.metrics.maxDrawdown);$('#mean-exposure').textContent=`${num(run.metrics.meanExposure*100,1)}%`;
 $('#allocation-context').textContent=isDemo()?'人工配置':'入场持仓';$('#cash-label').textContent=isDemo()?'示例现金':'现金';$('#curve-title').textContent=isDemo()?'合成曲线':'收益与回撤';
 $('#timeline').max=run.frames.length-1;$('#replay-date').min=run.frames[0].decisionDate;$('#replay-date').max=run.frames.at(-1).decisionDate;
 $('#start-date').textContent=run.frames[0].decisionDate;$('#end-date').textContent=run.frames.at(-1).decisionDate;
 $('#interval-feedback').textContent=run.period.entryStart!==$('#interval-start').value||run.period.valuationEnd!==$('#interval-end').value?`有效区间 ${run.period.entryStart} — ${run.period.valuationEnd}`:'';
 updateFrame(0);if(autoPlay)beginPlayback();return true;
 }catch(error){$('#interval-feedback').textContent=error.message;return false;}}
function beginPlayback(){if(!run)return;if(frameIndex===run.frames.length-1)updateFrame(0);playing=true;syncPlaybackControls();playTimer=setTimeout(playStep,+$('#play-speed').value);}
function validateRun(d){
 if(!d||!Array.isArray(d.frames)||!d.frames.length||!d.graph?.nodes?.length||!d.symbols?.length)throw Error('数据尚未完整载入');
 if(isDemo(d)){
  if(d.synthetic!==true||d.modelInference!==false||d.accountingStatus!=='synthetic_demo'||d.strategy?.directNeural!==false||d.strategy?.online!==false||!d.symbols.every(s=>/^DEMO_[A-G]$/.test(s.symbol)))throw Error('合成演示标记不完整');
 }else if(d.accountingStatus!=='corrected_adjusted_proxy'||d.strategy?.online!==false||d.strategy?.directNeural!==true||d.synthetic===true||d.modelInference===false)throw Error('当前记录不是固定参数研究模拟');
 if(d.strategy.maleCnsAssociated!==true)throw Error('当前记录缺少 MaleCNS 关联标记');
 if(!finite(d.metrics?.totalReturn)||!finite(d.initialCapital)||d.initialCapital<=0)throw Error('记录缺少必要的数值字段');
 if(!d.frames.every(f=>finite(f.equity)&&finite(f.baselineEquity)&&Array.isArray(f.weights)&&f.weights.length===d.symbols.length))throw Error('回放记录不完整');
 if(Math.abs(d.frames.at(-1).equity/d.initialCapital-1-d.metrics.totalReturn)>1e-7)throw Error('收益与净值记录不一致');
 return d;
}
async function loadRun(){
 const response=await fetch('./static-data.json');
 if(response.status===404){
  const demoResponse=await fetch('./demo-data.json');
  if(!demoResponse.ok)throw Error(`合成演示载入失败（HTTP ${demoResponse.status}）`);
  const demo=validateRun(await demoResponse.json());if(!isDemo(demo))throw Error('演示文件缺少合成标记');return demo;
 }
 if(!response.ok)throw Error(`本地研究记录载入失败（HTTP ${response.status}）；未切换演示数据`);
 const research=validateRun(await response.json());if(isDemo(research))throw Error('本地研究文件不能伪装为合成演示');return research;
}
function configureDataMode(){
 const demo=isDemo();$('#data-mode-banner').hidden=!demo;
 $('#data-mode-banner').textContent=demo?'合成演示 · 7 项虚构资产，配置、收益和活动均由算式生成；不是模型推理输出或研究结果。':'';
 $('#strategy-label').textContent=demo?'人工配置':'模型';$('#neural-title').textContent=demo?'人工活动示意':'神经活动';
 $('#baseline-metric-label').textContent=demo?'参照变化':'基准收益';$('#drawdown-label').textContent=demo?'示例回撤':'最大回撤';$('#exposure-label').textContent=demo?'示例资产占比':'平均股票仓位';
 $('#equity-chart').setAttribute('aria-label',demo?'纯合成的人工配置与虚构资产参照曲线，不是模型表现':'复权价格研究模拟的收益与基准曲线');
 $('#brain-canvas').setAttribute('aria-label',demo?'真实连接组图上的人工活动，非模型推理输出':'可旋转的组合神经状态，布局为示意');
 $('#method-model').textContent=demo?'演示。7 项资产均为虚构；配置、收益与活动由固定算式独立生成，未加载或运行交易模型。连接图来自真实公开 MaleCNS 聚合图（CC BY 4.0），图上活动与身体动作仅为人工示意。':'模型。MaleCNS 连接组启发的简化神经网络，双随机种子固定训练至 2024 年；每 5 个交易日调仓，收盘决策、次日开盘模拟执行。神经颜色来自组合状态，空间布局与身体动作仅为示意。';
 $('#method-accounting').textContent=demo?'示例记账。按虚构资产的人工变化与每边 5bp 示例成本计算，以七项虚构资产买入持有作参照。日期为工作日占位，不是交易所日历；区间切片继承示例余额，所有数值仅用于界面演示。':'记账。使用复权价格与可分割代理单位，每边交易成本 5bp，以七股买入持有为基准；自选区间继承原账本仓位与记忆。基准与模型的股票仓位不同，收益差不等同于风险调整超额收益。';
 $('#method-scope').textContent=demo?'范围。这些合成曲线不是研究结果、实际市场收益或模型能力证据，不用于投资决策。下载文件同样是合成示例，可用公开生成脚本复现。':'范围。这是已用于研究的历史模拟，不是经核验的实盘或总回报记录，也不下真实订单；结果不保证未来表现，不构成投资建议。';
 $('#download-run').href=demo?'./demo-data.json':'./static-raw.json';$('#download-run').textContent=demo?'下载合成演示 · JSON ↗':'下载研究记录 · JSON ↗';
 $('#data-footer').textContent=demo?'FlyAlloc · Synthetic interface demonstration':'FlyAlloc · Historical simulation';
}
async function start(){try{
 let sceneFailure=null;const modelPromise=Promise.resolve().then(initScene).catch(error=>{sceneFailure=error;});
 const url=new URL(location.href);for(const name of ['strategy','fold','run'])url.searchParams.delete(name);if(url.href!==location.href)history.replaceState(null,'',url.pathname+url.search+url.hash);
 fullRun=await loadRun();run=fullRun;configureDataMode();
 settings.activationScale=run.activationScale||1;
 for(const id of ['#interval-start','#interval-end']){$(id).min=run.period.entryStart;$(id).max=run.period.valuationEnd;}$('#interval-start').value=run.defaultPeriodStart||run.period.entryStart;$('#interval-end').value=run.period.valuationEnd;
 $('#asset-credit').innerHTML='连接组：MaleCNS v1.0 / FlyEM、HHMI Janelia、Cambridge、MRC LMB、Google Research · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>。<a href="demo-graph.json">公开聚合图与修改说明</a>。三维资产：FlyBody / Google DeepMind / HHMI Janelia · Apache 2.0。<a href="assets/PROVENANCE.txt">来源</a><a href="assets/flybody-LICENSE">许可证</a>';
 await modelPromise;if(renderer){buildStations(run.symbols);makeNetwork(run.graph);}if(sceneFailure)fail('三维模型加载失败，数据与日期回放仍可使用。');$('#scene-loading').style.display='none';
 for(const selector of ['#play-button','#stage-play','#timeline','#next-step','#replay-date','#interval-start','#interval-end','#start-trading'])$(selector).disabled=false;
 if(!applyInterval(false))throw Error($('#interval-feedback').textContent);registerTools();
 }catch(e){console.error(e);fail(e.message||'三维场景载入失败。请使用支持 WebGL 的浏览器。');}}
function registerTools(){if(!document.modelContext?.registerTool)return;const controller=new AbortController();try{Promise.resolve(document.modelContext.registerTool({name:'select_fly_decision',title:'查看历史决策',description:'View an interface frame. Returned dataMode identifies synthetic examples versus research replay. Never places trades.',inputSchema:{type:'object',properties:{date:{type:'string'}},required:['date'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute({date}){const i=run.frames.findIndex(f=>f.decisionDate===date);if(i<0)throw Error('没有该日期的决策记录');stop();updateFrame(i);return{dataMode:isDemo()?'synthetic_demo':'research_replay',modelInference:!isDemo(),date:currentFrame().decisionDate,weights:currentFrame().weights,cashWeight:currentFrame().cashWeight}}},{signal:controller.signal})).catch(console.warn)}catch(e){console.warn(e)}window.addEventListener('pagehide',()=>controller.abort(),{once:true});}
$('#play-button').onclick=()=>{if(!run)return;if(playing){stop();return}beginPlayback()};$('#stage-play').onclick=()=>$('#play-button').click();$('#next-step').onclick=()=>{stop();updateFrame(frameIndex+1)};$('#timeline').oninput=e=>{stop();updateFrame(+e.target.value)};$('#reset-camera').onclick=resetCamera;$('#reset-brain').onclick=()=>{brainCamera.position.set(0,.4,4.2);brainControls.target.set(0,0,0);brainControls.update()};document.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>{chartType=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(t=>t.classList.toggle('active',t===b));drawCurve()});
$('#interval-form').onsubmit=e=>{e.preventDefault();applyInterval(false)};
$('#replay-date').onchange=e=>{if(!run)return;stop();const date=e.target.value;if(!date)return;const i=findReplayIndex(run.frames,date);if(i<0)return;updateFrame(i);$('#date-feedback').textContent=run.frames[i].decisionDate===date?'':`该日无决策，显示 ${run.frames[i].decisionDate}`};
window.addEventListener('flyalloc-theme-change',applyVisualTheme);
applyVisualTheme();
start();

async function loadSoftwareFly(){const response=await fetch('./assets/fly-cpu.json');if(!response.ok)throw Error('兼容三维模型载入失败');const source=await response.json(),group=new THREE.Group(),parts=new Map();for(const part of source.parts){const name=part.name,pivot=new THREE.Vector3(...part.pivot);let parent=parts.get(name);if(!parent){parent=new THREE.Group();parent.name=name;parent.position.copy(pivot);group.add(parent);parts.set(name,parent);}const positions=part.positions.slice();for(let i=0;i<positions.length;i+=3){positions[i]-=pivot.x;positions[i+1]-=pivot.y;positions[i+2]-=pivot.z;}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(part.indices);geometry.computeVertexNormals();const rgba=part.color,material=new THREE.MeshStandardMaterial({color:new THREE.Color(rgba[0],rgba[1],rgba[2]),transparent:rgba[3]<1,opacity:rgba[3],side:THREE.DoubleSide,roughness:.8});const mesh=new THREE.Mesh(geometry,material);mesh.name='mesh_'+name;parent.add(mesh);}return group;}
