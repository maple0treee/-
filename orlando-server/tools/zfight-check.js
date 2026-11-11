/* 겹친 면 검사 (요동/z-fighting 찾기)
   같은 평면(±1.5mm)에 겹쳐 놓인, 색·재질·메시가 다른 두 면을 찾아 넓은 순서로 보여 준다.
   이런 면은 시선을 움직이면 두 색이 번갈아 그려져 흔들린다.

   쓰는 법 (서버를 먼저 켠다: cd orlando-server && npm install && PORT=8123 node server.js)
     node tools/zfight-check.js x0 z0 x1 z1 [--pre "자바스크립트"] [--tol 0.0015]
   예) 중앙 시장:        node tools/zfight-check.js 7650 -100 7750 100
       허칠 산장 안:     node tools/zfight-check.js 9470 -20 9530 20 --pre "HCHL.u=1;HCHL.start()" --wait "HCHL.done" --hidden
       가넬 저택:        node tools/zfight-check.js -252 -810 -228 -790 --hidden
   --pre 는 게임 안 이름(IIFE 안)으로 실행된다. --wait 는 참이 될 때까지 기다린다.
   --hidden 을 붙이면 지금 숨겨진(다른 맵에 있어 꺼 둔) 것도 검사한다. 실내 맵은 거의 늘 이것을 붙인다.
   결과 한 줄: [x, y, z] 넓이㎡ 법선 색A/색B. 보이지 않는 면(다른 면이 바로 앞을 막는 경우)은 뺀다.
   Playwright·chromium은 클라우드 세션에 깔려 있는 것을 쓴다 (PW 환경 변수로 바꿀 수 있다). */
