/*
 * 빚은 모델 하나를 굽는다: 무리(재질)마다 겉면 → 법선·색·그늘(AO) → 면 줄이기 → 뼈 무게 → 담기
 */
'use strict';
const { clamp, sstep, makeField, surfaceNet } = require('./lib');
let MS = null;
const req = m => { try { return require(m); } catch (e) { return require('/opt/node-tools/node_modules/' + m); } };

async function ready() { if (!MS) { MS = req('meshoptimizer').MeshoptSimplifier; await MS.ready; MS.useExperimentalFeatures = true; } }

/* 뼈 무게: 가장 가까운 도형의 뼈를 주로 삼고, 마디 가까이에서는 부모·자식 뼈와 부드럽게 나눈다 */
function weights(bones, label, P) {
  const by = new Map(bones.map((b, i) => [b.n, i])), kids = bones.map(() => []);
  bones.forEach((b, i) => { b.pi = b.p ? by.get(b.p) : -1; if (b.pi >= 0) kids[b.pi].push(i); const t = b.tip || b.o; const ax = [t[0] - b.o[0], t[1] - b.o[1], t[2] - b.o[2]], l = Math.hypot(...ax) || 1; b.ax = ax.map(v => v / l); });
  const n = P.length / 3, SI = new Uint8Array(n * 2), SW = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const L = label[v], x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let best = null, bs = 1e9;
    const cand = [];
    if (bones[L].pi >= 0 && bones[L].bw) cand.push(L);
    for (const c of kids[L]) if (bones[c].bw) cand.push(c);
    for (const c of cand) {
      const B = bones[c], dx = x - B.o[0], dy = y - B.o[1], dz = z - B.o[2], s = dx * B.ax[0] + dy * B.ax[1] + dz * B.ax[2];
      const rx = dx - s * B.ax[0], ry = dy - s * B.ax[1], rz = dz - s * B.ax[2], r = Math.hypot(rx, ry, rz);
      if (B.rad && r > B.rad) continue;
      const q = Math.abs(s) / B.bw; if (q < bs) { bs = q; best = { c, s }; }
    }
    if (!best || bs > 1) { SI[v * 2] = L; SI[v * 2 + 1] = L; SW[v] = 255; continue; }
    const B = bones[best.c], wc = sstep(-B.bw, B.bw, best.s);
    SI[v * 2] = best.c; SI[v * 2 + 1] = B.pi; SW[v] = Math.round(wc * 255);
  }
  return { SI, SW };
}

