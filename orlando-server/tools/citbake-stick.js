#!/usr/bin/env node
/*
 * 엑시즈 주민 빚은 모양 굽기
 *
 * 주민 60가지(CIT_OUTFIT + CIT_FINE)를 이름 있는 NPC처럼 한 덩어리로 매끈하게 빚으면(npcSculptMerge)
 * 한 사람에 몇 초씩 걸리고 면이 수십만 개라 게임에서 바로 쓸 수 없다.
 * 그래서 이 도구로 미리 빚고, 면을 줄여(meshoptimizer) public/citbake/s_<id>.json 에 굽는다.
 * 게임은 같은 차림의 뼈대(막대 인형)를 만들고 구운 모양을 입힌다 (citSculptStick).
 *
 * 2판(v:2, 2026-11-11): 새 천 옷(npcBodyHQ)까지 함께 굽는다. 꼭짓점마다 천 결(ctile 0~3 평직·굵은 천·가죽·띠, 4 쇠붙이, 255 없음)·uv·두 뼈 스키닝.
 *   게임은 옷 없이 만든 뼈대(CIT_HQ='skel')에 입히고, 한 장에 모은 천 결 재질(citHQMat)로 한 번에 그린다.
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
const RATIO = +(process.env.RATIO || .01);
const HQR = +(process.env.HQR || .25);   // 새 천 옷은 면을 이만큼까지 덜고
const HQE = +(process.env.HQE || .02);   // 모양이 이만큼(조각 크기 대비)까지만 달라지게

/* 빚은 사람 하나를 뼈 이름표 + 조각 목록으로 (조각마다 뼈 하나·색 하나) */
const DUMP = `(g=>{const b64=a=>{const u=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s);};
  g.position.set(0,0,0);g.rotation.set(0,0,0);const cl=g.userData.cloth;if(cl){cl.skG.scale.setScalar(1);cl.lap.scale.setScalar(1);}
  const olds=[];g.traverse(o=>{if(o.userData.nsmOld)olds.push(o);});for(const o of olds)o.parent.remove(o);   /* 빚기 전 옛 조각은 버린다 */
  g.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(g.matrixWorld).invert();const {bones,sig}=citBoneSigs(g),bi=new Map(bones.map((b,i)=>[b,i]));
  const parts=[],m4=new THREE.Matrix4(),nm=new THREE.Matrix3(),c=new THREE.Color(),v=new THREE.Vector3(),w=new THREE.Vector3();
  g.traverse(p=>{if(!p.isMesh||p.userData.marker||!p.geometry||!p.geometry.attributes.position)return;for(let q=p;q;q=q.parent)if(q.visible===false)return;
    const mt=Array.isArray(p.material)?p.material[0]:p.material;if(mt.visible===false)return;
    let b=bi.has(p)?p:p.parent;while(b&&!bi.has(b))b=b.parent;const k=bi.get(b)||0;
    m4.multiplyMatrices(inv,p.matrixWorld);nm.getNormalMatrix(m4);const G=p.geometry;if(!G.attributes.normal)G.computeVertexNormals();
    const pa=G.attributes.position,na=G.attributes.normal,n=pa.count,P=new Float32Array(n*3),N=new Float32Array(n*3);
    for(let i=0;i<n;i++){v.fromBufferAttribute(pa,i).applyMatrix4(m4);w.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();P.set([v.x,v.y,v.z],i*3);N.set([w.x,w.y,w.z],i*3);}
    c.copy(mt.color||c.set(0xffffff));if(mt.emissive&&mt.emissiveIntensity>.3)c.lerp(mt.emissive,.5);
    const vc=mt.vertexColors&&G.attributes.color;let C=null;if(vc){C=new Float32Array(n*3);for(let i=0;i<n;i++)C.set([c.r*vc.getX(i),c.g*vc.getY(i),c.b*vc.getZ(i)],i*3);}
    /* 새 천 옷: 결(ctile)·uv·두 뼈 스키닝 */
    let t=255;if(mt.map){for(let j=0;j<LK_AT.length;j++)if(_LKT[LK_AT[j]]&&_LKT[LK_AT[j]].map===mt.map)t=j;}else if((mt.metalness||0)>.3)t=4;
    const ua=t<4&&G.attributes.uv;let U=null;if(ua){U=new Float32Array(n*2);for(let i=0;i<n;i++){U[i*2]=ua.getX(i);U[i*2+1]=ua.getY(i);}}
    let S2=null,W2=null;if(p.isSkinnedMesh&&G.attributes.skinIndex){const sk=p.skeleton.bones.map(b=>{while(b&&!bi.has(b))b=b.parent;return bi.get(b)||0;}),si=G.attributes.skinIndex,sw=G.attributes.skinWeight;
      S2=new Uint8Array(n*2);W2=new Float32Array(n);for(let i=0;i<n;i++){const w0=sw.getX(i),w1=sw.getY(i);S2[i*2]=sk[si.getX(i)];S2[i*2+1]=sk[si.getY(i)];W2[i]=w0+w1>0?w1/(w0+w1):0;}}
    parts.push({b:k,c:[c.r,c.g,c.b],s:p.userData.sculpted?1:0,h:p.userData.noSculpt?1:0,t,ds:mt.side===THREE.DoubleSide?1:0,P:b64(P),N:b64(N),C:C&&b64(C),U:U&&b64(U),S:S2&&b64(S2),W:W2&&b64(W2),I:G.index?b64(Uint32Array.from(G.index.array)):null,n});});
  return JSON.stringify({sig,parts});})`;

