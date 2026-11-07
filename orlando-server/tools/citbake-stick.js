#!/usr/bin/env node
/*
 * 엑시즈 주민 빚은 모양 굽기
 *
 * 주민 60가지(CIT_OUTFIT + CIT_FINE)를 이름 있는 NPC처럼 한 덩어리로 매끈하게 빚으면(npcSculptMerge)
 * 한 사람에 몇 초씩 걸리고 면이 수십만 개라 게임에서 바로 쓸 수 없다.
 * 그래서 이 도구로 미리 빚고, 면을 줄여(meshoptimizer) public/citbake/s_<id>.json 에 굽는다.
 * 게임은 같은 차림의 뼈대(막대 인형)를 만들고 구운 모양을 입힌다 (citSculptStick).
 *
 * 차림(CIT_OUTFIT·CIT_FINE)이나 npcFine·npcSculptMerge 를 바꾸면 다시 구워야 한다.
 * (안 구우면 뼈 이름표가 안 맞는 사람은 빚지 않은 모양으로 보인다)
 *
 * 쓰는 법 (게임 서버를 이 도구가 띄운다):
 *   cd <아무 빈 폴더> && npm i meshoptimizer@0.21.0 playwright   # 한 번만
 *   NODE_PATH=<그 폴더>/node_modules node orlando-server/tools/citbake-stick.js [id ...]
 *   (chromium 이 따로 있으면 CHROME=<경로>)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const req = m => { try { return require(m); } catch (e) { return require('/opt/node-tools/node_modules/' + m); } };
const { chromium } = req('playwright');
const { MeshoptSimplifier: MS } = req('meshoptimizer');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'citbake');
const PORT = 8139;
const RATIO = +(process.env.RATIO || .01);   // 빚은 겉면의 면을 이만큼만 남긴다 (1%: 50만 → 5천, 눈으로 보면 거의 같다)

/* 빚은 사람 하나를 뼈 이름표 + 조각 목록으로 (조각마다 뼈 하나·색 하나) */
const DUMP = `(g=>{const b64=a=>{const u=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};
  g.position.set(0,0,0);g.rotation.set(0,0,0);const cl=g.userData.cloth;if(cl){cl.skG.scale.setScalar(1);cl.lap.scale.setScalar(1);}
  const olds=[];g.traverse(o=>{if(o.userData.nsmOld)olds.push(o);});for(const o of olds)o.parent.remove(o);   /* 빚기 전 옛 조각은 버린다 */
  g.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(g.matrixWorld).invert();const {bones,sig}=citBoneSigs(g),bi=new Map(bones.map((b,i)=>[b,i]));
  const parts=[],m4=new THREE.Matrix4(),nm=new THREE.Matrix3(),c=new THREE.Color(),v=new THREE.Vector3(),w=new THREE.Vector3();
  g.traverse(p=>{if(!p.isMesh||p.userData.marker||!p.geometry||!p.geometry.attributes.position)return;for(let q=p;q;q=q.parent)if(q.visible===false)return;
    const mt=Array.isArray(p.material)?p.material[0]:p.material;if(mt.visible===false)return;
    let b=p.children.length?p:p.parent;while(b&&!bi.has(b))b=b.parent;const k=bi.get(b)||0;
    m4.multiplyMatrices(inv,p.matrixWorld);nm.getNormalMatrix(m4);const G=p.geometry;if(!G.attributes.normal)G.computeVertexNormals();
    const pa=G.attributes.position,na=G.attributes.normal,n=pa.count,P=new Float32Array(n*3),N=new Float32Array(n*3);
    for(let i=0;i<n;i++){v.fromBufferAttribute(pa,i).applyMatrix4(m4);w.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();P.set([v.x,v.y,v.z],i*3);N.set([w.x,w.y,w.z],i*3);}
    c.copy(mt.color||c.set(0xffffff));if(mt.emissive&&mt.emissiveIntensity>.3)c.lerp(mt.emissive,.5);
    const vc=mt.vertexColors&&G.attributes.color;let C=null;if(vc){C=new Float32Array(n*3);for(let i=0;i<n;i++)C.set([c.r*vc.getX(i),c.g*vc.getY(i),c.b*vc.getZ(i)],i*3);}
    parts.push({b:k,c:[c.r,c.g,c.b],s:p.userData.sculpted?1:0,ds:mt.side===THREE.DoubleSide?1:0,P:b64(P),N:b64(N),C:C&&b64(C),I:G.index?b64(Uint32Array.from(G.index.array)):null,n});});
  return JSON.stringify({sig,parts});})`;