/* 무리 하나 굽기 */
async function bakeGroup(model, gname, opt) {
  await ready();
  const prims = model.prims.filter(p => p.g === gname);
  const f = makeField(prims), fAll = model.fAll;
  const h = opt.h;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of prims) if (!p.sub && !p.inter) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.bb[a]); hi[a] = Math.max(hi[a], p.bb[a + 3]); }
  for (let a = 0; a < 3; a++) { lo[a] -= h * 3; hi[a] += h * 3; }
  const t0 = Date.now();
  const S = surfaceNet(f, lo, hi, h);
  let P = S.P, I = S.I, n = P.length / 3;
  if (!n) return null;
  /* 법선: 거리 함수의 기울기 */
  const N = new Float32Array(n * 3), e = h * .5;
  for (let v = 0; v < n; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1; N[v * 3] = gx / l; N[v * 3 + 1] = gy / l; N[v * 3 + 2] = gz / l; }
  /* 색·뼈: 가장 가까운 도형 (둘째와 섞어 경계를 부드럽게) */
  const paint = prims.filter(p => !p.sub && !p.inter && !p.noPaint), Cc = new Float32Array(n * 3), label = new Uint8Array(n), bi = new Map(model.bones.map((b, i) => [b.n, i]));
  for (const p of paint) if (!bi.has(p.b)) throw new Error('뼈 없음: ' + p.b);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let d1 = 1e9, d2 = 1e9, p1 = null, p2 = null;
    let own = null; for (const p of paint) if (p.own && Math.abs(p.d(x, y, z)) < p.own) { own = p; break; }
    for (const p of paint) { if (p.bb && (x < p.bb[0] - .06 || x > p.bb[3] + .06 || y < p.bb[1] - .06 || y > p.bb[4] + .06 || z < p.bb[2] - .06 || z > p.bb[5] + .06)) continue; const d = p.d(x, y, z) - (p.pri || 0); if (d < d1) { d2 = d1; p2 = p1; d1 = d; p1 = p; } else if (d < d2) { d2 = d; p2 = p; } }
    if (!p1) { p1 = paint[0]; }
    label[v] = bi.get(own ? own.b : (p1.lab || p1.b));
    const col = p => typeof p.c === 'function' ? p.c(x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) : p.c;
    let c = col(p1);
    if (p2 && p2.c !== p1.c && !p1.hard && !p2.hard) { const w = clamp(.5 + (d2 - d1) / (p1.soft || .014), .5, 1); if (w < 1) { const c2 = col(p2); c = [c2[0] + (c[0] - c2[0]) * w, c2[1] + (c[1] - c2[1]) * w, c2[2] + (c[2] - c2[2]) * w]; } }
    /* 그늘: 법선 쪽으로 몇 걸음 나가 보며 얼마나 막혀 있나 */
    let ao = 0; if (!opt.noAO) { const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2]; for (let i = 1; i <= 5; i++) { const s = i * (opt.aoS || .022); ao += (s - fAll(x + nx * s, y + ny * s, z + nz * s)) / Math.pow(2, i - 1); } }
    const a = clamp(1 - ao * (opt.aoK || 2.6), .38, 1), up = .9 + .1 * clamp(N[v * 3 + 1] * .5 + .5, 0, 1);
    const k = (p1.noAO ? 1 : a) * up;
    Cc[v * 3] = c[0] * k; Cc[v * 3 + 1] = c[1] * k; Cc[v * 3 + 2] = c[2] * k;
  }
  if (opt.log) console.log(`  ${gname}: 면 ${I.length / 3}, ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  return { P, N, Cc, I, label, n };
}
function reduce(model, F, tris) {
  let { P, N, Cc, I, label, n } = F;
  /* 면 줄이기 (색·법선이 달라지는 곳은 남긴다) */
  const tgt = Math.min(I.length, tris * 3);
  if (I.length > tgt) {
    const A = new Float32Array(n * 6); for (let v = 0; v < n; v++) { A[v * 6] = Cc[v * 3]; A[v * 6 + 1] = Cc[v * 3 + 1]; A[v * 6 + 2] = Cc[v * 3 + 2]; A[v * 6 + 3] = N[v * 3]; A[v * 6 + 4] = N[v * 3 + 1]; A[v * 6 + 5] = N[v * 3 + 2]; }
    const lock = new Array(n).fill(false);
    I = MS.simplifyWithAttributes(I, P, 3, A, 6, [.6, .6, .6, .25, .25, .25], null, tgt, tgt < I.length * .03 ? 1 : .2)[0];
  }
  /* 쓰인 꼭짓점만 남기기 */
  const map = new Int32Array(n).fill(-1); let m = 0; const I2 = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) { const v = I[i]; if (map[v] < 0) map[v] = m++; I2[i] = map[v]; }
  const P2 = new Float32Array(m * 3), N2 = new Float32Array(m * 3), C2 = new Float32Array(m * 3), L2 = new Uint8Array(m);
  for (let v = 0; v < n; v++) { const k = map[v]; if (k < 0) continue; for (let a = 0; a < 3; a++) { P2[k * 3 + a] = P[v * 3 + a]; N2[k * 3 + a] = N[v * 3 + a]; C2[k * 3 + a] = Cc[v * 3 + a]; } L2[k] = label[v]; }
  const W = weights(model.bones, L2, P2);
  return { P: P2, N: N2, C: C2, I: I2, SI: W.SI, SW: W.SW, n: m };
}

/* 담기: 자리(Uint16)·법선(Int8)·색(sRGB Uint8)·뼈 두 개(Uint8)+무게(Uint8)·면 */
function pack(G) {
  const n = G.n, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], G.P[i * 3 + a]); hi[a] = Math.max(hi[a], G.P[i * 3 + a]); }
  const qP = new Uint16Array(n * 3), qN = new Int8Array(n * 3), qC = new Uint8Array(n * 3);
  for (let i = 0; i < n * 3; i++) { const a = i % 3; qP[i] = Math.round((G.P[i] - lo[a]) / ((hi[a] - lo[a]) || 1) * 65535); qN[i] = Math.round(clamp(G.N[i], -1, 1) * 127); qC[i] = Math.round(clamp(G.C[i], 0, 1) * 255); }
  const e = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  return { n, lo: lo.map(x => +x.toFixed(5)), hi: hi.map(x => +x.toFixed(5)), P: e(qP), N: e(qN), C: e(qC), S: e(G.SI), W: e(G.SW), I: e(n < 65536 ? Uint16Array.from(G.I) : G.I), i32: n >= 65536 ? 1 : 0, tri: G.I.length / 3 };
}

async function bakeModel(model, opt) {
  const groups = [...new Set(model.prims.map(p => p.g))];
  const fs = groups.map(g => makeField(model.prims.filter(p => p.g === g)));
  model.fAll = (x, y, z) => { let d = 1e9; for (const f of fs) { const v = f(x, y, z); if (v < d) d = v; } return d; };
  const out = { v: 1, h: model.h, size: model.size || 1, anim: model.anim || {}, bones: model.bones.map(b => ({ n: b.n, p: b.p || null, o: b.o.map(v => +v.toFixed(4)) })), mats: {}, lod: [] };
  out.lod = [[], []];
  for (const g of groups) {
    const go = Object.assign({}, opt, model.gopt && model.gopt[g] || {});
    const F = await bakeGroup(model, g, go); if (!F) continue;
    out.lod[0].push(Object.assign({ g }, pack(reduce(model, F, go.tris || 9000))));
    if (!go.noLo) out.lod[1].push(Object.assign({ g }, pack(reduce(model, F, Math.max(200, Math.round((go.tris || 9000) * (go.loK || .2)))))));
  }
  out.mats = model.mats;
  return out;
}

module.exports = { bakeModel };
