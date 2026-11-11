/*
 * 돌고래 빚기 (거리 함수로 한 덩어리로 빚는다)
 * - dolphin(): 등뼈 곡선(주둥이 끝 → 꼬리 끝)을 따라 단면이 타원인 몸을 쓸어 만들고, 둥근 이마(멜론)·주둥이·입 선·눈·숨구멍,
 *   뒤로 휜 등지느러미, 가슴지느러미, 양옆으로 펼친 꼬리지느러미를 부드럽게 이어 붙인다.
 * - 엑시즈 중앙 광장 분수에 쓰는 돌고래 두 가지:
 *   fountainBronze(): 못 안 바위 위에서 몸을 휘어 솟구치며 바깥으로 물을 뿜는 청동 돌고래 (게임의 buildPlazaFountain 돌고래 자리 D 좌표)
 *   fountainTop():    작은 잔 위 받침을 따라 몸을 세우고 머리를 숙여 잔으로 물을 뿜는 대리석 돌고래 (분수 좌표, +x 가 바깥)
 */
'use strict';
const { clamp, mix, rgb, cmix, csc, fbm, F, E, makeField, capD } = require('../monbake/lib');

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const PI = Math.PI;

/* 매끈한 곡선(카트멀-롬) 위의 점들 */
function crv(pts, n) {
  const out = [], P = i => pts[clamp(i, 0, pts.length - 1)];
  for (let s = 0; s <= n; s++) {
    const u = s / n * (pts.length - 1), i = Math.min(Math.floor(u), pts.length - 2), t = u - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t;
    out.push([0, 1, 2].map(a => .5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
  }
  return out;
}
/* 고르게 다시 나누기 (길이 기준) */
function even(P, n) {
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + len(sub(P[i], P[i - 1])));
  const out = []; let j = 0;
  for (let s = 0; s <= n; s++) { const d = L[L.length - 1] * s / n; while (j < L.length - 2 && L[j + 1] < d) j++; const t = (d - L[j]) / ((L[j + 1] - L[j]) || 1); out.push(lerp3(P[j], P[j + 1], clamp(t, 0, 1))); }
  return { P: out, L: L[L.length - 1] };
}
/* 1차원 표 [t, v] 를 부드럽게 (카트멀-롬) */
function table(rows) {
  return t => {
    t = clamp(t, rows[0][0], rows[rows.length - 1][0]);
    let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
    const v = k => rows[clamp(k, 0, rows.length - 1)][1];
    const u = (t - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), u2 = u * u, u3 = u2 * u;
    const p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
    return .5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
}
/* 2차원 타원까지의 거리 (근사) */
function ell2(a, b, rw, rh) {
  const k0 = Math.hypot(a / rw, b / rh); if (k0 < 1e-6) return -Math.min(rw, rh);
  const k1 = Math.hypot(a / (rw * rw), b / (rh * rh)); return k0 * (k0 - 1) / k1;
}

function ell3(a, b, c, rx, ry, rz) {
  const k0 = Math.hypot(a / rx, b / ry, c / rz); if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(a / (rx * rx), b / (ry * ry), c / (rz * rz)); return k0 * (k0 - 1) / k1;
}
/*
 * 곡선을 따라 단면이 타원인 관을 쓸어 만든다.
 * S: [{p, U}] 등뼈 표본 (U: 단면 높이 rh 방향), prof(t) → [rw, rh] (rw: 옆 방향 반지름)
 */
function sweepE(b, S, prof, o = {}) {
  const n = S.length - 1;
  for (let i = 0; i <= n; i++) { const [rw, rh] = prof(i / n); S[i].rw = rw; S[i].rh = rh; }
  /* 카트멀-롬 곡선 (u: 0~n) — 자리·도함수 둘, 단면 위쪽 방향 */
  const Q = i => S[clamp(i, 0, n)];
  const ext = i => i < 0 ? sub(scl(S[0].p, 2), S[1].p) : i > n ? sub(scl(S[n].p, 2), S[n - 1].p) : S[i].p;   /* 양 끝은 곧게 늘인다 */
  const evalC = u => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(u))), t = u - i, t2 = t * t, t3 = t2 * t;
    const p0 = ext(i - 1), p1 = ext(i), p2 = ext(i + 1), p3 = ext(i + 2), P = [], D = [], D2 = [], Uv = [];
    for (let a = 0; a < 3; a++) {
      const A = -p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a], B = 2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a], Cc = -p0[a] + p2[a], Dd = 2 * p1[a];
      P.push(.5 * (A * t3 + B * t2 + Cc * t + Dd)); D.push(.5 * (3 * A * t2 + 2 * B * t + Cc)); D2.push(.5 * (6 * A * t + 2 * B));
      const u0 = Q(i - 1).U[a], u1 = Q(i).U[a], u2 = Q(i + 1).U[a], u3 = Q(i + 2).U[a];
      Uv.push(.5 * ((-u0 + 3 * u1 - 3 * u2 + u3) * t3 + (2 * u0 - 5 * u1 + 4 * u2 - u3) * t2 + (-u0 + u2) * t + 2 * u1));
    }
    return { P, D, D2, Uv };
  };
  const seg = [], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) {
    const A = S[i], Bq = S[i + 1], ab = sub(Bq.p, A.p), l2 = dot(ab, ab), R = Math.max(A.rw, A.rh, Bq.rw, Bq.rh);
    seg.push({ A, ab, l2, mid: lerp3(A.p, Bq.p, .5), hl: Math.sqrt(l2) / 2 + .001 });
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], A.p[a] - R, Bq.p[a] - R); hi[a] = Math.max(hi[a], A.p[a] + R, Bq.p[a] + R); }
  }
  /* 등뼈 곡선에서 가장 가까운 점(뉴턴법으로 다듬음)을 찾고, 그 자리 단면 타원으로 거리를 잰다. 양 끝은 타원체 꼭지로 닫는다 */
  const d = (x, y, z) => {
    let best = 1e9, bu = 0;
    for (let i = 0; i < n; i++) {
      const q = seg[i], ox = x - q.mid[0], oy = y - q.mid[1], oz = z - q.mid[2];
      if (Math.sqrt(ox * ox + oy * oy + oz * oz) - q.hl > best) continue;
      const px = x - q.A.p[0], py = y - q.A.p[1], pz = z - q.A.p[2];
      const t = clamp((px * q.ab[0] + py * q.ab[1] + pz * q.ab[2]) / q.l2, 0, 1);
      const e = Math.hypot(px - q.ab[0] * t, py - q.ab[1] * t, pz - q.ab[2] * t);
      if (e < best) { best = e; bu = i + t; }
    }
    let u = bu, C;
    for (let it = 0; it < 4; it++) {
      C = evalC(u); const v = [C.P[0] - x, C.P[1] - y, C.P[2] - z];
      const g1 = dot(v, C.D), g2 = dot(C.D, C.D) + dot(v, C.D2);
      const nu = clamp(u - g1 / (g2 > 1e-9 ? g2 : dot(C.D, C.D)), Math.max(0, bu - 1), Math.min(n, bu + 1));
      if (Math.abs(nu - u) < 1e-5) { u = nu; break; } u = nu;
    }
    C = evalC(u);
    const T = norm(C.D), U = norm(sub(C.Uv, scl(T, dot(C.Uv, T)))), W = cross(T, U);
    const f = u / n, [rw, rh] = prof(f);
    const v = [x - C.P[0], y - C.P[1], z - C.P[2]], a = dot(v, W), bb = dot(v, U), al = dot(v, T);
    if ((u <= 1e-6 && al < 0) || (u >= n - 1e-6 && al > 0)) return ell3(a, bb, al, rw, rh, Math.min(rw, rh));
    return ell2(a, bb, rw, rh);
  };
  /* 등뼈 위 틀 (지느러미·눈 놓기용): 표본에 T·Uo·W 를 달아 둔다 */
  for (let i = 0; i <= n; i++) { const C = evalC(i), T = norm(C.D), U = norm(sub(S[i].U, scl(T, dot(S[i].U, T)))); S[i].T = T; S[i].Uo = U; S[i].W = cross(T, U); }
  return F(b, [...lo, ...hi], d, o);
}
/* 판 모양 지느러미: 뿌리 → 끝 곡선, 단면은 납작한 타원 (nrm: 판의 두께 방향) */
function finE(b, pts, nrm, chord, thick, o = {}) {
  const P = even(crv(pts, 24), 16).P;
  return sweepE(b, P.map(p => ({ p, U: nrm })), t => [chord(t), thick(t)], o);
}
/* 방향을 맞춘 타원체 (W·U·T 틀) */
function eFrame(b, c, W, U, T, r, o = {}) {
  const R = Math.max(...r);
  return F(b, [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R], (x, y, z) => {
    const v = [x - c[0], y - c[1], z - c[2]];
    const a = dot(v, W) / r[0], bq = dot(v, U) / r[1], cq = dot(v, T) / r[2], k0 = Math.hypot(a, bq, cq);
    if (k0 < 1e-6) return -Math.min(...r);
    const k1 = Math.hypot(a / r[0], bq / r[1], cq / r[2]); return k0 * (k0 - 1) / k1;
  }, o);
}