const PW=process.env.PW||'/opt/node-tools/node_modules/playwright',EXE=process.env.CHROME||'/opt/pw-browsers/chromium';
const {chromium}=require(PW);const fs=require('fs'),path=require('path');
const a=process.argv.slice(2),opt=k=>{const i=a.indexOf(k);return i>=0?a.splice(i,2)[1]:null;};
const PRE=opt('--pre'),WAIT=opt('--wait'),TOL=+(opt('--tol')||.0015);const ALL=a.includes('--hidden');if(ALL)a.splice(a.indexOf('--hidden'),1);const R=a.slice(0,4).map(Number);
if(R.length<4||R.some(isNaN)){console.log('쓰는 법: node tools/zfight-check.js x0 z0 x1 z1 [--pre JS] [--wait JS] [--tol 0.0015]');process.exit(1);}
const SRC=process.env.SRC||path.join(__dirname,'..','public','index.html');   /* SRC로 다른 index.html(예: 고치기 전 것)을 검사할 수 있다 */
(async()=>{const b=await chromium.launch({executablePath:EXE,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-proxy-server','--ignore-gpu-blocklist']});
  const pg=await b.newPage({viewport:{width:800,height:500}});pg.setDefaultTimeout(1500000);
  pg.on('pageerror',e=>console.log('페이지 오류:',e.message));
  await pg.route(/^https:\/\/(?!localhost)/,r=>r.abort());
  await pg.route('http://localhost:8123/',r=>{const h=fs.readFileSync(SRC,'utf8').replace('BOOT.ready();loop();','BOOT.ready();loop();window.__E=s=>eval(s);');r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:h});});
  await pg.goto('http://localhost:8123/',{waitUntil:'commit'});
  await pg.waitForFunction(()=>!!window.__E);console.log('게임을 불러왔다');
  if(PRE)await pg.evaluate(s=>__E(s),PRE);
  if(WAIT)await pg.waitForFunction(s=>!!__E(s),WAIT);
  await pg.waitForTimeout(2000);
  const res=await pg.evaluate(([R,TOL,PRE,ALL])=>{const THREE=__E('THREE'),scene=__E('scene');if(PRE)try{__E(PRE);}catch(e){}scene.updateMatrixWorld(true);
    const tris=[],v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
    const add=o=>{const g=o.geometry,P=g.attributes.position,C=g.attributes.color,idx=g.index,n=idx?idx.count:P.count;const mats=Array.isArray(o.material)?o.material:[o.material];
      const grp=g.groups&&g.groups.length?g.groups:[{start:0,count:n,materialIndex:0}];
      for(const gr of grp){const m=mats[gr.materialIndex||0]||mats[0];if(!m||m.transparent||m.depthWrite===false||m.polygonOffset||m.visible===false)continue;
        const col=(m.color?m.color.getHex():0)^((m.map?m.map.id:0)<<4);
        for(let i=gr.start;i+2<Math.min(n,gr.start+gr.count);i+=3){for(let k=0;k<3;k++){const q=idx?idx.getX(i+k):i+k;v[k].fromBufferAttribute(P,q).applyMatrix4(o.matrixWorld);}
          const cx=(v[0].x+v[1].x+v[2].x)/3,cz=(v[0].z+v[1].z+v[2].z)/3;if(cx<R[0]||cx>R[2]||cz<R[1]||cz>R[3])continue;
          const nn=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));if(nn.length()<2e-4)continue;nn.normalize();
          let c=col;if(C){const q=idx?idx.getX(i):i;c^=((C.getX(q)*255|0)<<16)|((C.getY(q)*255|0)<<8)|(C.getZ(q)*255|0);}
          tris.push({p:[v[0].clone(),v[1].clone(),v[2].clone()],n:nn,d:nn.dot(v[0]),c,o:o.id});}}};
    const meshes=[];scene.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||!o.geometry.attributes.position)return;let p=o,vis=true;while(p){if(!p.visible)vis=false;p=p.parent;}if(!vis&&!ALL)return;
      const g=o.geometry;if(!g.boundingSphere)g.computeBoundingSphere();const c=g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld),r=g.boundingSphere.radius*o.matrixWorld.getMaxScaleOnAxis();
      if(r>2000||c.x+r<R[0]||c.x-r>R[2]||c.z+r<R[1]||c.z-r>R[3])return;meshes.push(o);add(o);});
    const B=new Map();for(const t of tris){const k=Math.round(t.n.x*200)+','+Math.round(t.n.y*200)+','+Math.round(t.n.z*200);(B.get(k)||B.set(k,[]).get(k)).push(t);}
    const area=p=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-a[1]*b[0];}return s/2;};
    const clip=(poly,a,b)=>{const o=[];for(let i=0;i<poly.length;i++){const P=poly[i],Q=poly[(i+1)%poly.length],s=x=>(b[0]-a[0])*(x[1]-a[1])-(b[1]-a[1])*(x[0]-a[0]);const sp=s(P),sq=s(Q);if(sp>=0)o.push(P);if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);o.push([P[0]+(Q[0]-P[0])*t,P[1]+(Q[1]-P[1])*t]);}}return o;};
    const hits=[];
    for(const arr of B.values()){if(arr.length<2)continue;const n=arr[0].n,u=new THREE.Vector3(Math.abs(n.y)<.9?0:1,Math.abs(n.y)<.9?1:0,0).cross(n).normalize(),w=n.clone().cross(u);arr.sort((p,q)=>p.d-q.d);
      const P2=t=>{if(t.q)return t.q;const r=t.p.map(p=>[p.dot(u),p.dot(w)]);if(area(r)<0)r.reverse();t.bb=[Math.min(...r.map(z=>z[0])),Math.max(...r.map(z=>z[0])),Math.min(...r.map(z=>z[1])),Math.max(...r.map(z=>z[1]))];return t.q=r;};
      for(let i=0;i<arr.length;i++){const A=arr[i];for(let j=i+1;j<arr.length&&arr[j].d-A.d<TOL;j++){const T=arr[j];if(T.c===A.c&&T.o===A.o)continue;const pa=P2(A),pb=P2(T);
        if(T.bb[1]<A.bb[0]||T.bb[0]>A.bb[1]||T.bb[3]<A.bb[2]||T.bb[2]>A.bb[3])continue;let poly=pb;for(let q=0;q<3&&poly.length;q++)poly=clip(poly,pa[q],pa[(q+1)%3]);if(poly.length<3)continue;const ar=area(poly);if(ar<.003)continue;
        let qx=0,qy=0;for(const q of poly){qx+=q[0];qy+=q[1];}qx/=poly.length;qy/=poly.length;const c=u.clone().multiplyScalar(qx).addScaledVector(w,qy).addScaledVector(n,A.d);
        hits.push({c,n:n.clone(),ar,cols:[A.c,T.c].map(x=>(x>>>0).toString(16)).sort().join('/')});}}}
    /* 가까운 것끼리 묶고, 면 바로 앞이 막혀 있으면(안 보이면) 뺀다 */
    const G=new Map();for(const h of hits){const k=[Math.round(h.c.x/1.5),Math.round(h.c.y/.5),Math.round(h.c.z/1.5),Math.round(h.n.x),Math.round(h.n.y),Math.round(h.n.z),h.cols].join('|');const g=G.get(k);if(g){g.ar+=h.ar;if(h.ar>g.h.ar)g.h=h;}else G.set(k,{h,ar:h.ar});}
    const sides=new Map();for(const o of meshes)for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(!sides.has(m))sides.set(m,m.side);m.side=THREE.DoubleSide;}
    const rc=new THREE.Raycaster();rc.far=25;const out=[];
    for(const g of G.values()){const h=g.h;rc.set(h.c.clone().addScaledVector(h.n,.02),h.n);const it=rc.intersectObjects(meshes,false)[0];
      if(it&&it.face&&(it.face.normal.clone().transformDirection(it.object.matrixWorld).dot(h.n)>0||it.distance<.04))continue;
      if(!it&&h.n.y<-.5)continue;   /* 아래를 보는 면인데 그 아래에 아무것도 없으면(맨 아래 바닥 밑면) 볼 사람이 없다 */
      out.push([+h.c.x.toFixed(2),+h.c.y.toFixed(2),+h.c.z.toFixed(2),+g.ar.toFixed(3),[Math.round(h.n.x),Math.round(h.n.y),Math.round(h.n.z)].join(','),h.cols]);}
    for(const [m,s] of sides)m.side=s;
    out.sort((p,q)=>q[3]-p[3]);return {tris:tris.length,out};},[R,TOL,PRE,ALL]);
  const tot=res.out.reduce((s,h)=>s+h[3],0);
  console.log(`삼각형 ${res.tris}개 검사, 겹친 면 ${res.out.length}곳, 넓이 합 ${tot.toFixed(2)}㎡`);
  for(const h of res.out.slice(0,40))console.log(`  [${h[0]}, ${h[1]}, ${h[2]}]  ${h[3]}㎡  법선 ${h[4]}  ${h[5]}`);
  await b.close();process.exit(res.out.length&&tot>.5?2:0);})();
