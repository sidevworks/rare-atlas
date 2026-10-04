// The Mondo floor: a lower level of the Rare Atlas world that lays out every
// rare disease in the Mondo Disease Ontology as a mosaic of tiles. Each tile
// is an image drawn, in a shader, from that disease's own metadata: gallery
// colour from its Mondo body-system category, glyph shape from its kind,
// glyph size from how many subtypes it has, source dots for GARD, NORD,
// Orphanet and OMIM, bars for synonyms and cross-references, and a line when
// the record carries a definition. Walking close turns the nearest tiles
// into full cards with the disease name.
//
// This is a classic script, not a module, so that the LiveLoop wrapper can
// inline it next to the other atlas extensions. It expects the running atlas:
// window.app (the world), window.RareAtlasInteractive (the controls) and the
// #rai-ui overlay. Data comes from loader/mondo/build.js, in order of
// preference: window.MONDO_FLOOR_URL, the LiveLoop library asset
// "mondo-floor", the copy committed to this repository, then the small
// sample embedded by the wrapper (window.MONDO_FLOOR_SAMPLE).

function installMondoFloor(){
 const A=window.app,R=window.RareAtlasInteractive;
 if(!A?.world||!R)throw new Error("The existing atlas must be running.");
 window.RareAtlasMondoFloor?.dispose();
 const {THREE}=window.AskSary3D,w=A.world,canvas=w.renderer.domElement,ui=document.getElementById("rai-ui");
 if(!ui)throw new Error("Existing atlas controls were not found.");
 const resources=[],off=[],own=x=>(resources.push(x),x);
 const on=(el,k,fn,opt)=>{el.addEventListener(k,fn,opt);off.push(()=>el.removeEventListener(k,fn,opt));};
 const get=id=>document.getElementById(id);
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),ease=t=>t*t*(3-2*t);
 const fmt=n=>Number(n).toLocaleString("en");
 if(!CanvasRenderingContext2D.prototype.roundRect)CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h){this.rect(x,y,w,h);};

 // Geometry of the level. The library's own walk controller stops at a 21.3 m
 // radius and keeps the eye at 1.8 m, so the floor lives far below and this
 // extension drives the camera while the visitor is down there.
 const LEVEL_Y=-120,EYE=1.7,HUB_R=7,PITCH=.6,TILE=.52,RING_AISLE=10,AISLE=.45,STAIR={x:-16,z:11};let FLOOR_R=58;
 const CATEGORY_COLOURS=["#7aa6ff","#8fd3c3","#c7b58a","#e8a65d","#f0d26a","#9bd47a","#e07a7a","#f08fb0","#8ecae6","#d9a66b","#a6c48a","#d58ad5","#e3b58a","#8fb8ff","#7fd5e0","#b8c7d9","#c9a0dc","#f2a5a5","#a0e0c0","#cf9f6a","#79c7a3","#d6b0ff","#e0c080","#8b97a8"];
 const SOURCE_COLOURS={GARD:"#7fd0ff",NORD:"#ffd27f",Orphanet:"#9cff9c",OMIM:"#ff9fb5"};
 const DATA_URLS=[window.MONDO_FLOOR_URL,"asksary-asset://mondo-floor",
  "https://cdn.jsdelivr.net/gh/sidevworks/rare-atlas@main/public/mondo/mondo-floor.compact.json",
  "https://cdn.jsdelivr.net/gh/sidevworks/rare-atlas@ccr-e116c7e0-vzdcii/public/mondo/mondo-floor.compact.json",
  "https://raw.githubusercontent.com/sidevworks/rare-atlas/ccr-e116c7e0-vzdcii/public/mondo/mondo-floor.compact.json"].filter(Boolean);

 const state={level:"library",disposed:false,raf:0,last:0,near:false,keys:new Set(),fly:null,overview:false,drag:null,look:{theta:0,phi:1.5},
  data:null,source:"",hover:-1,selected:-1,matches:[],filterBits:0,focusCat:-1,beforeInspector:true,fogDensity:null,notice:""};

 // ---------------------------------------------------------------- scene
 const root=new THREE.Group();root.name="Mondo floor — level −1";w.scene.add(root);
 const ground=new THREE.Group();ground.name="Mondo floor — stairwell";w.scene.add(ground);
 const box=own(new THREE.BoxGeometry(1,1,1)),plane=own(new THREE.PlaneGeometry(1,1));
 const mat=(color,extra={})=>own(new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.15,...extra}));
 const stone=mat("#2a3c48"),metal=mat("#7a8a90",{metalness:.75,roughness:.35}),dark=mat("#0a141c"),glow=own(new THREE.MeshBasicMaterial({color:"#9fd2df"}));
 const cube=(parent,m,x,y,z,sx,sy,sz)=>{const o=new THREE.Mesh(box,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);parent.add(o);return o;};
 const textPlane=(parent,draw,width,height,x,y,z,ry=0,double=false)=>{
  const c=document.createElement("canvas");c.width=Math.round(width*180);c.height=Math.round(height*180);
  draw(c.getContext("2d"),c.width,c.height);
  const tx=own(new THREE.CanvasTexture(c));tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;
  const m=own(new THREE.MeshBasicMaterial({map:tx,toneMapped:false,transparent:true,side:double?THREE.DoubleSide:THREE.FrontSide}));
  const o=new THREE.Mesh(plane,m);o.position.set(x,y,z);o.scale.set(width,height,1);o.rotation.y=ry;parent.add(o);return o;
 };

 // Stairwell on the library floor, mirroring the computer section.
 (()=>{
  const g=new THREE.Group();g.position.set(STAIR.x,0,STAIR.z);ground.add(g);
  cube(g,dark,0,-1.6,0,2.6,3.2,3.4);                      // the shaft
  for(let i=0;i<7;i++)cube(g,stone,0,-.12-i*.24,-1.35+i*.42,2.4,.12,.42); // steps going down, entered from the library side (−z)
  cube(g,stone,0,.06,-2.1,2.6,.12,.9);                    // threshold on the entrance side
  for(const x of[-1.3,1.3]){cube(g,metal,x,.5,-1.7,.06,1,.06);cube(g,metal,x,.5,1.7,.06,1,.06);cube(g,metal,x,.98,0,.05,.05,3.4);}
  cube(g,metal,0,.98,1.7,2.6,.05,.05);
  const light=new THREE.PointLight("#9fd2df",2,6,2);light.position.set(0,.6,0);g.add(light);
  cube(g,glow,0,-1.55,-1.6,2.2,.03,.03);
  cube(g,metal,-1.6,1.5,-1.9,.05,3,.05);
  textPlane(g,(ctx,W,H)=>{ctx.fillStyle="#102531";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#789ba7";ctx.lineWidth=3;ctx.strokeRect(3,3,W-6,H-6);ctx.fillStyle="#d9e9ef";ctx.font="bold 56px Georgia";ctx.fillText("MONDO FLOOR  ↓",28,78);ctx.fillStyle="#a9c4d0";ctx.font="28px sans-serif";ctx.fillText("Level −1 · every rare disease in the Mondo ontology,",28,128);ctx.fillText("laid out as images by body system. Walk down or press E.",28,166);},2.6,.84,-.2,2.55,-1.92,Math.PI);
 })();

 // Lower level: floor disc, ceiling to hide the library above, hub column.
 const floorMat=own(new THREE.ShaderMaterial({uniforms:{uR:{value:FLOOR_R},uHub:{value:HUB_R},uPitch:{value:PITCH*RING_AISLE}},
  vertexShader:`varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float uR,uHub,uPitch;varying vec2 vP;void main(){float r=length(vP)*uR;vec3 c=vec3(.028,.045,.07);float ring=smoothstep(.06,.0,abs(fract((r-uHub)/uPitch+.5)-.5)*uPitch-.03)*step(uHub,r);c+=vec3(.08,.14,.18)*ring*.6;float hub=smoothstep(.08,0.,abs(r-uHub+.3)-.04);c+=vec3(.3,.5,.6)*hub;c*=1.-smoothstep(uR-6.,uR,r);gl_FragColor=vec4(c,1.);}`}));
 const floor=new THREE.Mesh(own(new THREE.CircleGeometry(1,180)),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=LEVEL_Y;floor.scale.setScalar(FLOOR_R);root.add(floor);
 const resizeFloor=r=>{FLOOR_R=r;floor.scale.setScalar(r);floorMat.uniforms.uR.value=r;ceiling.scale.setScalar(r+40);};
 const ceiling=new THREE.Mesh(own(new THREE.CircleGeometry(1,64)),own(new THREE.MeshBasicMaterial({color:"#04080d",side:THREE.BackSide})));ceiling.rotation.x=-Math.PI/2;ceiling.position.y=LEVEL_Y+95;ceiling.scale.setScalar(FLOOR_R+40);root.add(ceiling);
 const hub=new THREE.Group();hub.position.y=LEVEL_Y;root.add(hub);
 cube(hub,stone,0,.08,0,2.6,.16,2.6);cube(hub,dark,0,2.2,0,1.1,4.2,1.1);cube(hub,metal,0,4.35,0,1.3,.08,1.3);
 for(const a of[0,Math.PI/2,Math.PI,-Math.PI/2]){const l=new THREE.PointLight("#bfe3ee",14,26,1.6);l.position.set(Math.sin(a)*3,3.4,Math.cos(a)*3);hub.add(l);}
 const legendDraw=(ctx,W,H)=>{
  ctx.fillStyle="#0b1e2c";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#789ba7";ctx.lineWidth=3;ctx.strokeRect(3,3,W-6,H-6);
  ctx.fillStyle="#d9e9ef";ctx.font="bold 44px Georgia";ctx.fillText("MONDO FLOOR",28,64);ctx.fillStyle="#a9c4d0";ctx.font="22px sans-serif";
  const lines=["Each tile is one disease, drawn from its Mondo record.","Colour: gallery (Mondo body-system category).","Glyph: circle = disease · hexagon = syndromic · square = group.","Glyph size: how many subtypes sit beneath it.","Dots: GARD · NORD · Orphanet · OMIM list it.","Bars: synonyms (left) · cross-references (right).","Line under glyph: the record has a definition.","Walk close to read names. Press O for the overview."];
  lines.forEach((t,i)=>ctx.fillText(t,28,112+i*36));
  ctx.fillStyle="#d8c699";ctx.font="18px sans-serif";ctx.fillText("Mondo Disease Ontology (CC BY 4.0) · ontology terms, not patient data.",28,H-26);
 };
 for(const a of[0,Math.PI])textPlane(hub,legendDraw,2.8,2.2,Math.sin(a)*.58,2.3,Math.cos(a)*.58,a);
 for(const a of[Math.PI/2,-Math.PI/2])textPlane(hub,(ctx,W,H)=>{ctx.fillStyle="#0b1e2c";ctx.fillRect(0,0,W,H);ctx.strokeStyle="#789ba7";ctx.lineWidth=3;ctx.strokeRect(3,3,W-6,H-6);ctx.fillStyle="#d9e9ef";ctx.font="bold 44px Georgia";ctx.fillText("RARE ATLAS",28,64);ctx.fillStyle="#a9c4d0";ctx.font="24px sans-serif";ctx.fillText("Level −1 · the Mondo floor",28,110);ctx.fillStyle="#9fbdcd";ctx.font="20px sans-serif";["Galleries run clockwise from the landing.","Aisles every ten rings; names are alphabetical","along each ring, reading outward.","","Esc or the Library button returns upstairs."].forEach((t,i)=>ctx.fillText(t,28,160+i*32));},2.8,2.2,Math.sin(a)*.58,2.3,Math.cos(a)*.58,a);
 const stairsDown=new THREE.Group();stairsDown.position.set(0,0,HUB_R-1.2);hub.add(stairsDown);
 cube(stairsDown,glow,0,.02,0,1.8,.02,.3);

 // ---------------------------------------------------------------- tiles
 const tileMat=own(new THREE.ShaderMaterial({transparent:true,depthWrite:true,side:THREE.DoubleSide,uniforms:{uTime:{value:0},uTile:{value:TILE},uCat:{value:CATEGORY_COLOURS.map(c=>new THREE.Color(c))}},
  vertexShader:`attribute vec3 aOffset;attribute float aAngle;attribute vec4 aMeta;attribute vec4 aCount;attribute float aState;attribute float aAlpha;
uniform float uTime,uTile;varying vec2 vUv;varying vec4 vMeta,vCount;varying float vState,vAlpha;
void main(){vUv=uv;vMeta=aMeta;vCount=aCount;vState=aState;vAlpha=aAlpha;float c=cos(aAngle),s=sin(aAngle);vec2 p=position.xy*uTile;
vec3 pos=vec3(p.x*c+p.y*s,0.,-p.x*s+p.y*c);float lift=aState>.5?.14+.05*sin(uTime*3.+aOffset.x):0.;pos+=aOffset+vec3(0.,.012+lift,0.);
gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);}`,
  fragmentShader:`uniform vec3 uCat[24];uniform float uTime;varying vec2 vUv;varying vec4 vMeta,vCount;varying float vState,vAlpha;
float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
void main(){vec2 p=vUv*2.-1.;int cat=int(vMeta.x+.5);vec3 base=uCat[0];for(int i=0;i<24;i++)if(i==cat)base=uCat[i];
float box=sdBox(p,vec2(.93))-.07;if(box>0.)discard;float seed=vMeta.w;vec3 col=base*(.42+.22*seed);
col=mix(col,base*.78,smoothstep(0.,-.2,sdBox(p,vec2(.74))-.06)*.5);
float kids=vCount.z;float gr=.2+.11*kids;vec2 g=p-vec2(0.,.08);int shape=int(vMeta.z+.5);float d;
if(shape==0)d=length(g)-gr;else if(shape==1){vec2 q=abs(g);d=max(q.x*.866+q.y*.5,q.y)-gr;}else d=sdBox(g,vec2(gr*.9));
float ring=smoothstep(.035,0.,abs(d)-.03);float fill=smoothstep(.02,-.02,d+.09);vec3 ink=vec3(.94,.97,1.);
col=mix(col,base*1.7,fill*.55);col=mix(col,ink,ring*.9);
float flags=vMeta.y;
if(mod(floor(flags/16.),2.)>.5){float line=smoothstep(.03,0.,abs(p.y+.5)-.025)*step(abs(p.x),.5);col=mix(col,ink,line*.75);}
vec3 dots[4];dots[0]=vec3(.5,.82,1.);dots[1]=vec3(1.,.82,.5);dots[2]=vec3(.61,1.,.61);dots[3]=vec3(1.,.62,.71);
for(int i=0;i<4;i++){float bit=mod(floor(flags/pow(2.,float(i))),2.);vec2 c=vec2(-.6+.4*float(i),.76);float on=smoothstep(.03,0.,length(p-c)-.1);col=mix(col,bit>.5?dots[i]:base*.25,on);}
for(int i=0;i<3;i++){float fi=float(i);float lit=step(fi+.5,vCount.x);float seg=smoothstep(.02,0.,sdBox(p-vec2(-.74+.22*fi,-.8),vec2(.085,.055)));col=mix(col,lit>.5?ink*.9:base*.3,seg);
lit=step(fi+.5,vCount.y);seg=smoothstep(.02,0.,sdBox(p-vec2(.74-.22*fi,-.8),vec2(.085,.055)));col=mix(col,lit>.5?vec3(1.,.9,.6):base*.3,seg);}
float edge=smoothstep(-.09,-.02,box);
if(vState>2.5)col=mix(col,vec3(1.,.85,.4),edge*(.7+.3*sin(uTime*4.)));else if(vState>1.5)col=mix(col,vec3(1.),edge);else if(vState>.5)col=mix(col*1.25,vec3(.8,.95,1.),edge*.8);
gl_FragColor=vec4(col,vAlpha);}`}));
 let tiles=null,layout=null,grid=null;
 const galleryLabels=new THREE.Group();root.add(galleryLabels);

 function decode(data){
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const u32=s=>new Uint32Array(bytes(s).buffer),u16=s=>new Uint16Array(bytes(s).buffer);
  const names=data.names.split("\n");
  return{n:data.n,names,ids:u32(data.ids),cat:bytes(data.cat),cats:u32(data.cats),flags:bytes(data.flags),syn:bytes(data.syn),xref:bytes(data.xref),kids:u16(data.kids),depth:bytes(data.depth),categories:data.categories,builtAt:data.builtAt,source:data.source,definitions:data.definitions||null};
 }
 function fromRecords(full){
  const records=full.records,n=records.length,categories=full.categories.map(c=>({...c,count:0}));
  const d={n,names:[],ids:new Uint32Array(n),cat:new Uint8Array(n),cats:new Uint32Array(n),flags:new Uint8Array(n),syn:new Uint8Array(n),xref:new Uint8Array(n),kids:new Uint16Array(n),depth:new Uint8Array(n),categories,definitions:[],source:full.source};
  records.forEach((r,i)=>{d.names.push(r.name);d.ids[i]=Number(String(r.id).slice(6));d.cat[i]=r.category;categories[r.category].count++;d.cats[i]=(r.categories||[]).reduce((m,c)=>m|(1<<c),0);d.flags[i]=r.flags;d.syn[i]=Math.min(255,(r.synonyms||[]).length);d.xref[i]=Math.min(255,Object.values(r.xrefs||{}).reduce((s,v)=>s+v.length,0));d.kids[i]=Math.min(65535,r.descendants||0);d.depth[i]=r.depth||0;d.definitions.push(r.definition||"");});
  return d;
 }

 // Rings of tiles per gallery sector, alphabetical along each ring.
 function buildLayout(d){
  const C=d.categories.length,counts=new Array(C).fill(0);for(let i=0;i<d.n;i++)counts[d.cat[i]]++;
  const order=[];for(let i=0;i<d.n;i++)order.push(i);order.sort((a,b)=>d.cat[a]-d.cat[b]||d.names[a].localeCompare(d.names[b],"en"));
  const total=counts.reduce((s,c)=>s+c,0),pos=new Float32Array(d.n*3),ang=new Float32Array(d.n),sectors=[];
  let a0=Math.PI*.5,k=0;
  for(let c=0;c<C;c++){
   const span=Math.PI*2*counts[c]/total;if(!counts[c]){sectors.push({c,a0,a1:a0,rOut:HUB_R});continue;}
   const members=order.slice(k,k+counts[c]);k+=counts[c];
   let placed=0,ring=0,r=HUB_R+PITCH*.5;
   while(placed<members.length){
    if(ring&&ring%RING_AISLE===0){r+=PITCH*1.3;}
    const usable=span-2*AISLE/r;const slots=Math.max(1,Math.floor(usable*r/PITCH));
    const step=usable/slots,start=a0+AISLE/r+step*.5;
    for(let s=0;s<slots&&placed<members.length;s++,placed++){
     const i=members[placed],a=start+s*step;
     pos[i*3]=Math.sin(a)*r;pos[i*3+1]=LEVEL_Y;pos[i*3+2]=Math.cos(a)*r;ang[i]=a;
    }
    ring++;r+=PITCH;
   }
   sectors.push({c,a0,a1:a0+span,rOut:r});a0+=span;
  }
  return{pos,ang,sectors,counts};
 }

 function buildTiles(d){
  disposeTiles();
  layout=buildLayout(d);resizeFloor(Math.max(...layout.sectors.map(s=>s.rOut))+6);
  const geo=own(new THREE.InstancedBufferGeometry());const base=own(new THREE.PlaneGeometry(1,1));
  geo.index=base.index;geo.attributes.position=base.attributes.position;geo.attributes.uv=base.attributes.uv;geo.instanceCount=d.n;
  const meta=new Float32Array(d.n*4),count=new Float32Array(d.n*4),st=new Float32Array(d.n),al=new Float32Array(d.n).fill(1);
  for(let i=0;i<d.n;i++){
   const f=d.flags[i];let h=2166136261;const name=d.names[i];for(let j=0;j<name.length;j++){h^=name.charCodeAt(j);h=Math.imul(h,16777619);}
   meta[i*4]=d.cat[i];meta[i*4+1]=f&255;meta[i*4+2]=(f&128)?2:(f&32)?1:0;meta[i*4+3]=((h>>>0)%1000)/1000;
   const s=d.syn[i],x=d.xref[i],kd=d.kids[i];
   count[i*4]=s===0?0:s<=2?1:s<=6?2:3;count[i*4+1]=x===0?0:x<=3?1:x<=8?2:3;count[i*4+2]=kd===0?0:kd<=3?1:kd<=15?2:3;count[i*4+3]=d.depth[i];
  }
  geo.setAttribute("aOffset",new THREE.InstancedBufferAttribute(layout.pos,3));
  geo.setAttribute("aAngle",new THREE.InstancedBufferAttribute(layout.ang,1));
  geo.setAttribute("aMeta",new THREE.InstancedBufferAttribute(meta,4));
  geo.setAttribute("aCount",new THREE.InstancedBufferAttribute(count,4));
  const stateAttr=new THREE.InstancedBufferAttribute(st,1),alphaAttr=new THREE.InstancedBufferAttribute(al,1);stateAttr.setUsage(THREE.DynamicDrawUsage);alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aState",stateAttr);geo.setAttribute("aAlpha",alphaAttr);
  tiles=new THREE.Mesh(geo,tileMat);tiles.frustumCulled=false;tiles.name="Mondo tiles";root.add(tiles);
  grid=new Map();const cell=2;
  for(let i=0;i<d.n;i++){const key=Math.floor(layout.pos[i*3]/cell)+","+Math.floor(layout.pos[i*3+2]/cell);let b=grid.get(key);if(!b){b=[];grid.set(key,b);}b.push(i);}
  grid.cell=cell;
  // Gallery signs: a post at the inner edge and a floating label over the sector.
  galleryLabels.clear();
  for(const s of layout.sectors){
   if(s.a1===s.a0)continue;const mid=(s.a0+s.a1)/2,cat=d.categories[s.c],colour=CATEGORY_COLOURS[s.c%24];
   const r0=HUB_R-.55;const post=new THREE.Group();post.position.set(Math.sin(mid)*r0,LEVEL_Y,Math.cos(mid)*r0);post.rotation.y=mid+Math.PI;galleryLabels.add(post);
   cube(post,metal,0,1.1,0,.05,2.2,.05);
   textPlane(post,(ctx,W,H)=>{ctx.fillStyle="#0b1e2c";ctx.fillRect(0,0,W,H);ctx.fillStyle=colour;ctx.fillRect(0,0,14,H);ctx.fillStyle="#e4f0f5";ctx.font="bold 40px Georgia";ctx.fillText(cat.label.toUpperCase(),30,58);ctx.fillStyle="#a9c4d0";ctx.font="24px sans-serif";ctx.fillText(fmt(layout.counts[s.c])+" diseases · "+(cat.mondoLabel||""),30,98);},2.4,.7,0,2.0,0,0,true);
   const rm=HUB_R+(s.rOut-HUB_R)*.72,h=6.5+Math.min(5,(s.rOut-HUB_R)*.06),lw=Math.max(3,Math.min(10,3+(s.rOut-HUB_R)*.2));
   textPlane(galleryLabels,(ctx,W,H)=>{ctx.clearRect(0,0,W,H);ctx.fillStyle="rgba(8,20,32,.78)";ctx.beginPath();ctx.roundRect(0,0,W,H,40);ctx.fill();ctx.fillStyle=colour;ctx.fillRect(0,H-16,W,16);ctx.fillStyle="#eef6fa";ctx.font="bold "+Math.round(W*.075)+"px Georgia";ctx.textAlign="center";ctx.fillText(cat.label,W/2,H*.5);ctx.fillStyle="#b9d3e0";ctx.font=Math.round(W*.04)+"px sans-serif";ctx.fillText(fmt(layout.counts[s.c])+" rare diseases",W/2,H*.86);},lw,lw*.3,Math.sin(mid)*rm,LEVEL_Y+h,Math.cos(mid)*rm,0,true).userData.label=true;
  }
  stairsDown.position.set(Math.sin(layout.sectors[0].a0-.05)*(HUB_R-1.2),0,Math.cos(layout.sectors[0].a0-.05)*(HUB_R-1.2));
  refreshFilters();
 }
 function disposeTiles(){if(tiles){root.remove(tiles);tiles.geometry.dispose();tiles=null;}for(const o of [...galleryLabels.children]){galleryLabels.remove(o);}grid=null;}

 // Near cards: the closest tiles become readable cards.
 const CARD_POOL=22,CARD_RADIUS=3.4,cards=[],cardCache=new Map();
 const cardGeo=own(new THREE.PlaneGeometry(.6,.75));
 for(let i=0;i<CARD_POOL;i++){const m=own(new THREE.MeshBasicMaterial({transparent:true,toneMapped:false,depthWrite:false}));const c=new THREE.Mesh(cardGeo,m);c.visible=false;c.userData.index=-1;root.add(c);cards.push(c);}
 function cardTexture(i){
  let tx=cardCache.get(i);if(tx){cardCache.delete(i);cardCache.set(i,tx);return tx;}
  const d=state.data,c=document.createElement("canvas");c.width=256;c.height=320;const ctx=c.getContext("2d");
  const cat=d.categories[d.cat[i]],colour=CATEGORY_COLOURS[d.cat[i]%24],f=d.flags[i];
  ctx.fillStyle="#0b1e2c";ctx.beginPath();ctx.roundRect(0,0,256,320,16);ctx.fill();ctx.fillStyle=colour;ctx.fillRect(0,0,256,34);
  ctx.fillStyle="#08131c";ctx.font="bold 15px sans-serif";ctx.fillText(cat.label.toUpperCase(),12,23);
  ctx.fillStyle="#eef6fa";ctx.font="bold 21px Georgia";const words=d.names[i].split(" ");let line="",y=70;const lines=[];
  for(const word of words){const t=line?line+" "+word:word;if(ctx.measureText(t).width>232&&line){lines.push(line);line=word;}else line=t;}lines.push(line);
  for(const l of lines.slice(0,5)){ctx.fillText(lines.length>5&&l===lines[4]?l.slice(0,22)+"…":l,12,y);y+=26;}
  y=Math.max(y+6,206);ctx.fillStyle="#9fbdcd";ctx.font="14px sans-serif";ctx.fillText("MONDO:"+String(d.ids[i]).padStart(7,"0"),12,y);y+=24;
  const srcs=[["GARD",1],["NORD",2],["Orphanet",4],["OMIM",8]].filter(([,b])=>f&b);let x=12;
  for(const[name]of srcs){ctx.fillStyle=SOURCE_COLOURS[name];ctx.beginPath();ctx.roundRect(x,y-14,ctx.measureText(name).width+16,20,6);ctx.fill();ctx.fillStyle="#08131c";ctx.font="bold 12px sans-serif";ctx.fillText(name,x+8,y);x+=ctx.measureText(name).width+24;}
  if(!srcs.length){ctx.fillStyle="#7c9aaa";ctx.font="12px sans-serif";ctx.fillText("Mondo rare subset only",12,y);}
  y+=30;ctx.fillStyle="#c2d7e2";ctx.font="13px sans-serif";ctx.fillText(d.syn[i]+" synonyms · "+d.xref[i]+" cross-refs · "+d.kids[i]+" subtypes",12,y);y+=20;
  ctx.fillStyle=(f&16)?"#b9d3e0":"#7c9aaa";ctx.fillText((f&16)?"Has a definition":"No definition in Mondo",12,y);
  tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;cardCache.set(i,tx);
  if(cardCache.size>240){const old=cardCache.keys().next().value;cardCache.get(old).dispose();cardCache.delete(old);}
  return tx;
 }
 function nearIndices(x,z,radius){
  if(!grid)return[];const out=[],cell=grid.cell,cx=Math.floor(x/cell),cz=Math.floor(z/cell),span=Math.ceil(radius/cell);
  for(let i=-span;i<=span;i++)for(let j=-span;j<=span;j++){const b=grid.get((cx+i)+","+(cz+j));if(!b)continue;for(const k of b){const dx=layout.pos[k*3]-x,dz=layout.pos[k*3+2]-z,dd=dx*dx+dz*dz;if(dd<radius*radius)out.push([dd,k]);}}
  out.sort((a,b)=>a[0]-b[0]);return out;
 }
 function updateCards(){
  if(!layout||state.level!=="mondo"||state.overview){for(const c of cards)c.visible=false;return;}
  const near=nearIndices(w.cam.p.x,w.cam.p.z,CARD_RADIUS).slice(0,CARD_POOL);
  const want=new Set(near.map(n=>n[1]));const free=[];
  for(const c of cards){if(c.userData.index>=0&&want.has(c.userData.index))want.delete(c.userData.index);else{c.userData.index=-1;c.visible=false;free.push(c);}}
  for(const i of want){const c=free.pop();if(!c)break;c.userData.index=i;c.material.map=cardTexture(i);c.material.needsUpdate=true;c.visible=true;}
  for(const c of cards){if(!c.visible)continue;const i=c.userData.index,x=layout.pos[i*3],z=layout.pos[i*3+2],dist=Math.hypot(x-w.cam.p.x,z-w.cam.p.z);
   c.position.set(x,LEVEL_Y+.62+(state.selected===i?.25:0),z);c.lookAt(w.cam.p.x,c.position.y,w.cam.p.z);c.material.opacity=clamp((CARD_RADIUS-dist)/1.4,0,1)*(state.selected===i||state.hover===i?1:.9);}
 }

 // ---------------------------------------------------------------- UI
 const style=document.createElement("style");
 style.textContent=`
#rmf-panel{position:absolute;right:14px;top:82px;bottom:78px;width:330px;pointer-events:auto;background:rgba(9,22,35,.96);border:1px solid rgba(164,200,218,.19);border-radius:14px;display:flex;flex-direction:column;box-shadow:0 16px 50px #0004;overflow:hidden}
#rmf-panel[hidden],#rmf-dock[hidden],#rmf-hint[hidden],#rmf-tip[hidden]{display:none!important}
#rmf-panel header{padding:10px 14px;border-bottom:1px solid rgba(164,200,218,.19)}#rmf-panel header strong{font:20px Georgia,serif;display:block}#rmf-panel header small{color:#acbac4;font-size:10px}
#rmf-panel .rmf-body{overflow:auto;padding:10px 14px;scrollbar-width:thin;flex:1}
#rmf-panel input{width:100%}#rmf-panel h3{font-size:10px;text-transform:uppercase;letter-spacing:1.1px;margin:14px 0 6px;color:#9dbacb}
#rmf-galleries{display:grid;gap:3px}#rmf-galleries button{display:flex;align-items:center;gap:7px;text-align:left;padding:5px 8px;font-size:11px}
#rmf-galleries button i{width:10px;height:10px;border-radius:3px;flex:none}#rmf-galleries button span:last-child{margin-left:auto;color:#7c9aaa;font-size:10px}
#rmf-sources{display:flex;flex-wrap:wrap;gap:5px}#rmf-sources button{font-size:10px;padding:4px 7px}
#rmf-results button{display:block;width:100%;text-align:left;margin:3px 0;padding:6px 9px;font-size:11px}#rmf-results small{display:block;color:#92aebb}
#rmf-detail{border:1px solid rgba(164,200,218,.19);border-radius:10px;padding:10px 12px;margin-top:8px;background:#0a1826}
#rmf-detail h2{font:20px/1.2 Georgia,serif;margin:4px 0 8px}#rmf-detail p{color:#c2d7e2;font-size:12px;margin:5px 0}#rmf-detail .ra-actions{margin-top:9px}
#rmf-detail .rmf-chip{display:inline-block;padding:2px 6px;border-radius:5px;font-size:10px;font-weight:700;color:#08131c;margin:0 4px 4px 0}
#rmf-panel footer{padding:6px 13px;border-top:1px solid rgba(164,200,218,.19);color:#d8c699;font-size:10px}
#rmf-dock,#rmf-hint{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#0b2030ef;border:1px solid #99c9dc55;border-radius:9px;padding:8px 12px;pointer-events:auto;white-space:nowrap}
#rmf-dock button,#rmf-hint button{margin-left:8px}
#rmf-tip{position:absolute;pointer-events:none;background:#081725ed;border:1px solid #a7cee444;color:#e0edf4;padding:6px 9px;border-radius:7px;font-size:11px;max-width:240px;z-index:30}
#rmf-tip small{display:block;color:#92aebb}
@media(max-width:1000px){#rmf-panel{width:285px}}
@media(max-width:700px){#rmf-panel{top:115px;left:8px;right:8px;width:auto;bottom:auto;max-height:46%}#rmf-dock,#rmf-hint{white-space:normal;font-size:10px;max-width:calc(100% - 20px)}}`;
 document.head.append(style);
 const panel=document.createElement("section");panel.id="rmf-panel";panel.hidden=true;panel.setAttribute("aria-label","Mondo floor");
 panel.innerHTML=`<header><strong>Mondo floor · Level −1</strong><small id="rmf-count">Loading the Mondo rare-disease set…</small></header><div class="rmf-body"><input id="rmf-search" type="search" placeholder="Find a disease by name…" aria-label="Search the Mondo floor"><div id="rmf-results"></div><div id="rmf-detail" hidden></div><h3>Galleries</h3><div id="rmf-galleries"></div><h3>Listed by</h3><div id="rmf-sources"><button data-bit="0" aria-pressed="true">All</button><button data-bit="2">NORD</button><button data-bit="1">GARD</button><button data-bit="4">Orphanet</button><button data-bit="8">OMIM</button></div><h3>Reading a tile</h3><p class="ra-muted" style="font-size:11px;margin:0">Colour = gallery. Circle, hexagon or square = disease, syndromic disease or disease group; bigger glyph = more subtypes. Dots: GARD, NORD, Orphanet, OMIM. Bars: synonyms (left), cross-references (right). Line = has a definition.</p></div><footer id="rmf-source">Mondo Disease Ontology · CC BY 4.0 · ontology terms, not medical advice.</footer>`;
 const dock=document.createElement("div");dock.id="rmf-dock";dock.hidden=true;dock.innerHTML=`<span id="rmf-where">Mondo floor</span><button id="rmf-overview" aria-pressed="false" title="See the whole floor from above (O)">Overview</button><button id="rmf-panel-toggle">Panel</button><button id="rmf-up">Library · Esc</button>`;
 const hint=document.createElement("div");hint.id="rmf-hint";hint.hidden=true;hint.innerHTML=`<span>Stairwell · E / Enter to go down to the Mondo floor</span><button id="rmf-descend">Go down</button>`;
 const tip=document.createElement("div");tip.id="rmf-tip";tip.hidden=true;
 ui.append(panel,dock,hint,tip);
 const nav=document.createElement("button");nav.id="rmf-nav";nav.textContent="Mondo floor";nav.title="Go down to the Mondo floor: every rare disease as an image";
 (ui.querySelector(".ra-bar .ra-group")||ui).appendChild(nav);

 function setStateAttr(i,v){if(!tiles||i<0)return;const a=tiles.geometry.attributes.aState;a.array[i]=v;a.needsUpdate=true;}
 function restate(){if(!tiles)return;const a=tiles.geometry.attributes.aState;a.array.fill(0);for(const i of state.matches)a.array[i]=3;if(state.hover>=0)a.array[state.hover]=Math.max(a.array[state.hover],1);if(state.selected>=0)a.array[state.selected]=2;a.needsUpdate=true;}
 function refreshFilters(){
  if(!tiles)return;const d=state.data,a=tiles.geometry.attributes.aAlpha;
  for(let i=0;i<d.n;i++){let v=1;if(state.filterBits&&!(d.flags[i]&state.filterBits))v=.12;if(state.focusCat>=0&&d.cat[i]!==state.focusCat)v=Math.min(v,.22);a.array[i]=v;}
  a.needsUpdate=true;
  let shown=0;for(let i=0;i<d.n;i++)if(a.array[i]>.5)shown++;
  get("rmf-count").textContent=fmt(shown)+" of "+fmt(d.n)+" rare diseases"+(state.notice?" · "+state.notice:"")+(state.source?" · "+state.source:"");
 }
 function renderGalleries(){
  const d=state.data,host=get("rmf-galleries");host.replaceChildren();
  d.categories.forEach((c,i)=>{if(!layout.counts[i])return;const b=document.createElement("button");b.dataset.cat=i;b.setAttribute("aria-pressed",String(state.focusCat===i));b.innerHTML=`<i style="background:${CATEGORY_COLOURS[i%24]}"></i><span>${esc(c.label)}</span><span>${fmt(layout.counts[i])}</span>`;b.title="Walk to the "+c.label+" gallery; click again to clear the highlight";host.append(b);});
 }
 function showDetail(i){
  const d=state.data,el=get("rmf-detail");if(i<0){el.hidden=true;return;}
  const f=d.flags[i],id="MONDO:"+String(d.ids[i]).padStart(7,"0"),cat=d.categories[d.cat[i]];
  const galleries=d.categories.filter((c,k)=>d.cats[i]&(1<<k)).map(c=>c.label);
  const srcs=[["GARD",1],["NORD",2],["Orphanet",4],["OMIM",8]].filter(([,b])=>f&b).map(([n])=>`<span class="rmf-chip" style="background:${SOURCE_COLOURS[n]}">${n}</span>`).join("");
  const def=d.definitions?.[i];
  el.hidden=false;el.innerHTML=`<span class="ra-badge" style="border-color:${CATEGORY_COLOURS[d.cat[i]%24]}66;color:${CATEGORY_COLOURS[d.cat[i]%24]}">${esc(cat.label.toUpperCase())}${(f&32)?" · SYNDROMIC":""}${(f&128)?" · GROUP":""}</span><h2>${esc(d.names[i])}</h2><p>${esc(id)}${galleries.length>1?" · also in "+esc(galleries.filter(g=>g!==cat.label).join(", ")):""}</p><p>${srcs||'<span class="ra-muted">Mondo rare subset only</span>'}</p><p>${d.syn[i]} synonyms · ${d.xref[i]} cross-references · ${d.kids[i]} subtypes beneath it · depth ${d.depth[i]} in the ontology</p>${def?`<p class="ra-quote">${esc(def)}</p>`:`<p class="ra-muted">${(f&16)?"The Mondo record has a definition; the full dataset carries it.":"No definition in Mondo."}</p>`}<div class="ra-actions"><button data-act="walk">Walk to it</button><a href="https://monarchinitiative.org/${encodeURIComponent(id)}" target="_blank" rel="noopener"><button type="button">Open Mondo record ↗</button></a><button data-act="clear">Clear</button></div><p class="ra-caution" style="font-size:10px">An ontology term, not clinical guidance. Nothing here replaces a clinician.</p>`;
 }
 function select(i){state.selected=i;restate();showDetail(i);if(i>=0){panel.hidden=false;}}
 function flyTo(x,z,lookX,lookZ,duration=1.3){state.overview=false;get("rmf-overview").setAttribute("aria-pressed","false");state.fly={from:w.cam.p.clone(),look:w.cam.target.clone(),to:new THREE.Vector3(x,LEVEL_Y+EYE,z),target:new THREE.Vector3(lookX,LEVEL_Y+.3,lookZ),elapsed:0,duration};}
 function walkToTile(i){const x=layout.pos[i*3],z=layout.pos[i*3+2];let dx=w.cam.p.x-x,dz=w.cam.p.z-z;const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;flyTo(x+dx*1.9,z+dz*1.9,x,z);}
 function walkToGallery(c){const s=layout.sectors.find(s=>s.c===c);if(!s||s.a1===s.a0)return;const mid=(s.a0+s.a1)/2,r=HUB_R-2.2;flyTo(Math.sin(mid)*r,Math.cos(mid)*r,Math.sin(mid)*(r+6),Math.cos(mid)*(r+6));}
 function search(){
  const q=get("rmf-search").value.trim().toLowerCase(),host=get("rmf-results");host.replaceChildren();state.matches=[];
  if(q.length>=2&&state.data){const d=state.data;for(let i=0;i<d.n&&state.matches.length<400;i++)if(d.names[i].toLowerCase().includes(q))state.matches.push(i);
   for(const i of state.matches.slice(0,40)){const b=document.createElement("button");b.dataset.index=i;b.innerHTML=esc(d.names[i])+"<small>"+esc(d.categories[d.cat[i]].label)+" · MONDO:"+String(d.ids[i]).padStart(7,"0")+"</small>";host.append(b);}
   if(!state.matches.length){const p=document.createElement("p");p.className="ra-muted";p.textContent="No disease on the floor matches that. Only Mondo names are searched.";host.append(p);}
   else if(state.matches.length>40){const p=document.createElement("p");p.className="ra-muted";p.textContent=fmt(state.matches.length)+" matches lit on the floor; the first 40 are listed.";host.append(p);}}
  restate();
 }

 // ---------------------------------------------------------------- levels
 function fade(toBlack){if(!w.fade)return Promise.resolve();w.fade.style.transition="opacity .45s";w.fade.style.opacity=toBlack?"1":"0";return new Promise(r=>setTimeout(r,toBlack?460:60)).then(()=>{if(!toBlack)setTimeout(()=>{if(w.fade)w.fade.style.transition="";},500);});}
 async function descend(){
  if(state.level!=="library"||state.busy)return;state.busy=true;
  if(window.RareAtlasWorkstations?.state?.seat)window.RareAtlasWorkstations.stand();
  A.demo=(A.demo||0)+1;R.state.fly=null;R.state.keys.clear();R.state.walk=false;get("rai-walk")?.setAttribute("aria-pressed","false");
  const inspector=get("rai-inspector");state.beforeInspector=inspector?inspector.hidden:true;
  await fade(true);
  state.level="mondo";if(inspector)inspector.hidden=true;hint.hidden=true;
  if(w.scene.fog){state.fogDensity=w.scene.fog.density;w.scene.fog.density=.0045;}
  const a=layout?layout.sectors[0].a0-.05:0,r=HUB_R-1.2;
  w.cam.p.set(Math.sin(a)*r,LEVEL_Y+EYE,Math.cos(a)*r);w.cam.target.set(Math.sin(a)*(r+4),LEVEL_Y+1.1,Math.cos(a)*(r+4));
  panel.hidden=matchMedia("(max-width:700px)").matches;dock.hidden=false;get("rmf-where").textContent="Mondo floor · "+(state.data?fmt(state.data.n)+" rare diseases":"loading");
  await fade(false);state.busy=false;canvas.focus({preventScroll:true});
 }
 async function ascend(instant){
  if(state.level!=="mondo"||state.busy)return;state.busy=true;
  if(!instant)await fade(true);
  state.level="library";state.overview=false;state.fly=null;state.drag=null;
  if(w.scene.fog&&state.fogDensity!=null)w.scene.fog.density=state.fogDensity;
  w.cam.p.set(STAIR.x,1.8,STAIR.z-3.6);w.cam.target.set(STAIR.x,1.3,STAIR.z);
  R.state.fly=null;R.state.walk=true;R.state.keys.clear();get("rai-walk")?.setAttribute("aria-pressed","true");
  const inspector=get("rai-inspector");if(inspector)inspector.hidden=R.state.drawer?false:state.beforeInspector;
  panel.hidden=dock.hidden=tip.hidden=true;for(const c of cards)c.visible=false;state.hover=-1;restate();
  if(!instant)await fade(false);state.busy=false;canvas.focus({preventScroll:true});
 }
 function toggleOverview(force){
  if(state.level!=="mondo")return;state.overview=force===undefined?!state.overview:force;get("rmf-overview").setAttribute("aria-pressed",String(state.overview));
  if(state.overview){const rOut=layout?Math.max(...layout.sectors.map(s=>s.rOut)):40;state.fly={from:w.cam.p.clone(),look:w.cam.target.clone(),to:new THREE.Vector3(0,LEVEL_Y+rOut*1.55,rOut*.55),target:new THREE.Vector3(0,LEVEL_Y,0),elapsed:0,duration:1.6};}
  else{const a=layout?layout.sectors[0].a0-.05:0,r=HUB_R-1.2;flyTo(Math.sin(a)*r,Math.cos(a)*r,Math.sin(a)*(r+4),Math.cos(a)*(r+4),1.4);}
 }

 // ---------------------------------------------------------------- input
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-LEVEL_Y),hitPoint=new THREE.Vector3();
 function tileAt(e){
  if(!layout)return-1;const b=canvas.getBoundingClientRect();ndc.set((e.clientX-b.left)/Math.max(1,b.width)*2-1,-(e.clientY-b.top)/Math.max(1,b.height)*2+1);ray.setFromCamera(ndc,w.camera);
  if(!ray.ray.intersectPlane(floorPlane,hitPoint))return-1;const near=nearIndices(hitPoint.x,hitPoint.z,Math.max(TILE*.75,hitPoint.distanceTo(w.cam.p)*.012));return near.length?near[0][1]:-1;
 }
 on(window,"pointerdown",e=>{
  if(e.target!==canvas)return;
  if(state.level==="mondo"){e.preventDefault();e.stopImmediatePropagation();state.drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};try{canvas.setPointerCapture(e.pointerId);}catch(_){}return;}
  if(R.state.fly||window.RareAtlasWorkstations?.state?.seat)return;
  const b=canvas.getBoundingClientRect();ndc.set((e.clientX-b.left)/Math.max(1,b.width)*2-1,-(e.clientY-b.top)/Math.max(1,b.height)*2+1);ray.setFromCamera(ndc,w.camera);
  if(ray.intersectObject(ground,true).length){e.preventDefault();e.stopImmediatePropagation();if(state.near)descend();else{R.state.walk=true;R.state.keys.clear();get("rai-walk")?.setAttribute("aria-pressed","true");R.state.fly={from:w.cam.p.clone(),look:w.cam.target.clone(),to:new THREE.Vector3(STAIR.x,1.8,STAIR.z-3.4),target:new THREE.Vector3(STAIR.x,1.2,STAIR.z),elapsed:0,duration:1.15};}}
 },true);
 on(window,"pointermove",e=>{
  if(state.level!=="mondo")return;
  if(state.drag&&state.drag.id===e.pointerId){e.stopImmediatePropagation();const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;state.drag.x=e.clientX;state.drag.y=e.clientY;if(Math.abs(dx)+Math.abs(dy)>2)state.drag.moved=true;
   if(state.overview){const rel=w.cam.p.clone().sub(w.cam.target),sp=new THREE.Spherical().setFromVector3(rel);sp.theta-=dx*.004;sp.phi=clamp(sp.phi+dy*.003,.12,1.2);rel.setFromSpherical(sp);w.cam.p.copy(w.cam.target).add(rel);}
   else{const rel=w.cam.target.clone().sub(w.cam.p),sp=new THREE.Spherical().setFromVector3(rel);sp.theta-=dx*.005;sp.phi=clamp(sp.phi+dy*.004,.5,2.3);sp.radius=6;rel.setFromSpherical(sp);w.cam.target.copy(w.cam.p).add(rel);}
   state.fly=null;return;}
  if(e.target!==canvas)return;e.stopImmediatePropagation();
  const i=tileAt(e);if(i!==state.hover){state.hover=i;restate();}
  if(i>=0){const d=state.data;tip.hidden=false;tip.innerHTML=esc(d.names[i])+"<small>"+esc(d.categories[d.cat[i]].label)+" · MONDO:"+String(d.ids[i]).padStart(7,"0")+"</small>";const b=ui.getBoundingClientRect();tip.style.left=Math.min(b.width-250,e.clientX-b.left+14)+"px";tip.style.top=(e.clientY-b.top+16)+"px";canvas.style.cursor="pointer";}
  else{tip.hidden=true;canvas.style.cursor="";}
 },true);
 const endDrag=e=>{if(state.level!=="mondo"||!state.drag||state.drag.id!==e.pointerId)return;e.stopImmediatePropagation();const moved=state.drag.moved;state.drag=null;try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
  if(!moved){const i=tileAt(e);if(i>=0){select(i);if(e.pointerType==="touch")walkToTile(i);}else select(-1);}};
 on(window,"pointerup",endDrag,true);on(window,"pointercancel",endDrag,true);
 on(window,"wheel",e=>{if(state.level!=="mondo"||e.target!==canvas)return;e.preventDefault();e.stopImmediatePropagation();if(state.overview){const rel=w.cam.p.clone().sub(w.cam.target);rel.multiplyScalar(clamp(1+e.deltaY*.001,.9,1.1));if(rel.length()>12&&rel.length()<200)w.cam.p.copy(w.cam.target).add(rel);}},{capture:true,passive:false});
 on(window,"keydown",e=>{
  const k=e.key.toLowerCase();
  if(state.level==="mondo"){
   if(ui.contains(e.target)&&e.target.tagName==="INPUT"){if(k==="escape"){e.target.blur();canvas.focus();}return;}
   e.stopImmediatePropagation();
   if(k==="escape"){e.preventDefault();if(state.selected>=0)select(-1);else ascend();return;}
   if(k==="o"){e.preventDefault();toggleOverview();return;}
   if(["w","a","s","d","shift","arrowup","arrowdown","arrowleft","arrowright"].includes(k)){e.preventDefault();state.keys.add(k);state.fly=null;if(state.overview)toggleOverview(false);}
   return;
  }
  if(ui.contains(e.target)||e.target.isContentEditable)return;
  if(state.near&&(k==="e"||k==="enter")){e.preventDefault();e.stopImmediatePropagation();descend();}
 },true);
 on(window,"keyup",e=>{state.keys.delete(e.key.toLowerCase());},true);
 on(window,"blur",()=>state.keys.clear());
 on(window,"click",e=>{if(state.level!=="mondo")return;const b=e.target.closest("button");if(b&&!panel.contains(b)&&!dock.contains(b)&&(b.dataset.collection!==undefined||["walk","overview","approach","tour","map"].includes(b.dataset.action)||b.id==="rac-computers"))ascend(true);},true);
 on(nav,"click",()=>{if(state.level==="mondo")return;if(state.near)descend();else{R.state.walk=true;R.state.keys.clear();get("rai-walk")?.setAttribute("aria-pressed","true");R.state.fly={from:w.cam.p.clone(),look:w.cam.target.clone(),to:new THREE.Vector3(STAIR.x,1.8,STAIR.z-3.4),target:new THREE.Vector3(STAIR.x,1.2,STAIR.z),elapsed:0,duration:1.15};canvas.focus({preventScroll:true});}});
 on(get("rmf-descend"),"click",descend);on(get("rmf-up"),"click",ascend);on(get("rmf-overview"),"click",()=>toggleOverview());
 on(get("rmf-panel-toggle"),"click",()=>{panel.hidden=!panel.hidden;});
 on(get("rmf-search"),"input",search);
 on(panel,"click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.index!==undefined){const i=Number(b.dataset.index);select(i);walkToTile(i);}
  else if(b.dataset.cat!==undefined){const c=Number(b.dataset.cat);state.focusCat=state.focusCat===c?-1:c;refreshFilters();renderGalleries();if(state.focusCat>=0)walkToGallery(c);}
  else if(b.dataset.bit!==undefined){state.filterBits=Number(b.dataset.bit);for(const x of get("rmf-sources").children)x.setAttribute("aria-pressed",String(Number(x.dataset.bit)===state.filterBits));refreshFilters();}
  else if(b.dataset.act==="walk"&&state.selected>=0)walkToTile(state.selected);
  else if(b.dataset.act==="clear")select(-1);
 });

 // ---------------------------------------------------------------- loop
 const forward=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),step=new THREE.Vector3();
 function tick(ms){
  if(state.disposed)return;if(A.world!==w){dispose();return;}
  const dt=state.last?Math.min(.05,(ms-state.last)/1000):0;state.last=ms;tileMat.uniforms.uTime.value=ms/1000;
  if(!document.hidden){
   if(state.level==="mondo"){
    R.state.walk=false;R.state.fly=null;R.state.keys.clear();w.pointer.tx=w.pointer.ty=0;
    if(state.fly){const f=state.fly;f.elapsed+=dt;const t=clamp(f.elapsed/f.duration,0,1),k=ease(t);w.cam.p.copy(f.from).lerp(f.to,k);w.cam.target.copy(f.look).lerp(f.target,k);if(t>=1)state.fly=null;}
    else if(!state.overview&&state.keys.size){
     forward.copy(w.cam.target).sub(w.cam.p);forward.y=0;forward.normalize();right.crossVectors(forward,up).normalize();
     const z=(state.keys.has("w")||state.keys.has("arrowup")?1:0)-(state.keys.has("s")||state.keys.has("arrowdown")?1:0);
     const x=(state.keys.has("d")||state.keys.has("arrowright")?1:0)-(state.keys.has("a")||state.keys.has("arrowleft")?1:0);
     step.copy(forward).multiplyScalar(z).addScaledVector(right,x);
     if(step.lengthSq()){step.normalize().multiplyScalar(dt*(state.keys.has("shift")?7:3.2));const nx=w.cam.p.x+step.x,nz=w.cam.p.z+step.z,r=Math.hypot(nx,nz);
      if(r<FLOOR_R-2.5&&r>.9){w.cam.p.x=nx;w.cam.p.z=nz;w.cam.target.x+=step.x;w.cam.target.z+=step.z;}}
     w.cam.p.y=LEVEL_Y+EYE;
    }
    for(const l of galleryLabels.children)if(l.userData.label){l.lookAt(w.cam.p);l.visible=state.overview||Math.hypot(l.position.x-w.cam.p.x,l.position.z-w.cam.p.z)>9;}
    updateCards();
    state.near=false;hint.hidden=true;
   }else{
    const nearStairs=R.state.walk&&!R.state.fly&&Math.hypot(w.cam.p.x-STAIR.x,w.cam.p.z-STAIR.z)<3.8&&!window.RareAtlasWorkstations?.state?.seat;
    state.near=nearStairs;hint.hidden=!nearStairs;
   }
  }
  state.raf=requestAnimationFrame(tick);
 }

 // ---------------------------------------------------------------- data
 async function fetchData(){
  for(const url of DATA_URLS){
   try{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);const res=await fetch(url,{signal:ctrl.signal});clearTimeout(timer);if(!res.ok)continue;const json=await res.json();
    if(json?.format?.startsWith("mondo-floor-compact"))return{data:decode(json),source:url.startsWith("asksary-asset")?"library asset":new URL(url).hostname};
    if(Array.isArray(json?.records))return{data:fromRecords(json),source:url.startsWith("asksary-asset")?"library asset":new URL(url).hostname};
   }catch(error){console.warn("Mondo floor: could not load",url,error.message);}
  }
  if(window.MONDO_FLOOR_SAMPLE)return{data:decode(window.MONDO_FLOOR_SAMPLE),source:"embedded sample",notice:"sample only — the full set could not be fetched; upload mondo-floor.compact.json to the library as “mondo-floor” or set window.MONDO_FLOOR_URL"};
  throw new Error("No Mondo data could be loaded.");
 }
 function adopt({data,source,notice}){
  if(state.disposed)return;state.data=data;state.source=source;state.notice=notice||"";
  buildTiles(data);renderGalleries();refreshFilters();
  if(state.level==="mondo")get("rmf-where").textContent="Mondo floor · "+fmt(data.n)+" rare diseases";
  get("rmf-source").textContent="Mondo Disease Ontology"+(data.builtAt?" · built "+data.builtAt.slice(0,10):"")+" · "+fmt(data.n)+" terms · CC BY 4.0 · not medical advice.";
 }
 fetchData().then(adopt).catch(error=>{get("rmf-count").textContent="Mondo data unavailable: "+error.message;console.error(error);});

 function dispose(){
  if(state.disposed)return;state.disposed=true;cancelAnimationFrame(state.raf);
  if(state.level==="mondo"){if(w.scene.fog&&state.fogDensity!=null)w.scene.fog.density=state.fogDensity;w.cam.p.set(STAIR.x,1.8,STAIR.z-3.6);w.cam.target.set(STAIR.x,1.3,STAIR.z);R.state.walk=true;const inspector=get("rai-inspector");if(inspector)inspector.hidden=state.beforeInspector;if(w.fade)w.fade.style.opacity="0";}
  off.forEach(fn=>fn());disposeTiles();root.removeFromParent();ground.removeFromParent();for(const tx of cardCache.values())tx.dispose();cardCache.clear();
  resources.forEach(r=>{try{r.dispose();}catch(_){}});panel.remove();dock.remove();hint.remove();tip.remove();nav.remove();style.remove();
  if(window.RareAtlasMondoFloor?.root===root)window.RareAtlasMondoFloor=null;
 }
 window.RareAtlasMondoFloor={root,ground,state,descend,ascend,toggleOverview,select,walkToTile,walkToGallery,search,adopt,dispose,get layout(){return layout;}};
 state.raf=requestAnimationFrame(tick);
 return "Added the Mondo floor: a stairwell beside the library leads to a lower level where every Mondo rare disease is a tile drawn from its own metadata, grouped by body system, with search, galleries, source filters and an overview. Existing scene, computers and research are preserved.";
}
if(typeof window!=="undefined")window.installMondoFloor=installMondoFloor;
