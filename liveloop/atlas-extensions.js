// The atlas extensions already running in the LiveLoop world (Project 83,
// state 128): the computer section, its monitor output and the print tools.
// Kept verbatim so the wrapper can carry them forward unchanged next to the
// Mondo floor. Classic script: these are plain top-level functions.

function installAtlasComputers(){
 const A=window.app,R=window.RareAtlasInteractive;
 if(!A?.world||!R)throw new Error("The existing atlas must be running.");
 window.RareAtlasWorkstations?.dispose();
 const {THREE}=window.AskSary3D,w=A.world,canvas=w.renderer.domElement;
 const resources=[],off=[],stations=[],state={seat:null,raf:0,last:0,disposed:false,near:null};
 const own=x=>(resources.push(x),x);
 const on=(el,k,fn,opt)=>{el.addEventListener(k,fn,opt);off.push(()=>el.removeEventListener(k,fn,opt));};
 const root=new THREE.Group();root.name="Atlas computer seating area";w.scene.add(root);
 const box=own(new THREE.BoxGeometry(1,1,1)),plane=own(new THREE.PlaneGeometry(1,1));
 const mat=(color,extra={})=>own(new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.12,...extra}));
 const wood=mat("#263f4b"),metal=mat("#71858a",{metalness:.75,roughness:.35}),black=mat("#0b1823"),fabric=mat("#63828a",{roughness:.95}),rug=mat("#233b49",{roughness:1});
 const mesh=(parent,g,m,x,y,z,sx,sy,sz)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;};
 const cube=(p,m,x,y,z,sx,sy,sz)=>mesh(p,box,m,x,y,z,sx,sy,sz);
 cube(root,rug,0,.021,11.55,10,.025,4.3);
 const makeScreen=number=>{
  const c=document.createElement("canvas");c.width=768;c.height=480;const ctx=c.getContext("2d");
  ctx.fillStyle="#0b202e";ctx.fillRect(0,0,768,480);ctx.fillStyle="#c7e6ef";ctx.font="36px Georgia";ctx.fillText("Rare Atlas",40,63);
  ctx.fillStyle="#9fbdcd";ctx.font="17px sans-serif";ctx.fillText("RESEARCH DIRECTORY  /  TERMINAL "+number,40,103);
  ctx.strokeStyle="#466777";ctx.beginPath();ctx.moveTo(40,123);ctx.lineTo(728,123);ctx.stroke();
  ["Genes & mechanisms","Conditions & phenotypes","Studies & registries","Communities & models"].forEach((t,i)=>{ctx.fillStyle=i===0?"#214554":"#142f40";ctx.fillRect(40,150+i*53,688,40);ctx.fillStyle="#c0d9e5";ctx.font="22px sans-serif";ctx.fillText(t,59,177+i*53);ctx.fillText("›",691,177+i*53);});
  ctx.fillStyle="#e0cea4";ctx.font="17px sans-serif";ctx.fillText("SYNTHETIC CASE · USER NOTES UNVERIFIED",40,405);ctx.fillStyle="#92bccc";ctx.fillText("Walk up · E / Enter to sit",40,448);
  const tx=own(new THREE.CanvasTexture(c));tx.colorSpace=THREE.SRGBColorSpace;return own(new THREE.MeshBasicMaterial({map:tx,toneMapped:false}));
 };
 for(let i=0;i<4;i++){
  const group=new THREE.Group();group.position.set((i-1.5)*2.5,0,11);root.add(group);
  cube(group,wood,0,.95,0,1.95,.12,.88);
  for(const x of [-.84,.84])for(const z of [-.32,.32])cube(group,metal,x,.44,z,.055,.88,.055);
  cube(group,black,0,1.43,-.22,1.28,.81,.085);mesh(group,plane,makeScreen(i+1),0,1.43,-.172,1.19,.72,1);
  cube(group,metal,0,1.08,-.23,.065,.20,.06);cube(group,metal,0,1.018,-.21,.38,.026,.25);cube(group,black,-.12,1.023,.23,.69,.033,.22);
  for(let row=0;row<3;row++)cube(group,metal,-.12,1.043,.17+row*.052,.61,.005,.014);
  cube(group,metal,.47,1.035,.25,.08,.035,.13);cube(group,black,.73,.42,-.12,.24,.70,.45);
  cube(group,fabric,0,.48,1.12,.57,.13,.56);cube(group,fabric,0,.84,1.37,.57,.64,.11);
  for(const x of [-.25,.25])for(const z of [.90,1.34])cube(group,metal,x,.21,z,.042,.42,.042);
  for(const x of [-.32,.32]){cube(group,metal,x,.65,1.14,.035,.28,.035);cube(group,wood,x,.78,1.08,.09,.045,.40);}
  const light=new THREE.PointLight("#9fd2df",1.2,3,2);light.position.set(0,1.7,-.05);group.add(light);
  stations.push({number:i+1,group,x:group.position.x,z:11});
 }
 const ui=document.getElementById("rai-ui");
 if(!ui){root.removeFromParent();resources.forEach(r=>r.dispose());throw new Error("Existing atlas controls were not found.");}
 const style=document.createElement("style");
 style.textContent=`
#rac-directory{position:absolute;left:50%;top:80px;bottom:78px;transform:translateX(-50%);width:min(730px,calc(100% - 40px));pointer-events:auto;background:#0b1e2cf5;border:1px solid #8ab8c755;border-radius:14px;display:flex;flex-direction:column;box-shadow:0 20px 70px #0008}
#rac-directory[hidden],#rac-dock[hidden],#rac-hint[hidden]{display:none!important}
#rac-directory header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #a4c8da30;gap:8px}
#rac-directory strong{font:20px Georgia,serif}#rac-directory small{color:#acbac4;font-size:10px}
#rac-directory .rac-tools{display:flex;gap:8px;padding:9px 13px}#rac-directory input{width:100%}
#rac-directory .rac-content{display:grid;grid-template-columns:1fr 1fr;flex:1;min-height:0}
#rac-list{overflow:auto;padding:0 10px 12px;scrollbar-width:thin}
#rac-list button{display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px}
#rac-list small{display:block;margin-top:2px}#rac-detail{padding:10px 16px;overflow:auto;border-left:1px solid #a4c8da30}
#rac-detail h2{font:24px Georgia,serif;margin:0 0 12px}#rac-detail p{color:#c2d7e2;font-size:12px;overflow-wrap:anywhere}
#rac-detail button{margin-top:10px}#rac-directory footer{padding:6px 13px;border-top:1px solid #a4c8da30;color:#d8c699;font-size:10px}
#rac-dock,#rac-hint{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#0b2030ef;border:1px solid #99c9dc55;border-radius:9px;padding:8px 12px;pointer-events:auto;white-space:nowrap}
#rac-dock button{margin-left:8px}#rac-hint button{margin-left:10px}
@media(max-height:540px){#rac-directory{top:68px;bottom:70px}#rac-directory header{padding:7px 12px}#rac-directory .rac-tools{padding:6px 12px}#rac-directory input{padding:6px 9px}}
@media(max-width:700px){#rac-directory{top:115px;bottom:76px;width:calc(100% - 20px)}#rac-directory .rac-content{grid-template-columns:1fr 1fr}#rac-detail{padding:9px}#rac-directory strong{font-size:17px}#rac-dock,#rac-hint{max-width:calc(100% - 20px);white-space:normal;font-size:10px}}`;
 document.head.appendChild(style);
 const panel=document.createElement("section");panel.id="rac-directory";panel.hidden=true;panel.setAttribute("aria-label","Computer research directory");
 panel.innerHTML=`<header><div><strong>Research directory</strong><br><small id="rac-terminal"></small></div><button id="rac-stand">Stand up · Esc</button></header><div class="rac-tools"><input id="rac-search" type="search" aria-label="Search the computer directory" placeholder="Search conditions, assets, communities or your notes…"></div><div class="rac-content"><div id="rac-list"></div><article id="rac-detail"></article></div><footer>Bundled synthetic atlas and your research objects only. No external database is searched.</footer>`;
 const dock=document.createElement("div");dock.id="rac-dock";dock.hidden=true;dock.innerHTML=`<span id="rac-seat-label"></span><button id="rac-open">Directory</button><button id="rac-exit">Stand up</button>`;
 const hint=document.createElement("div");hint.id="rac-hint";hint.hidden=true;hint.innerHTML=`<span id="rac-hint-text"></span><button id="rac-sit">Sit down</button>`;ui.append(panel,dock,hint);
 const nav=document.createElement("button");nav.id="rac-computers";nav.textContent="Computers";nav.title="Walk to the seated research terminals";ui.querySelector(".ra-bar .ra-group").appendChild(nav);
 const get=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const catalog=[
 ["case","Condition A","Disease","Starting condition in the fictional research case."],
 ["gene","GENE-A","Gene","A fictional reduced-function variant example."],
 ["process","Reduced process X activity","Mechanism","A process-level comparison, not a treatment recommendation."],
 ["neighbor","Condition B","Related condition","A candidate research neighbour in the synthetic dataset."],
 ["registry","Registry template","Registry","A design to review for possible adaptation; patient data access is not implied."],
 ["assay","Process-X cell assay","Model","An experimental method requiring validation."],
 ["community","Community B research team","Community","A fictional partner, not a verified contact."],
 ["counter","Condition C: a counterexample","Phenotype / counterexample","Similar symptoms, opposite direction of effect. Do not merge therapeutic strategies."],
 ["report","Mechanism report","Paper","The source assertions in this case are entirely synthetic."]];
 let entries=[],selection=null;
 const inspect=entry=>{
  if(entry.demo)R.inspect(entry.id);else{A.lastSelected=entry.id;for(const fn of A.events.select)try{fn(entry.id)}catch(e){console.warn(e);}}
  panel.hidden=true;dock.hidden=false;
 };
 function showEntry(entry){
  selection=entry;const detail=get("rac-detail");detail.replaceChildren();const h=document.createElement("h2");h.textContent=entry.label;detail.append(h);
  for(const t of [entry.type,entry.summary,entry.source,entry.demo?"Synthetic teaching record—not medical evidence.":"User-supplied material; not independently verified."]){const p=document.createElement("p");p.textContent=t;detail.append(p);}
  const b=document.createElement("button");b.textContent="Inspect in evidence desk";b.onclick=()=>inspect(entry);detail.append(b);
  for(const el of get("rac-list").querySelectorAll("button"))el.setAttribute("aria-pressed",String(el.dataset.entry===entry.id));
 }
 function refresh(){
  entries=catalog.map(([id,label,type,summary])=>({id,label,type,summary,source:"Synthetic demonstration — not medical evidence",demo:true}));
  for(const d of R.packet.researchObjects){if(d.id.startsWith("rai-demo-"))continue;entries.push({id:d.id,label:d.title||d.kind,type:"Research object · "+d.kind,summary:d.annotation?.summary||"Research material retained on the desk or in its bound folio.",source:d.source||"No source supplied.",demo:false});}
  const q=get("rac-search").value.trim().toLowerCase(),list=get("rac-list");list.replaceChildren();
  const matches=entries.filter(e=>[e.label,e.type,e.summary,e.source].join(" ").toLowerCase().includes(q));
  for(const entry of matches){const b=document.createElement("button");b.dataset.entry=entry.id;b.innerHTML=esc(entry.label)+"<small>"+esc(entry.type)+"</small>";b.onclick=()=>showEntry(entry);list.append(b);}
  if(!matches.length){const p=document.createElement("p");p.textContent="No match in the local directory. No outside research was searched.";list.append(p);get("rac-detail").textContent="Try another term.";selection=null;}
  else showEntry(matches.find(e=>e.id===selection?.id)||matches[0]);
 }
 function openDirectory(){
  if(!state.seat)return;get("rai-inspector").hidden=true;panel.hidden=false;dock.hidden=true;
  get("rac-terminal").textContent="TERMINAL "+state.seat.number+" · SYNTHETIC CASE / UNVERIFIED NOTES";refresh();get("rac-search").focus({preventScroll:true});
 }
 function sit(station){
  if(state.seat||!station)return;A.demo++;R.state.fly=null;R.state.keys.clear();R.state.walk=false;get("rai-walk").setAttribute("aria-pressed","false");
  state.seat=station;state.beforeInspector=get("rai-inspector").hidden;state.from=w.cam.p.clone();state.look=w.cam.target.clone();state.elapsed=0;
  state.to=new THREE.Vector3(station.x,1.36,12.16);state.target=new THREE.Vector3(station.x,1.43,10.78);hint.hidden=true;get("rac-seat-label").textContent="Seated at terminal "+station.number;openDirectory();
 }
 function stand(){
  if(!state.seat)return;const station=state.seat;state.seat=null;panel.hidden=dock.hidden=true;
  w.cam.p.set(station.x,1.8,13.2);w.cam.target.set(station.x,1.43,10.8);R.state.fly=null;R.state.walk=true;R.state.keys.clear();get("rai-walk").setAttribute("aria-pressed","true");
  if(!R.state.drawer)get("rai-inspector").hidden=state.beforeInspector;else get("rai-inspector").hidden=false;canvas.focus({preventScroll:true});
 }
 function approach(station){
  if(state.seat)stand();R.state.walk=true;R.state.keys.clear();get("rai-walk").setAttribute("aria-pressed","true");
  R.state.fly={from:w.cam.p.clone(),look:w.cam.target.clone(),to:new THREE.Vector3(station?station.x:0,1.8,station?13.2:15),target:new THREE.Vector3(station?station.x:0,1.43,11),elapsed:0,duration:1.15};canvas.focus({preventScroll:true});
 }
 on(nav,"click",()=>approach(null));on(get("rac-stand"),"click",stand);on(get("rac-exit"),"click",stand);on(get("rac-open"),"click",openDirectory);on(get("rac-sit"),"click",()=>sit(state.near));on(get("rac-search"),"input",refresh);
 on(panel,"keydown",e=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();stand();}});
 on(window,"keydown",e=>{
  if(state.seat){if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();stand();}else if(!ui.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}return;}
  if(ui.contains(e.target)||e.target.isContentEditable)return;
  if(state.near&&["e","Enter"].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();sit(state.near);}
 },true);
 on(window,"click",e=>{if(!state.seat)return;const b=e.target.closest("button");if(b&&(b.dataset.collection!==undefined||["walk","overview","approach","tour"].includes(b.dataset.action)))stand();},true);
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 on(window,"pointerdown",e=>{
  if(e.target!==canvas)return;if(state.seat){e.preventDefault();e.stopImmediatePropagation();get("rac-search").focus();return;}
  const bounds=canvas.getBoundingClientRect();ndc.set((e.clientX-bounds.left)/Math.max(1,bounds.width)*2-1,-(e.clientY-bounds.top)/Math.max(1,bounds.height)*2+1);ray.setFromCamera(ndc,w.camera);
  const hits=ray.intersectObject(root,true);if(!hits.length)return;let object=hits[0].object,station=null;
  while(object&&!station){station=stations.find(s=>s.group===object);object=object.parent;}if(!station)return;
  e.preventDefault();e.stopImmediatePropagation();const distance=Math.hypot(w.cam.p.x-station.x,w.cam.p.z-12.2);
  if(R.state.walk&&!R.state.fly&&distance<1.85)sit(station);else approach(station);
 },true);
 const shift=new THREE.Vector3();
 function tick(ms){
  if(state.disposed)return;if(A.world!==w){dispose();return;}
  const dt=state.last?Math.min(.05,(ms-state.last)/1000):0;state.last=ms;
  if(!document.hidden){
   if(state.seat){R.state.walk=false;R.state.fly=null;R.state.keys.clear();w.pointer.tx=w.pointer.ty=0;state.elapsed+=dt;const t=Math.min(1,state.elapsed/.6),ease=t*t*(3-2*t);w.cam.p.copy(state.from).lerp(state.to,ease);w.cam.target.copy(state.look).lerp(state.target,ease);}
   else if(R.state.walk&&!R.state.fly){
    for(const station of stations)for(const b of [{x:station.x,z:11,hx:1.12,hz:.58},{x:station.x,z:12.13,hx:.48,hz:.48}]){
     const dx=w.cam.p.x-b.x,dz=w.cam.p.z-b.z;
     if(Math.abs(dx)<b.hx&&Math.abs(dz)<b.hz){shift.set(0,0,0);if(b.hx-Math.abs(dx)<b.hz-Math.abs(dz))shift.x=(dx>=0?1:-1)*(b.hx-Math.abs(dx)+.005);else shift.z=(dz>=0?1:-1)*(b.hz-Math.abs(dz)+.005);w.cam.p.add(shift);w.cam.target.add(shift);}
    }
   }
   state.near=null;
   if(!state.seat&&R.state.walk&&!R.state.fly){let distance=1.85;for(const station of stations){const d=Math.hypot(w.cam.p.x-station.x,w.cam.p.z-12.35);if(d<distance){distance=d;state.near=station;}}}
   hint.hidden=!state.near;if(state.near)get("rac-hint-text").textContent="Terminal "+state.near.number+" · E / Enter to sit and browse";
  }
  state.raf=requestAnimationFrame(tick);
 }
 function dispose(){
  if(state.disposed)return;if(window.RareAtlasComputerSection?.owner?.root===root)window.RareAtlasComputerSection.dispose();
  if(state.seat)stand();state.disposed=true;cancelAnimationFrame(state.raf);off.forEach(fn=>fn());root.removeFromParent();resources.forEach(r=>r.dispose());panel.remove();dock.remove();hint.remove();nav.remove();style.remove();
 }
 window.RareAtlasWorkstations={root,stations,state,sit,stand,approach,openDirectory,dispose};state.raf=requestAnimationFrame(tick);
 return "Added four computer desks and seats. Existing research is retained.";
}
function moveAtlasComputers(){
 const C=window.RareAtlasWorkstations,A=window.app;
 if(!C?.root||!A?.world)throw new Error("Computer desks are not available.");
 if(window.RareAtlasComputerSection?.owner===C)return "Computers already have their own section.";
 const {THREE}=window.AskSary3D,w=A.world,dx=16,resources=[],own=o=>(resources.push(o),o);
 for(const child of C.root.children)child.position.x+=dx;for(const station of C.stations)station.x=station.group.position.x;
 C.root.name="Dedicated computer section — desks and seats";
 if(C.state.seat){for(const key of ["from","look","to","target"])if(C.state[key])C.state[key].x+=dx;w.cam.p.x+=dx;w.cam.target.x+=dx;w.camera.position.x+=dx;w.camera.lookAt(w.cam.target);}
 const section=new THREE.Group();section.name="Computer section — floor and sign";w.scene.add(section);
 const box=own(new THREE.BoxGeometry(1,1,1)),floor=own(new THREE.MeshStandardMaterial({color:"#243b49",roughness:.95})),trim=own(new THREE.MeshStandardMaterial({color:"#6c858c",roughness:.5,metalness:.35}));
 function block(m,x,y,z,sx,sy,sz){const o=new THREE.Mesh(box,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);section.add(o);return o;}
 block(floor,16,-.045,11.65,13.2,.08,6.7);block(floor,8,-.045,14.15,16,.08,1.65);block(trim,16,.06,8.35,13.2,.12,.12);block(trim,22.55,.06,11.65,.12,.12,6.7);block(trim,12.8,1.3,9.45,.045,2.6,.045);block(trim,19.2,1.3,9.45,.045,2.6,.045);
 const c=document.createElement("canvas");c.width=1024;c.height=192;const ctx=c.getContext("2d");
 ctx.fillStyle="#102531";ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle="#789ba7";ctx.lineWidth=3;ctx.strokeRect(3,3,1018,186);ctx.textAlign="center";ctx.fillStyle="#d9e9ef";ctx.font="52px Georgia";ctx.fillText("COMPUTER SECTION",512,85);ctx.fillStyle="#a9c4d0";ctx.font="25px sans-serif";ctx.fillText("Research terminals · seated directory browsing",512,139);
 const texture=own(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;
 const sign=new THREE.Mesh(own(new THREE.PlaneGeometry(6.5,1.22)),own(new THREE.MeshBasicMaterial({map:texture,toneMapped:false})));sign.position.set(16,2.75,9.48);section.add(sign);
 const nav=document.getElementById("rac-computers"),visit=e=>{e.preventDefault();e.stopImmediatePropagation();C.approach({x:16,z:11});};
 if(nav){nav.title="Visit the dedicated computer section";nav.addEventListener("click",visit,true);}
 const previousDispose=C.dispose;let disposed=false;
 const handle={owner:C,root:section,offset:dx,dispose(){if(disposed)return;disposed=true;if(nav)nav.removeEventListener("click",visit,true);section.removeFromParent();resources.forEach(o=>o.dispose());if(window.RareAtlasComputerSection===handle)window.RareAtlasComputerSection=null;}};
 window.RareAtlasComputerSection=handle;C.dispose=function(){handle.dispose();return previousDispose.call(C);};
 return "Moved all four computers and seats into their own labelled section.";
}
function installAtlasMonitorOutput(){
 const C=window.RareAtlasWorkstations,A=window.app,w=A?.world;
 if(!C||!w)throw new Error("The existing computers must be available.");
 window.RareAtlasMonitorOutput?.dispose();const {THREE}=window.AskSary3D;
 const ui=document.getElementById("rai-ui"),panel=document.getElementById("rac-directory"),inspector=document.getElementById("rai-inspector");
 const screens=C.stations.map(s=>({station:s,mesh:s.group.children.find(o=>o.isMesh&&o.geometry.type==="PlaneGeometry"&&o.material.map)}));
 if(!ui||!panel||screens.some(s=>!s.mesh))throw new Error("Computer display surfaces were not found.");
 const host=document.createElement("div");host.id="rac-monitor-output";host.style.cssText="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:40";
 const marker=document.createComment("Directory original position");panel.before(marker);const imarker=inspector?document.createComment("Evidence original position"):null;if(imarker)inspector.before(imarker);
 ui.append(host);host.append(panel);panel.classList.add("rac-physical-output");
 const style=document.createElement("style");
 style.textContent=`
#rac-directory.rac-physical-output,#rai-inspector.rac-physical-output{position:absolute!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:1000px!important;height:605px!important;max-width:none!important;max-height:none!important;min-width:0!important;box-sizing:border-box!important;transform-origin:0 0!important;pointer-events:auto!important;background:#0b1e2c!important;border:0!important;border-radius:0!important;box-shadow:none!important;backdrop-filter:none!important;overflow:auto!important}
#rac-directory.rac-physical-output{font-size:20px}
#rac-directory.rac-physical-output header{padding:14px 20px}
#rac-directory.rac-physical-output strong{font-size:32px}
#rac-directory.rac-physical-output small{font-size:16px}
#rac-directory.rac-physical-output button,#rac-directory.rac-physical-output input{font-size:20px}
#rac-directory.rac-physical-output .rac-tools{padding:10px 18px}
#rac-directory.rac-physical-output .rac-content{grid-template-columns:1fr 1fr}
#rac-directory.rac-physical-output #rac-list button{padding:10px 12px}
#rac-directory.rac-physical-output #rac-detail{padding:16px 20px}
#rac-directory.rac-physical-output #rac-detail h2{font-size:32px}
#rac-directory.rac-physical-output #rac-detail p{font-size:20px}
#rac-directory.rac-physical-output footer{font-size:15px;padding:9px 18px}
#rai-inspector.rac-physical-output{padding:20px;font-size:20px}`;
 document.head.append(style);
 const corners=[new THREE.Vector3(-.5,.5,0),new THREE.Vector3(.5,.5,0),new THREE.Vector3(.5,-.5,0),new THREE.Vector3(-.5,-.5,0)],points=corners.map(()=>new THREE.Vector3());
 let raf=0,disposed=false,last="",lastOutput=null;
 function restoreEvidence(){if(inspector?.classList.contains("rac-physical-output")){inspector.classList.remove("rac-physical-output");inspector.style.removeProperty("transform");imarker.after(inspector);}}
 function tick(){
  if(disposed)return;if(A.world!==w||!C.root.parent){dispose();return;}
  const seat=C.state.seat,evidence=seat&&panel.hidden&&inspector&&!inspector.hidden;
  if(evidence){if(inspector.parentNode!==host)host.append(inspector);inspector.classList.add("rac-physical-output");}else restoreEvidence();
  const output=seat&&!panel.hidden?panel:evidence?inspector:null;host.style.visibility=output?"visible":"hidden";
  if(output){
   const mesh=screens.find(s=>s.station===seat).mesh;mesh.updateWorldMatrix(true,false);w.camera.updateMatrixWorld();
   const rect=w.renderer.domElement.getBoundingClientRect();points.forEach((p,i)=>p.copy(corners[i]).applyMatrix4(mesh.matrixWorld).project(w.camera));
   if(rect.width>0&&rect.height>0&&points.every(p=>p.z>=-1&&p.z<=1)){
    const q=points.map(p=>({x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}));
    const [p0,p1,p2,p3]=q,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1;
    if(Math.abs(den)>.00001){
     const g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den,a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x,d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
     const matrix=`matrix3d(${a/1000},${d/1000},0,${g/1000},${b/605},${e/605},0,${h/605},0,0,1,0,${p0.x},${p0.y},0,1)`;
     if(matrix!==last||output!==lastOutput){output.style.setProperty("transform",matrix,"important");last=matrix;lastOutput=output;}
    }else host.style.visibility="hidden";
   }else host.style.visibility="hidden";
  }
  raf=requestAnimationFrame(tick);
 }
 const previousDispose=C.dispose;
 function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);restoreEvidence();panel.classList.remove("rac-physical-output");panel.style.removeProperty("transform");marker.after(panel);marker.remove();imarker?.remove();host.remove();style.remove();if(C.dispose===wrappedDispose)C.dispose=previousDispose;if(window.RareAtlasMonitorOutput?.host===host)window.RareAtlasMonitorOutput=null;}
 function wrappedDispose(){dispose();return previousDispose.call(C);}
 C.dispose=wrappedDispose;window.RareAtlasMonitorOutput={host,screens,dispose};tick();
 return "Computer directory and seated evidence use the physical monitor surface. Existing controls and research are preserved.";
}
function installAtlasPrint(){
 const ui=document.getElementById("rai-ui");
 if(!ui)throw new Error("Atlas controls were not found.");
 window.RareAtlasPrint?.dispose();
 const style=document.createElement("style");
 style.textContent=`
#rap-tools{position:fixed;right:18px;bottom:76px;width:min(370px,calc(100vw - 36px));box-sizing:border-box;background:#0b1e2c;color:#dfebf2;border:1px solid #789ba7;border-radius:12px;padding:16px;z-index:120;pointer-events:auto;box-shadow:0 12px 40px #0008}
#rap-tools[hidden]{display:none!important}
#rap-tools h2{font:22px Georgia;margin:0 0 12px}
#rap-tools select{box-sizing:border-box;width:100%;padding:9px;background:#142f40;color:#dfebf2;border:1px solid #789ba7;border-radius:6px}
#rap-tools .rap-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
#rap-tools button{padding:8px 10px}
#rap-tools p{font:12px/1.5 system-ui;color:#b9ced9;margin-bottom:0}
#rap-print{display:none}
@media print{
@page{size:A4;margin:18mm}
html,body{height:auto!important;overflow:visible!important;background:white!important;color:black!important}
body>*:not(#rap-print){display:none!important}
#rap-print{display:block!important;font:11pt/1.5 system-ui;color:black;background:white}
#rap-print h1{font-size:20pt}
#rap-print pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
}`;
 document.head.append(style);
 const button=document.createElement("button");
 button.id="rap-open";button.textContent="Print / PDF";button.title="Export an evidence record or desk document";
 const bar=ui.querySelector(".ra-bar");
 (bar?.querySelector(".ra-group:last-child")||bar||ui).append(button);
 const panel=document.createElement("section");
 panel.id="rap-tools";panel.hidden=true;panel.setAttribute("aria-label","Document PDF export");
 panel.innerHTML=`<h2>Print / PDF</h2><label for="rap-choice">Document</label><select id="rap-choice"></select><div class="rap-actions"><button id="rap-download">Download PDF</button><button id="rap-paper">Print</button><button id="rap-share">Share / Email / WhatsApp</button><button id="rap-close">Close</button></div><p id="rap-status" role="status" aria-live="polite"></p><p>Sharing depends on your browser and device. If unavailable, download the PDF and attach it in email or WhatsApp. Nothing is sent automatically.</p>`;
 ui.append(panel);
 const get=id=>panel.querySelector("#"+id);
 const warning="Atlas includes synthetic demonstration records. User-supplied material is not independently verified. This export is not clinical guidance.";
 let documents=[],selected=null,file=null,sequence=0,disposed=false;
 const cache=new Map(),urls=new Set();
 function textOf(el){
  const copy=el.cloneNode(true);
  copy.querySelectorAll("button,input,select,script,style,[aria-hidden='true']").forEach(n=>n.remove());
  copy.querySelectorAll("p,div,h1,h2,h3,h4,section,article,header,footer,li,blockquote,pre,tr,br").forEach(n=>n.append("\n"));
  return copy.textContent.replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
 }
 function stringify(value){
  const seen=new WeakSet();
  return JSON.stringify(value,(key,v)=>{
   if(typeof v==="bigint")return String(v);
   if(typeof v==="function")return undefined;
   if(v&&typeof v==="object"){if(seen.has(v))return "[Repeated reference]";seen.add(v);}
   return v;
  },2)||"";
 }
 function record(d){return {title:d.title||d.label||d.kind||"Research document",text:stringify(d)};}
 function snapshot(){
  const objects=window.RareAtlasInteractive?.packet?.researchObjects||[];
  const inspector=document.getElementById("rai-inspector");
  const directory=document.getElementById("rac-directory");
  const detail=document.getElementById("rac-detail");
  const active=directory&&!directory.hidden?detail:inspector&&!inspector.hidden?inspector:null;
  documents=[];
  if(active){
   const text=textOf(active);
   if(text)documents.push({title:active.querySelector("h1,h2,h3")?.textContent.trim()||"Current evidence",text});
  }
  const chosen=objects.find(d=>d.id===window.app?.lastSelected);
  if(!documents.length&&chosen)documents.push(record(chosen));
  for(const d of objects)documents.push(record(d));
  documents.push({title:"All desk research",text:objects.length?objects.map(d=>record(d).title+"\n"+stringify(d)).join("\n\n"):"No desk research objects are currently retained."});
  const select=get("rap-choice");select.replaceChildren();
  documents.forEach((d,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=d.title;select.append(o);});
 }
 async function makePDF(doc){
  const key=doc.title+"\n"+doc.text;
  if(cache.has(key))return cache.get(key);
  const c=document.createElement("canvas");c.width=1240;c.height=1754;
  const ctx=c.getContext("2d");ctx.font="24px system-ui";
  const lines=[];
  for(const paragraph of (doc.title+"\n\n"+doc.text+"\n\n"+warning).replace(/\r\n?/g,"\n").split("\n")){
   if(!paragraph.trim()){lines.push("");continue;}
   let line="";
   for(const word of paragraph.split(/\s+/)){
    const next=line?line+" "+word:word;
    if(ctx.measureText(next).width<=1092){line=next;continue;}
    if(line){lines.push(line);line="";}
    for(const character of word){
     if(ctx.measureText(line+character).width>1092){lines.push(line);line="";}
     line+=character;
    }
   }
   lines.push(line);
  }
  const images=[],count=Math.max(1,Math.ceil(lines.length/42)),stamp=new Date().toISOString();
  for(let p=0;p<count;p++){
   ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
   ctx.fillStyle="#193c4b";ctx.font="bold 26px system-ui";ctx.fillText("Rare Atlas | Research document",74,50);
   ctx.strokeStyle="#a8bbc2";ctx.beginPath();ctx.moveTo(74,70);ctx.lineTo(1166,70);ctx.stroke();
   ctx.fillStyle="#172c37";ctx.font="24px system-ui";
   lines.slice(p*42,(p+1)*42).forEach((line,i)=>ctx.fillText(line,74,112+i*36));
   ctx.font="18px system-ui";ctx.fillStyle="#526773";
   ctx.fillText("Exported "+stamp+"   |   Page "+(p+1)+" of "+count,74,1686);
   const raw=atob(c.toDataURL("image/jpeg",.93).split(",")[1]);
   images.push(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  c.width=c.height=1;
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
  const push=value=>{const bytes=typeof value==="string"?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
  const object=(id,body)=>{offsets[id]=length;push(id+" 0 obj\n");push(body);push("\nendobj\n");};
  const stream=(id,dict,bytes)=>{offsets[id]=length;push(id+" 0 obj\n<< "+dict+" /Length "+bytes.length+" >>\nstream\n");push(bytes);push("\nendstream\nendobj\n");};
  push("%PDF-1.4\n");
  object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,"<< /Type /Pages /Count "+count+" /Kids ["+images.map((_,i)=>(5+i*3)+" 0 R").join(" ")+"] >>");
  images.forEach((image,i)=>{
   const id=3+i*3;
   stream(id,"/Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",image);
   stream(id+1,"",encoder.encode("q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ"));
   object(id+2,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 "+id+" 0 R >> >> /Contents "+(id+1)+" 0 R >>");
  });
  const total=3+count*3,xref=length;
  push("xref\n0 "+total+"\n0000000000 65535 f \n");
  for(let i=1;i<total;i++)push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  push("trailer\n<< /Size "+total+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  const filename=(doc.title.replace(/[^\w -]/g,"").trim().slice(0,70)||"Rare Atlas document")+".pdf";
  const result=new File(chunks,filename,{type:"application/pdf"});
  cache.set(key,result);if(cache.size>3)cache.delete(cache.keys().next().value);
  return result;
 }
 function message(text){get("rap-status").textContent=text;}
 async function prepare(doc){
  const token=++sequence;selected=doc;file=null;
  get("rap-download").disabled=get("rap-share").disabled=true;
  message("Preparing PDF locally…");
  try{
   const result=await makePDF(doc);
   if(disposed||token!==sequence)return;
   file=result;get("rap-download").disabled=get("rap-share").disabled=false;
   message("PDF ready. Full document text, source details and evidence warnings are included.");
  }catch(error){if(token===sequence)message("PDF could not be prepared: "+error.message);}
 }
 function open(){
  snapshot();panel.hidden=false;prepare(documents[0]);
 }
 function download(){
  if(!file)return;
  const url=URL.createObjectURL(file);urls.add(url);
  const link=document.createElement("a");link.href=url;link.download=file.name;ui.append(link);link.click();link.remove();
  setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);
  message("PDF download requested. You can attach the saved file in email or WhatsApp.");
 }
 async function share(){
  if(!file)return;
  try{
   if(!navigator.share||(navigator.canShare&&!navigator.canShare({files:[file]}))){
    message("File sharing is unavailable here. Download the PDF, then attach it in email or WhatsApp.");return;
   }
   await navigator.share({files:[file],title:selected.title});
   message("Share sheet completed.");
  }catch(error){
   message(error.name==="AbortError"?"Sharing cancelled. Your PDF remains ready.":"Sharing was blocked. Download the PDF and attach it in your preferred app.");
  }
 }
 function print(){
  if(!selected)return;
  document.getElementById("rap-print")?.remove();
  const root=document.createElement("article");root.id="rap-print";
  const h=document.createElement("h1");h.textContent=selected.title;
  const body=document.createElement("pre");body.textContent=selected.text;
  const note=document.createElement("p");note.textContent=warning;
  root.append(h,body,note);document.body.append(root);
  window.addEventListener("afterprint",()=>root.remove(),{once:true});
  try{window.print();message("Print requested. If the sandbox blocks printing, use Download PDF.");}
  catch(error){message("Printing is blocked here. Use Download PDF instead.");}
 }
 button.onclick=open;get("rap-close").onclick=()=>{panel.hidden=true;};
 get("rap-choice").onchange=()=>prepare(documents[Number(get("rap-choice").value)]);
 get("rap-download").onclick=download;get("rap-paper").onclick=print;get("rap-share").onclick=share;
 function dispose(){
  disposed=true;sequence++;button.remove();panel.remove();style.remove();
  document.getElementById("rap-print")?.remove();urls.forEach(url=>URL.revokeObjectURL(url));cache.clear();
 }
 window.RareAtlasPrint={open,download,share,print,makePDF,exportDocument(doc){
  const entry=doc instanceof Element?{title:doc.querySelector("h1,h2,h3")?.textContent||"Document",text:textOf(doc)}:typeof doc==="string"?{title:"Document",text:doc}:{title:String(doc.title||"Document"),text:String(doc.text||doc.content||"")};
  documents=[entry];get("rap-choice").replaceChildren(new Option(entry.title,"0"));panel.hidden=false;return prepare(entry);
 },dispose};
 return "Added local PDF download, document printing and native file-sharing controls; the running scene and research were preserved.";
}