const u8 = s => new Uint8Array(Buffer.from(s, 'base64'));
const f32 = s => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const u32 = s => { const b = Buffer.from(s, 'base64'); return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

/* 조각들을 줄이고 한 덩어리로: 자리(Uint16, 상자 안 비율)·법선(Int8)·색(sRGB Uint8)·뼈 번호(Uint8)·면 번호 */
/* 천 옷 면 덜기: 솔기(같은 자리에 uv만 다른 꼭짓점)를 한 점으로 보고 덜어야 둘레 줄이 줄어든다.
   덜고 나서 솔기 점은 그 면의 다른 두 점과 uv가 가장 가까운 짝으로 되돌린다 (천 결이 솔기에서 끊기지 않게) */
function hqSimplify(idx, pos, uv, target) {
  const rep = new Uint32Array(pos.length / 3), first = new Map(), twins = new Map();
  for (let v = 0; v < rep.length; v++) {
    const k = Math.round(pos[v * 3] * 2e4) + ',' + Math.round(pos[v * 3 + 1] * 2e4) + ',' + Math.round(pos[v * 3 + 2] * 2e4);
    if (!first.has(k)) { first.set(k, v); twins.set(v, [v]); } else twins.get(first.get(k)).push(v);
    rep[v] = first.get(k);
  }
  const sh = Uint32Array.from(idx, v => rep[v]);
  const out = MS.simplify(sh, pos, 3, target, HQE, [])[0];
  if (!uv) return out;
  const res = new Uint32Array(out.length), d = (a, b) => Math.abs(uv[a * 2] - uv[b * 2]) + Math.abs(uv[a * 2 + 1] - uv[b * 2 + 1]);
  for (let t = 0; t < out.length; t += 3) for (let k = 0; k < 3; k++) {
    const c = twins.get(out[t + k]); if (c.length === 1) { res[t + k] = c[0]; continue; }
    const o1 = twins.get(out[t + (k + 1) % 3])[0], o2 = twins.get(out[t + (k + 2) % 3])[0];
    let best = c[0], bd = 1e9; for (const v of c) { const s = d(v, o1) + d(v, o2); if (s < bd) { bd = s; best = v; } } res[t + k] = best;
  }
  return res;
}

function pack(d) {
  const P = [], N = [], C = [], B = [], W = [], U = [], T = [], I = [];
  const dbg = [];
  for (const p of d.parts) {
    const t0 = I.length;
    const pos = f32(p.P), nor = f32(p.N), col = p.C ? f32(p.C) : null, n = p.n, uv = p.U ? f32(p.U) : null, sb = p.S ? u8(p.S) : null, sw = p.W ? f32(p.W) : null;
    let idx = p.I ? u32(p.I) : null;
    if (!idx) {   // 빚지 않은 조각(눈·소품): 자리·법선·색이 같은 꼭짓점은 하나로
      const k = new Map(); idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) { const key = [0, 1, 2].map(a => Math.round(pos[i * 3 + a] * 1e4) + ',' + Math.round(nor[i * 3 + a] * 100)).join(';') + (col ? ';' + Math.round(col[i * 3] * 255) + ',' + Math.round(col[i * 3 + 1] * 255) + ',' + Math.round(col[i * 3 + 2] * 255) : '') + (uv ? ';' + Math.round(uv[i * 2] * 256) + ',' + Math.round(uv[i * 2 + 1] * 256) : '') + (sb ? ';' + sb[i * 2] + ',' + sb[i * 2 + 1] + ',' + Math.round(sw[i] * 255) : '');
        if (!k.has(key)) k.set(key, i); idx[i] = k.get(key); }
    }
    if (p.s && idx.length > 300) {
      const tgt = Math.max(120, Math.floor(idx.length * RATIO / 3) * 3);
      idx = MS.simplify(idx, pos, 3, tgt, .02, ['LockBorder'])[0];
    } else if (p.h && idx.length > 600) {   // 새 천 옷: 결·주름 그늘은 노멀맵·꼭짓점 색이 맡으니 면은 덜어도 된다 (솔기·가장자리는 그대로)
      idx = hqSimplify(idx, pos, uv, Math.max(180, Math.floor(idx.length * HQR / 3) * 3));
    } else if (!p.s && idx.length > 1500) idx = MS.simplify(idx, pos, 3, Math.floor(idx.length * .5 / 3) * 3, .004, ['LockBorder'])[0];   // 치마처럼 촘촘한 천은 반쯤 (주름은 남게)
    // (주민 재질은 양면이라 천 뒷면을 따로 넣지 않는다)
    const map = new Map(), push = v => {
      P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      if (col) C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); else C.push(p.c[0], p.c[1], p.c[2]);
      if (sb) { B.push(sb[v * 2], sb[v * 2 + 1]); W.push(sw[v]); } else { B.push(p.b, p.b); W.push(0); }
      if (uv) U.push(uv[v * 2], uv[v * 2 + 1]); else U.push(0, 0); T.push(p.t ?? 255); return P.length / 3 - 1;
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
  const qU = Int16Array.from(U, x => Math.max(-32767, Math.min(32767, Math.round(x * 256))));
  return { v: 2, W: e(Uint8Array.from(W, x => Math.round(x * 255))), U: e(qU), T: e(Uint8Array.from(T)), sig: d.sig, nv, tri: I.length / 3, lo: lo.map(x => +x.toFixed(5)), hi: hi.map(x => +x.toFixed(5)), P: e(qP), N: e(qN), C: e(qC), B: e(Uint8Array.from(B)), I: e(nv < 65536 ? Uint16Array.from(I) : Uint32Array.from(I)), i32: nv >= 65536 ? 1 : 0 };
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
        CIT_HQ='full';const g=makeNpcStick(citStickLook(${JSON.stringify(id)}));CIT_HQ='old';if(g.userData.marker){g.remove(g.userData.marker);g.userData.marker=null;}
        while(NSM.wait.size)await new Promise(r=>setTimeout(r,300));return (${DUMP})(g);})()`), [id, DUMP]);
      const r = pack(JSON.parse(js)), file = path.join(OUT, 's_' + id + '.json');
      fs.writeFileSync(file, JSON.stringify(r));
      console.log(id, '면', r.tri, '꼭짓점', r.nv, Math.round(fs.statSync(file).size / 1024) + 'KB', ((Date.now() - t0) / 1000).toFixed(1) + '초');
    }
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
