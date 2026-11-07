/*
 * 사람 모양 몬스터 빚기 도구 — 거리 함수(SDF) 조각, 겉면 뽑기, 색·그늘, 뼈 무게, 면 줄이기, 담기
 * (게임에는 들어가지 않는다. tools/monbake.js 가 쓴다)
 */
'use strict';
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const rgb = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const cmix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const csc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/* ---------- 값 잡음 (부드러운 3차원) ---------- */
const PERM = new Uint8Array(512); { let s = 1234567; const p = []; for (let i = 0; i < 256; i++) p.push(i); for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const GRAD = new Float32Array(256); for (let i = 0; i < 256; i++) GRAD[i] = PERM[i] / 127.5 - 1;
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const h = (a, b, c) => GRAD[PERM[PERM[PERM[X + a] + Y + b] + Z + c]];
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), u), mix(h(0, 1, 0), h(1, 1, 0), u), v), mix(mix(h(0, 0, 1), h(1, 0, 1), u), mix(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, o = 3) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= .5; } return s; };

/* ---------- 도형 (안쪽이 음수) ---------- */
function rot(rx, ry, rz) {   // 오일러(XYZ) → 3x3 (세상 → 도형 쪽으로 돌릴 땐 전치)
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz*Ry*Rx (three.js XYZ 순서와 같다)
  return [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy, sx * cy, cx * cy];
}
function ellD(x, y, z, rx, ry, rz) {
  const a = x / rx, b = y / ry, c = z / rz, k0 = Math.sqrt(a * a + b * b + c * c); if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.sqrt(a * a / (rx * rx) + b * b / (ry * ry) + c * c / (rz * rz)); return k0 * (k0 - 1) / k1;
}
function capD(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, pax = px - ax, pay = py - ay, paz = pz - az;
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t; return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
}
function boxD(x, y, z, hx, hy, hz, r) { const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }

/* 도형 하나: 뼈 이름(b), 거리 함수(d), 테두리 상자(bb), 이어 붙이는 부드러움(k), 색(c: [r,g,b] 또는 (x,y,z)=>[r,g,b]), 빼기(sub) */
function prim(o) { return Object.assign({ k: 0, sub: false, g: 'body' }, o); }
/* 공통: 자리·돌림을 도형 좌표로 */
function local(c, R) {
  if (!R) return (x, y, z, f) => f(x - c[0], y - c[1], z - c[2]);
  return (x, y, z, f) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return f(R[0] * dx + R[3] * dy + R[6] * dz, R[1] * dx + R[4] * dy + R[7] * dz, R[2] * dx + R[5] * dy + R[8] * dz); };
}
const bbOf = (c, r) => [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r];
function E(b, c, r, o = {}) {   // 타원체 (r: [rx,ry,rz]), o.rot: 오일러
  const R = o.rot ? rot(...o.rot) : null, L = local(c, R), [rx, ry, rz] = r, disp = o.disp;
  return prim(Object.assign({ b, bb: bbOf(c, Math.max(rx, ry, rz) + (o.amp || 0)), d: disp ? (x, y, z) => L(x, y, z, (a, b2, c2) => ellD(a, b2, c2, rx, ry, rz)) + disp(x, y, z) : (x, y, z) => L(x, y, z, (a, b2, c2) => ellD(a, b2, c2, rx, ry, rz)) }, o));
}
function C(b, a, e, ra, rb, o = {}) {   // 둥근 원뿔 막대
  const disp = o.disp, r = Math.max(ra, rb) + (o.amp || 0);
  const bb = [Math.min(a[0], e[0]) - r, Math.min(a[1], e[1]) - r, Math.min(a[2], e[2]) - r, Math.max(a[0], e[0]) + r, Math.max(a[1], e[1]) + r, Math.max(a[2], e[2]) + r];
  const d = disp ? (x, y, z) => capD(x, y, z, a[0], a[1], a[2], e[0], e[1], e[2], ra, rb) + disp(x, y, z) : (x, y, z) => capD(x, y, z, a[0], a[1], a[2], e[0], e[1], e[2], ra, rb);
  return prim(Object.assign({ b, bb, d, seg: [a, e] }, o));
}
function L(b, pts, rs, o = {}) {   // 여러 마디 막대 (매끈하게 이어진다)
  const out = []; for (let i = 0; i + 1 < pts.length; i++) out.push(C(b, pts[i], pts[i + 1], rs[i], rs[i + 1], Object.assign({}, o, { k: i ? (o.kj ?? .02) : (o.k || 0) })));
  return out;
}
function B(b, c, h, r, o = {}) {   // 모서리 둥근 상자 (h: 반 크기)
  const R = o.rot ? rot(...o.rot) : null, Lf = local(c, R), disp = o.disp;
  return prim(Object.assign({ b, bb: bbOf(c, Math.hypot(h[0], h[1], h[2]) + (o.amp || 0)), d: disp ? (x, y, z) => Lf(x, y, z, (a, b2, c2) => boxD(a, b2, c2, h[0], h[1], h[2], r)) + disp(x, y, z) : (x, y, z) => Lf(x, y, z, (a, b2, c2) => boxD(a, b2, c2, h[0], h[1], h[2], r)) }, o));
}
function T(b, c, R0, r, o = {}) {   // 고리 (기본: y축 둘레)
  const R = o.rot ? rot(...o.rot) : null, Lf = local(c, R), sy = o.sy || 1;
  return prim(Object.assign({ b, bb: bbOf(c, R0 * Math.max(1, sy) + r), d: (x, y, z) => Lf(x, y, z, (a, b2, c2) => Math.hypot(Math.hypot(a, c2 / sy) - R0, b2) - r) }, o));
}
function F(b, bb, d, o = {}) { return prim(Object.assign({ b, bb, d }, o)); }   // 아무 거리 함수