/* 몸 단면 (t: 주둥이 끝 0 → 꼬리 끝 1), 반지름은 s(가장 굵은 곳 반 높이)에 곱한다 */
const RH = table([[0, .13], [.03, .17], [.06, .22], [.09, .33], [.13, .52], [.18, .68], [.25, .86], [.36, 1], [.48, .94], [.6, .76], [.72, .52], [.82, .33], [.9, .21], [.96, .15], [1, .1]]);
const RW = table([[0, 1], [.065, 1], [.1, .98], [.2, .93], [.36, .87], [.5, .8], [.62, .68], [.74, .5], [.84, .38], [.92, .36], [1, .55]]);

/*
 * 돌고래 하나
 * pts: 등뼈 (주둥이 끝 → 꼬리 끝), s: 가장 굵은 곳 반 높이
 * up: 등 쪽 방향. [x,y,z] 고정 방향이거나 { axis } (곡선이 놓인 판의 법선: 등 = axis × 진행 방향)
 * o: { c: 색, eye: 눈 색, k: 이어 붙이는 부드러움 배율 }
 */
function dolphin(pts, s, up, o = {}) {
  const b = o.b || 'root', c = o.c, kk = o.k || 1;
  const { P } = even(crv(pts, 60), 48), n = P.length - 1;
  const S = P.map((p, i) => {
    const T = norm(sub(P[Math.min(n, i + 1)], P[Math.max(0, i - 1)]));
    const U = up.axis ? cross(up.axis, T) : up;
    return { p, U: norm(sub(U, scl(T, dot(U, T)))) };
  });
  const prims = [];
  const body = sweepE(b, S, t => [RH(t) * RW(t) * s, RH(t) * s], { c });
  prims.push(body);
  /* 등뼈 위 아무 곳의 틀 */
  const at = t => {
    const u = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i, A = S[i], B = S[i + 1];
    const T = norm(lerp3(A.T, B.T, f)), U = norm(lerp3(A.Uo, B.Uo, f)), W = cross(T, U);
    return { p: lerp3(A.p, B.p, f), T, U, W, rh: RH(t) * s, rw: RH(t) * RW(t) * s };
  };
  /* 둥근 이마(멜론): 주둥이 뒤에서 가파르게 솟는다 */
  { const f = at(.115); prims.push(eFrame(b, add(f.p, add(scl(f.U, .2 * s), scl(f.T, -.06 * s))), f.W, f.U, f.T, [.37 * s, .34 * s, .3 * s], { c, k: .07 * s * kk })); }
  /* 아래턱이 조금 길게 내민다 */
  { const f = at(.03); prims.push(eFrame(b, add(f.p, scl(f.U, -.05 * s)), f.W, f.U, f.T, [.13 * s, .1 * s, .14 * s], { c, k: .05 * s * kk })); }
  /* 입 선: 주둥이 끝에서 뒤로, 끝이 살짝 올라가 웃는 얼굴 */
  for (const q of [-1, 1]) {
    const line = [];
    for (let i = 0; i <= 10; i++) {
      const t = .004 + i / 10 * .1, f = at(t), rise = Math.pow(i / 10, 2.4) * .12 * s;
      line.push(add(f.p, add(scl(f.W, q * f.rw * (i < 2 ? .5 + i * .25 : 1)), scl(f.U, -.06 * s + rise))));
    }
    for (let i = 0; i < 10; i++) prims.push(F(b, (() => { const a = line[i], e = line[i + 1], r = .03 * s; return [Math.min(a[0], e[0]) - r, Math.min(a[1], e[1]) - r, Math.min(a[2], e[2]) - r, Math.max(a[0], e[0]) + r, Math.max(a[1], e[1]) + r, Math.max(a[2], e[2]) + r]; })(),
      (x, y, z) => capD(x, y, z, ...line[i], ...line[i + 1], .022 * s, .022 * s), { c, sub: true, k: .016 * s }));
  }
  /* 눈: 입 끝 뒤 조금 위, 볼록한 눈두덩 + 오목한 눈동자 */
  for (const q of [-1, 1]) {
    const f = at(.148), base = add(f.p, add(scl(f.W, q * f.rw * .9), scl(f.U, .03 * s)));
    const out = norm(add(scl(f.W, q), scl(f.U, .15)));
    prims.push(eFrame(b, base, f.W, f.U, f.T, [.07 * s, .065 * s, .085 * s], { c, k: .04 * s }));
    prims.push(eFrame(b, add(base, scl(out, .075 * s)), f.W, f.U, f.T, [.03 * s, .033 * s, .04 * s], { c: o.eye || c, sub: true, k: .008 * s }));
    prims.push(eFrame(b, add(base, scl(out, .045 * s)), f.W, f.U, f.T, [.018 * s, .02 * s, .024 * s], { c: o.eye || c, k: .004 * s, pri: .01 }));
  }
  /* 숨구멍: 정수리 뒤 반달 홈 */
  { const f = at(.205); prims.push(eFrame(b, add(f.p, scl(f.U, f.rh * .98 + .02 * s)), f.W, f.U, f.T, [.07 * s, .035 * s, .022 * s], { c, sub: true, k: .015 * s })); }
  /* 등지느러미: 등 가운데에서 뒤로 휘어 오른 낫 모양 */
  {
    const f = at(.47), base = add(f.p, scl(f.U, f.rh * .55));
    const pts2 = [base, add(base, add(scl(f.U, .5 * s), scl(f.T, .12 * s))), add(base, add(scl(f.U, .86 * s), scl(f.T, .42 * s))), add(base, add(scl(f.U, 1.0 * s), scl(f.T, .78 * s)))];
    prims.push(finE(b, pts2, f.W, t => mix(.62, .05, Math.pow(t, .8)) * s * (1 - .25 * Math.sin(t * PI)), t => mix(.11, .03, t) * s, { c, k: .09 * s * kk }));
  }
  /* 가슴지느러미: 몸 아래쪽 옆에서 뒤·아래로 뻗는다 */
  for (const q of [-1, 1]) {
    const f = at(.215), root = add(f.p, add(scl(f.W, q * f.rw * .55), scl(f.U, -f.rh * .45)));
    const dir = norm(add(add(scl(f.W, q * .62), scl(f.U, -.55)), scl(f.T, .55)));
    const tip = add(root, add(scl(dir, 1.05 * s), scl(f.T, .35 * s)));
    const nrm = norm(cross(dir, f.T)), nn = dot(nrm, f.U) < 0 ? scl(nrm, -1) : nrm;
    prims.push(finE(b, [root, add(root, scl(dir, .5 * s)), tip], nn, t => mix(.3, .05, Math.pow(t, 1.3)) * s, t => mix(.075, .028, t) * s, { c, k: .06 * s * kk }));
  }
  /* 꼬리지느러미: 꼬리 끝에서 양옆으로 넓게, 끝이 뒤로 젖혀진다 */
  for (const q of [-1, 1]) {
    const f = at(.975), r0 = f.p;
    const pts2 = [r0, add(r0, add(scl(f.W, q * .5 * s), scl(f.T, .05 * s))), add(r0, add(scl(f.W, q * .95 * s), scl(f.T, .24 * s))), add(r0, add(scl(f.W, q * 1.2 * s), scl(f.T, .52 * s)))];
    prims.push(finE(b, pts2, f.U, t => mix(.4, .05, Math.pow(t, 1.1)) * s, t => mix(.085, .03, t) * s, { c, k: .05 * s * kk }));
  }
  const tip = P[0], head = at(0);
  return { prims, tip, dir: scl(head.T, -1) };
}

