/*
 * 얼음 용의 잠자리 문 (허칠 동굴 곰 굴 끝 → 보스방 굴목) — 거리 함수로 빚는 고대 용 머리뼈
 * (2026-11-12 원호: "보스방은 문부터 보스방이라는 걸 알 만한 디자인")
 *
 * 좌표: 미터, 바닥 한가운데가 0, x 굴 너비, y 위, z 곰 굴 쪽(문을 바라보는 사람 쪽). size 1.
 * 굴 천장에 박힌 거대한 옛 용의 머리뼈: 위턱이 문 위로 툭 튀어나와 송곳니가 문틀처럼 늘어지고,
 * 눈구멍은 푸르게 빛나며, 뿔 한 쌍이 양쪽 벽을 타고 바닥까지 휘어 내려와 문기둥이 된다.
 * 바닥 양옆엔 부서진 아래턱이 반쯤 묻혀 이빨이 위로 솟았다. 머리뼈 위엔 서리와 고드름.
 */
'use strict';
const { clamp, mix, sstep, smin, rgb, cmix, csc, vnoise, fbm, ellD, capD, E, C, F } = require('./lib');

const C_BONE = rgb(0xd6d2c4), C_BONE2 = rgb(0x9a968a), C_DARK = rgb(0x3a3c40), C_FROST = rgb(0xf2f8fc), C_SOCK = rgb(0x0a1018), C_ICE = rgb(0xbfe6fa), C_ICE2 = rgb(0x5aa6d8);
const boneC = (x, y, z, nx, ny) => {
  let c = cmix(C_BONE, C_BONE2, sstep(.35, .75, fbm(x * .9, y * .9, z * .9, 3) + .5));
  c = cmix(c, C_DARK, sstep(.62, .8, fbm(x * 2.2 + 5, y * 2.2, z * 2.2, 3) + .5) * .5);   /* 오래 묵어 거무스름한 얼룩 */
  c = cmix(c, rgb(0x6a6458), (1 - Math.abs(Math.sin(x * 6 + 2 * vnoise(x, y, z)) * Math.sin(y * 5 + z * 3))) * .0);
  c = cmix(c, C_FROST, sstep(.3, .85, ny || 0) * sstep(.45, .7, fbm(x * 1.6 + 9, y * 1.6, z * 1.6, 3) + .5) * .9);   /* 위를 보는 면엔 서리 */
  return csc(c, .9 + .14 * vnoise(x * 9, y * 9, z * 9));
};
const toothC = (a, b) => (x, y, z) => { const k = clamp(Math.hypot(x - a[0], y - a[1], z - a[2]) / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0, 1); return cmix(rgb(0x8a8474), rgb(0xeee8da), sstep(.05, .5, k)); };