/* ---------- 모양 하나 = 도형들 ---------- */
function bbDist(bb, x, y, z) { const dx = Math.max(bb[0] - x, 0, x - bb[3]), dy = Math.max(bb[1] - y, 0, y - bb[4]), dz = Math.max(bb[2] - z, 0, z - bb[5]); return Math.sqrt(dx * dx + dy * dy + dz * dz); }
function makeField(prims) {
  const P = prims;
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], lb = bbDist(p.bb, x, y, z);
      if (p.sub) { if (lb > p.k + Math.abs(d) + .001) continue; d = p.k > 0 ? smax(d, -p.d(x, y, z), p.k) : Math.max(d, -p.d(x, y, z)); }
      else if (p.inter) { d = p.k > 0 ? smax(d, p.d(x, y, z), p.k) : Math.max(d, p.d(x, y, z)); }
      else { if (lb > d + p.k + .001) continue; const v = p.d(x, y, z); d = p.k > 0 ? smin(d, v, p.k) : (v < d ? v : d); }
    }
    return d;
  };
}

/* ---------- 겉면 뽑기 (surface nets, 겉면 근처만 잘게) ---------- */
function surfaceNet(f, b0, b1, h) {
  const nx = Math.ceil((b1[0] - b0[0]) / h) + 1, ny = Math.ceil((b1[1] - b0[1]) / h) + 1, nz = Math.ceil((b1[2] - b0[2]) / h) + 1;
  const S = 4, cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1, cz = Math.ceil((nz - 1) / S) + 1;
  const CV = new Float32Array(cx * cy * cz);
  for (let k = 0, q = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) CV[q++] = f(b0[0] + i * S * h, b0[1] + j * S * h, b0[2] + k * S * h);
  const V = new Float32Array(nx * ny * nz), idx = (i, j, k) => i + nx * (j + ny * k), cidx = (i, j, k) => i + cx * (j + cy * k), TH = S * h * 2.2;
  for (let K = 0; K < cz - 1; K++) for (let J = 0; J < cy - 1; J++) for (let I = 0; I < cx - 1; I++) {
    let mn = 1e9, sum = 0; for (let c = 0; c < 8; c++) { const v = CV[cidx(I + (c & 1), J + ((c >> 1) & 1), K + ((c >> 2) & 1))]; sum += v; if (Math.abs(v) < mn) mn = Math.abs(v); }
    const near = mn < TH;
    for (let k = K * S; k <= Math.min(nz - 1, K * S + S); k++) for (let j = J * S; j <= Math.min(ny - 1, J * S + S); j++) for (let i = I * S; i <= Math.min(nx - 1, I * S + S); i++) {
      const q = idx(i, j, k); if (near) { if (V[q] === 0) V[q] = f(b0[0] + i * h, b0[1] + j * h, b0[2] + k * h) || 1e-7; }
      else if (V[q] === 0) V[q] = sum > 0 ? 1 : -1;
    }
  }
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const P = [], I = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0; for (let c = 0; c < 8; c++) { const o = corners[c]; v[c] = V[idx(i + o[0], j + o[1], k + o[2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) { if ((v[a] < 0) === (v[b] < 0)) continue; const t = v[a] / (v[a] - v[b]), oa = corners[a], ob = corners[b]; sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++; }
    cellV[cid(i, j, k)] = P.length / 3; P.push(b0[0] + (i + sx / n) * h, b0[1] + (j + sy / n) * h, b0[2] + (k + sz / n) * h);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V[idx(i, j, k)] < 0;
    if (a !== (V[idx(i + 1, j, k)] < 0)) { const q = [cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)]]; if (q.every(x => x >= 0)) { if (a) I.push(q[0], q[1], q[2], q[0], q[2], q[3]); else I.push(q[0], q[2], q[1], q[0], q[3], q[2]); } }
    if (a !== (V[idx(i, j + 1, k)] < 0)) { const q = [cellV[cid(i - 1, j, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)]]; if (q.every(x => x >= 0)) { if (a) I.push(q[0], q[2], q[1], q[0], q[3], q[2]); else I.push(q[0], q[1], q[2], q[0], q[2], q[3]); } }
    if (a !== (V[idx(i, j, k + 1)] < 0)) { const q = [cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)]]; if (q.every(x => x >= 0)) { if (a) I.push(q[0], q[1], q[2], q[0], q[2], q[3]); else I.push(q[0], q[2], q[1], q[0], q[3], q[2]); } }
  }
  return { P: Float32Array.from(P), I: Uint32Array.from(I) };
}

module.exports = { clamp, mix, sstep, smin, smax, rgb, cmix, csc, vnoise, fbm, rot, ellD, capD, boxD, prim, E, C, L, B, T, F, makeField, bbDist, surfaceNet };