/* 여러 도형을 하나로 묶는다 */
function grp(b, prims, o = {}) {
  const f = makeField(prims), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of prims) if (!p.sub && !p.inter) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.bb[a]); hi[a] = Math.max(hi[a], p.bb[a + 3]); }
  return F(b, [...lo, ...hi], f, { k: o.k || 0, c: o.col || prims[0].c });
}

/* ---------- 색 ---------- */
const MARB = rgb(0xf4efe6);
const marble = (base, k = 1) => (x, y, z) => {
  const v = Math.abs(Math.sin((x * 3.1 + y * 1.7 + z * 2.3) * 6 + fbm(x * 4, y * 4, z * 4, 4) * 7));
  return csc(base, 1 - Math.pow(1 - v, 14) * .13 * k + fbm(x * 11, y * 11, z * 11, 3) * .035);
};
/* 청동: 짙은 구릿빛 위로 물이 흘러 생긴 푸른 녹이 얼룩지고, 볼록한 곳은 손때로 반들거린다 */
const BRZ = rgb(0x6e5236), PAT = rgb(0x3f8a76), PAT2 = rgb(0x5aa58c);
const bronze = (x, y, z, nx, ny) => {
  const n1 = fbm(x * 8, y * 8, z * 8, 4), n2 = fbm(x * 3, y * 14, z * 3, 3);   /* 위아래로 길쭉한 얼룩 = 흘러내린 물 자국 */
  const p = clamp(.72 + n1 * 1.1 + n2 * .9 - (ny || 0) * .15, 0, 1);
  const base = cmix(PAT, PAT2, clamp(.5 + fbm(x * 13, y * 13, z * 13, 2) * 1.6, 0, 1));
  return cmix(BRZ, base, p);
};
const EYE_B = rgb(0x1c2a24);
const ROCK = rgb(0x8c8b85), MOSS = rgb(0x4d5e45), WET = rgb(0x5a5c58);
const rockCol = wl => (x, y, z) => {
  const n = fbm(x * 7, y * 7, z * 7, 4), base = csc(ROCK, 1 + n * .3);
  const w = clamp((wl + .14 - y) / .14, 0, 1), m = clamp((wl + .03 - y) / .12, 0, 1) * clamp(.5 + fbm(x * 9, y * 3, z * 9, 3) * 2, 0, 1);
  return cmix(cmix(base, WET, w * .7), MOSS, m * .8);
};