const f32 = s => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const u32 = s => { const b = Buffer.from(s, 'base64'); return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

/* 조각들을 줄이고 한 덩어리로: 자리(Uint16, 상자 안 비율)·법선(Int8)·색(sRGB Uint8)·뼈 번호(Uint8)·면 번호 */
function pack(d) {
  const P = [], N = [], C = [], B = [], I = [];
  const dbg = [];
  for (const p of d.parts) {
    const t0 = I.length;
    const pos = f32(p.P), nor = f32(p.N), col = p.C ? f32(p.C) : null, n = p.n;
    let idx = p.I ? u32(p.I) : null;
    if (!idx) {   // 빚지 않은 조각(눈·소품): 자리·법선·색이 같은 꼭짓점은 하나로
      const k = new Map(); idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) { const key = [0, 1, 2].map(a => Math.round(pos[i * 3 + a] * 1e4) + ',' + Math.round(nor[i * 3 + a] * 100)).join(';') + (col ? ';' + Math.round(col[i * 3] * 255) + ',' + Math.round(col[i * 3 + 1] * 255) + ',' + Math.round(col[i * 3 + 2] * 255) : '');
        if (!k.has(key)) k.set(key, i); idx[i] = k.get(key); }
    }
    if (p.s && idx.length > 300) {
      const tgt = Math.max(120, Math.floor(idx.length * RATIO / 3) * 3);
      idx = MS.simplify(idx, pos, 3, tgt, .02, ['LockBorder'])[0];
    } else if (!p.s && idx.length > 1500) idx = MS.simplify(idx, pos, 3, Math.floor(idx.length * .5 / 3) * 3, .004, ['LockBorder'])[0];   // 치마처럼 촘촘한 천은 반쯤 (주름은 남게)
    // (주민 재질은 양면이라 천 뒷면을 따로 넣지 않는다)
    const map = new Map(), push = v => {
      P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      if (col) C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); else C.push(p.c[0], p.c[1], p.c[2]); B.push(p.b); return P.length / 3 - 1;
    };
    for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (!map.has(v)) map.set(v, push(v)); I.push(map.get(v)); }
    dbg.push([(I.length - t0) / 3, p.s, p.b, p.c.map(x => x.toFixed(2)).join(',')]);
  }
  if (process.env.DEBUG) console.log(dbg.sort((a, b) => b[0] - a[0]).slice(0, 12));
  const nv = P.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[i * 3 + a]); hi[a] = Math.max(hi[a], P[i * 3 + a]); }
  const qP = new Uint16Array(nv * 3), qN = new Int8Array(nv * 3), qC = new Uint8Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) {
    const a = i % 3; qP[i] = Math.round((P[i] - lo[a]) / ((hi[a] - lo[a]) || 1) * 65535);
    qN[i] = Math.round(Math.max(-1, Math.min(1, N[i])) * 127);
    const l = Math.max(0, Math.min(1, C[i])); qC[i] = Math.round((l <= .0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - .055) * 255);
  }
  const e = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return { v: 1, sig: d.sig, nv, tri: I.length / 3, lo: lo.map(x => +x.toFixed(5)), hi: hi.map(x => +x.toFixed(5)), P: e(qP), N: e(qN), C: e(qC), B: e(Uint8Array.from(B)), I: e(nv < 65536 ? Uint16Array.from(I) : Uint32Array.from(I)), i32: nv >= 65536 ? 1 : 0 };
}

(async () => {
  await MS.ready;
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const up = () => new Promise(r => http.get('http://127.0.0.1:' + PORT + '/', res => { res.resume(); r(true); }).on('error', () => r(false)));
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise(r => setTimeout(r, 1000));
  const b = await chromium.launch({ executablePath: process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
  try {
    const pg = await b.newPage(); pg.setDefaultTimeout(1800000);
    pg.on('pageerror', e => console.log('페이지 오류:', String(e).slice(0, 300)));
    await pg.route(/^https:\/\/(?!localhost)/, r => r.abort());
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8').replace('BOOT.ready();loop();', 'BOOT.ready();loop();window.__E=s=>eval(s);');
    await pg.route(u => new URL(u).pathname === '/', r => r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
    await pg.goto('http://localhost:' + PORT + '/', { waitUntil: 'commit' });
    await pg.waitForFunction(() => window.__E, null, { timeout: 1800000, polling: 2000 });
    const ids = process.argv.slice(2).length ? process.argv.slice(2) : await pg.evaluate(() => __E('CITM.ids.filter(id=>CIT_FINE[id])'));
    console.log('굽기', ids.length, '가지');
    for (const id of ids) {
      const t0 = Date.now();
      const js = await pg.evaluate(async ([id, DUMP]) => __E(`(async()=>{while(NSM.wait.size)await new Promise(r=>setTimeout(r,300));
        const g=makeNpcStick(citStickLook(${JSON.stringify(id)}));if(g.userData.marker){g.remove(g.userData.marker);g.userData.marker=null;}
        while(NSM.wait.size)await new Promise(r=>setTimeout(r,300));return (${DUMP})(g);})()`), [id, DUMP]);
      const r = pack(JSON.parse(js)), file = path.join(OUT, 's_' + id + '.json');
      fs.writeFileSync(file, JSON.stringify(r));
      console.log(id, '면', r.tri, '꼭짓점', r.nv, Math.round(fs.statSync(file).size / 1024) + 'KB', ((Date.now() - t0) / 1000).toFixed(1) + '초');
    }
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