function hlairgate() {
  const prims = [], bones = [{ n: 'root', o: [0, 0, 0], tip: [0, 1, 0] }];
  /* 갈라진 뼈 결: 잔 금이 간 듯 표면을 조금 판다 */
  const crack = (x, y, z) => .025 * sstep(.86, .97, 1 - Math.abs(vnoise(x * 1.3, y * 1.3, z * 1.3)));
  /* 머리뼈: 큰 머리통(천장 속)과 앞으로 튀어나온 위턱 (아래가 납작하다) */
  prims.push(F('root', [-4.3, 3.2, -4.5, 4.3, 8.8, 4.2], (x, y, z) => {
    let d = ellD(x, y - 6.4, z + 1.2, 3.3, 2.1, 3.0);
    const t = clamp((z + .5) / 5, 0, 1), w = mix(2.3, .7, Math.pow(t, .8)), h = mix(1.25, .55, t), yc = mix(5.2, 4.6, t), zc = clamp(z, -.5, 4.3);
    const snout = (Math.hypot(x / w, (y - yc) / h) - 1) * Math.min(w, h) * .8 + Math.max(0, Math.abs(z - zc)) ;
    d = smin(d, snout, .9);
    d = Math.max(d, 3.95 - y + .12 * x * x * .0);   /* 위턱 아래는 평평하게 */
    return d + crack(x, y, z);
  }, { c: boneC, k: 0 }));
  /* 광대뼈·눈두덩: 눈구멍 둘레를 감싸는 두툼한 뼈 */
  for (const s of [-1, 1]) {
    prims.push(C('root', [s * 2.1, 5.9, 1.2], [s * 3.1, 5.6, -.6], .55, .7, { c: boneC, k: .5 }));
    prims.push(C('root', [s * 2.0, 4.6, 1.3], [s * 3.3, 4.7, -.9], .45, .55, { c: boneC, k: .5 }));
    /* 눈구멍: 깊게 파인 구멍 (안쪽에 푸른 빛 덩이) */
    prims.push(E('root', [s * 2.55, 5.25, .8], [.85, .7, .9], { sub: true, k: .25 }));
    /* 콧구멍 */
    prims.push(E('root', [s * .35, 5.05, 4.05], [.22, .16, .3], { sub: true, k: .1, rot: [.3, 0, 0] }));
    /* 머리 뒤 돌기 (천장 속으로 이어진다) */
    prims.push(C('root', [s * 1.4, 7.4, -.2], [s * 2.0, 8.4, -2.4], .6, .2, { c: boneC, k: .5 }));
  }
  /* 콧등 가운데 마루와 이마의 작은 뿔 줄 */
  prims.push(C('root', [0, 5.25, 4.0], [0, 7.6, -.5], .25, .55, { c: boneC, k: .5 }));
  for (const s of [-1, 1]) prims.push(C('root', [s * 1.7, 6.35, 1.6], [s * 3.0, 6.1, .3], .35, .5, { c: boneC, k: .35 }));   /* 눈 위로 튀어나온 눈두덩 */
  for (let i = 0; i < 4; i++) { const z = .9 - i * .9, b = [0, 7.2 + i * .25, z], tp = [0, 8.0 + i * .3, z - .7]; prims.push(C('root', b, tp, .28 - i * .03, .04, { c: boneC, k: .15 })); }
  /* 위턱 이빨: 가장자리를 따라 아래로. 앞쪽 송곳니 둘은 문틀처럼 길게 늘어진다 */
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = i / 8, z = mix(4.1, -.2, t), w = mix(.65, 2.2, Math.pow(t, .8)) - .12, fang = i === 2, L = fang ? 2.0 : .55 + .35 * Math.sin(i * 2.1 + 1) + (i === 5 ? .5 : 0);
    const b = [s * w, 4.05, z], tp = [s * (w + (fang ? .25 : .05)), 4.05 - L, z + (fang ? .35 : .1)];
    prims.push(C('root', b, tp, fang ? .3 : .16, .025, { g: 'teeth', c: toothC(b, tp), k: .05 }));
  }
  /* 뿔 한 쌍: 머리 옆에서 밖으로 나와 벽을 타고 바닥까지 휘어 내려와 문기둥이 된다 (마디 고리 결) */
  const hornC = (x, y, z, nx, ny) => { let c = cmix(rgb(0x5e6068), rgb(0xb8b4a8), sstep(0, 6, y)); c = csc(c, .82 + .2 * (Math.sin(y * 5 + x * 2) * .5 + .5)); return cmix(c, C_FROST, sstep(.4, .9, ny || 0) * .7); };
  for (const s of [-1, 1]) {
    const P = [[s * 2.9, 6.3, -.6], [s * 4.1, 5.9, .1], [s * 4.75, 4.6, .55], [s * 4.95, 3.0, .7], [s * 4.85, 1.5, .6], [s * 4.5, .35, .95], [s * 3.95, -.05, 1.75]], R = [.85, .78, .68, .6, .5, .38, .14];
    for (let i = 0; i + 1 < P.length; i++) prims.push(C('root', P[i], P[i + 1], R[i], R[i + 1], { g: 'horn', c: hornC, k: i ? .2 : 0, disp: (x, y, z) => .05 * Math.sin((y * 1.0 + Math.hypot(x, z) * .4) * 6.5) }));
  }
  /* 부서진 아래턱: 바닥 양옆에 반쯤 묻혀 이빨이 위로 솟았다 */
  for (const s of [-1, 1]) {
    prims.push(C('root', [s * 4.2, .1, -1.2], [s * 3.7, .35, 3.2], .55, .38, { c: boneC, k: 0, disp: (x, y, z) => crack(x, y, z) }));
    for (let i = 0; i < 6; i++) { const z = mix(2.8, -.6, i / 5), b = [s * mix(3.55, 3.95, i / 5), .6, z], tp = [s * (mix(3.55, 3.95, i / 5) - .1), .6 + (i === 1 ? 1.7 : .7 + .3 * Math.sin(i * 1.9)), z + .1];
      prims.push(C('root', b, tp, i === 1 ? .24 : .15, .02, { g: 'teeth', c: toothC(b, tp), k: .05 })); }
  }
  /* 머리뼈 위 서리 결정과 위턱에서 늘어진 고드름 */
  const iceC = (a, b) => (x, y, z) => { const k = clamp(Math.hypot(x - a[0], y - a[1], z - a[2]) / (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1), 0, 1); return cmix(C_ICE2, C_ICE, k); };
  { let sd = 29; const rr = (a, b) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    for (let i = 0; i < 26; i++) { const x = rr(-2.2, 2.2), z = rr(.4, 3.4), y = 3.98, L = rr(.3, 1.1) * (1 - Math.abs(x) * .15), b = [x, y + .05, z], tp = [x + rr(-.05, .05), y - L, z + rr(-.05, .05)];
      if (Math.abs(Math.abs(x) - 1.9) < .4 && z > 2) continue; prims.push(C('root', b, tp, rr(.05, .11), .01, { g: 'ice', c: iceC(b, tp), k: .03 })); }
    for (let i = 0; i < 22; i++) { const a = rr(-1.2, 1.2), z = rr(-1, 3.2), x = Math.sin(a) * mix(2.2, 1, (z + 1) / 4.2), y = mix(7.4, 5.6, (z + 1) / 4.2) + Math.cos(a) * .3, L = rr(.25, .7), b = [x, y, z], tp = [x * 1.15 + rr(-.1, .1), y + L, z + rr(-.2, .2)];
      prims.push(C('root', b, tp, rr(.08, .16), .01, { g: 'ice', c: iceC(b, tp), k: .03 })); } }
  /* 눈구멍 속 빛 덩이 (게임에서 빛나게) */
  for (const s of [-1, 1]) prims.push(E('root', [s * 2.6, 5.2, .55], [.38, .32, .3], { g: 'glow', c: rgb(0x8adfff) }));
  return {
    bones, prims, h: 9, size: 1,
    mats: { body: { r: .7 }, horn: { r: .55 }, teeth: { r: .4 }, ice: { r: .06, m: .1, tr: .85 }, glow: { glow: 1 } },
    gopt: { body: { h: .05, tris: 18000, loK: .25, aoS: .25 }, horn: { h: .04, tris: 6000, loK: .3, aoS: .2 }, teeth: { h: .03, tris: 3500, loK: .3, aoS: .15 }, ice: { h: .025, tris: 4000, loK: .3, aoS: .1 }, glow: { h: .04, tris: 600, noLo: 1, noAO: 1 } },
  };
}
module.exports = { hlairgate };