/* ===================================================================
   못 안 청동 돌고래 (게임 D 좌표: +z 바깥, 원점은 못 물 위 .24m)
   =================================================================== */
const BRONZE_TIP = [0, 1.11, .885];
function fountainBronze() {
  const pts = [BRONZE_TIP, [0, 1.27, .64], [.03, 1.5, .3], [.07, 1.66, -.08], [.06, 1.6, -.44], [0, 1.3, -.7], [-.07, .88, -.8], [-.1, .52, -.68], [-.09, .33, -.44], [-.07, .27, -.2]];
  const D = dolphin(pts, .3, { axis: [1, 0, 0] }, { c: bronze, eye: EYE_B });
  const P = D.prims;
  for (const p of P) p.g = 'bronze';
  const disp = sc => (x, y, z) => fbm(x * sc, y * sc, z * sc, 4) * .07;
  const rc = rockCol(-.24);
  const R = [];
  for (const [x, y, z, rx, ry, rz] of [[0, -.3, 0, .82, .44, .7], [.38, -.38, .32, .5, .32, .46], [-.42, -.36, .26, .46, .34, .44], [-.3, -.34, -.42, .52, .38, .44], [.35, -.4, -.38, .44, .3, .4], [.08, -.06, -.3, .4, .3, .36]])
    R.push(E('root', [x, y, z], [rx, ry, rz], { c: rc, k: .1, disp: disp(4.5), amp: .08 }));
  for (const p of R) p.g = 'rock';
  return {
    bones: [{ n: 'root', o: [0, 0, 0] }], prims: [...P, ...R], h: 2,
    mats: { bronze: { r: .4, m: .5 }, rock: { r: .92 } },
    gopt: { bronze: { tris: 8000, h: .004, loK: .2, aoS: .03, aoK: 1.9 }, rock: { tris: 1400, h: .02, loK: .35, aoS: .05 } },
  };
}

/* ===================================================================
   작은 잔 위 대리석 돌고래 (분수 좌표: +x 바깥, y 는 분수 바닥에서)
   =================================================================== */
const TOP_TIP = [1.06, 5.07, 0];
function fountainTop() {
  const pts = [TOP_TIP, [.93, 5.17, 0], [.72, 5.3, .01], [.58, 5.45, .03], [.56, 5.6, .06], [.63, 5.7, .09], [.74, 5.75, .1]];
  const D = dolphin(pts, .105, { axis: [0, 0, -1] }, { c: marble(MARB) });
  const P = D.prims;
  for (const p of P) p.g = 'marble';
  return {
    bones: [{ n: 'root', o: [0, 0, 0] }], prims: P, h: 1,
    mats: { marble: { r: .42 } },
    gopt: { marble: { tris: 3600, h: .0022, loK: .22, aoS: .012, aoK: 2.2 } },
  };
}

module.exports = { dolphin, grp, crv, fountainBronze, fountainTop, BRONZE_TIP, TOP_TIP };
