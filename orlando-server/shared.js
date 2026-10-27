/* 오를란도 공용 데이터: 게임(브라우저)과 서버가 똑같이 쓰는 지도·지역·몬스터 정보 */
(function (root) {
  'use strict';
  const PI = Math.PI;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (e0, e1, x) => { const t = clampN((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- 지도 ----------
  const R1 = 103;                                   // 첫 지역(마을 주변) 반지름
  const C2 = { x: 360, z: 0 }, R2 = 160;            // 하레나와 둘레 (바깥 산줄기 안쪽)
  const ROAD = { x0: 95, x1: 226, half: 4.5 };      // 두 지역을 잇는 길 (z≈0)
  const TOWN_R = 40;                                // 도시 안전 지대 반지름
  const INNER = 82;                                 // 하레나 둘레 안쪽 고리(Lv1~15)와 바깥 고리(Lv16~60)의 경계
  const TOWN_BLD = { x: 18, z: -21, w: 16, d: 12 }; // 도시 기록관 (3층, 들어갈 수 있다) - 도시 중심 기준
  // ---------- 하레나 둘레: 서문에서 성을 두 바퀴 감아 나가는 길 하나 ----------
  // t: 길을 따라 간 정도 (0 = 서문 앞, 2π = 한 바퀴, 4π = 끝). 각도 = π + t (서 → 북 → 동 → 남, 북쪽 = -z)
  // 구역 8개: 한 구역 = 4분의 1 바퀴, 사이는 좁은 협곡 문
  const SP = { R0: 62, PITCH: 38, HW: 15, T: 4 * PI, Q: PI / 2,
    ZONES: ['forest', 'plains', 'swamp', 'ruins', 'wwest', 'wnorth', 'wsouth', 'weast'] };
  const spR = (t) => SP.R0 + SP.PITCH * t / (2 * PI);
  const spHW = (t) => { const k = Math.round(t / SP.Q), d = Math.abs(t - k * SP.Q); return (k > 0 && k < 8 && d < 0.07) ? SP.HW - 9.5 * Math.pow(1 - d / 0.07, 0.6) : SP.HW; };
  const spPos = (t, off = 0) => { const a = PI + t, r = spR(t) + off; return { x: C2.x + Math.cos(a) * r, z: C2.z + Math.sin(a) * r }; };
  // 가장 가까운 길 자리: t, off(길 가운데에서 바깥쪽 +), e(길 가장자리 밖으로 나간 거리, 음수면 길 안)
  function spNear(x, z) {
    const dx = x - C2.x, dz = z - C2.z, d = Math.hypot(dx, dz);
    let t0 = Math.atan2(dz, dx) - PI; t0 = ((t0 % (2 * PI)) + 2 * PI) % (2 * PI);
    let best = null;
    for (let k = 0; k < 3; k++) { const t = t0 + 2 * PI * k; if (t > SP.T) break; const off = d - spR(t), e = Math.abs(off) - spHW(t); if (!best || e < best.e) best = { t, off, e }; }
    return best;
  }
  const PIT = (() => { const p = spPos(2 * PI + 0.6, SP.HW + 9); return { x: p.x, z: p.z, r: 12, depth: 3.6 }; })();   // 석굴 입구: 5번 구역 바깥쪽 움푹한 곳
  const EPORTAL = spPos(SP.T - 0.25, 0);                                                                       // 길 끝: 지하실로 가는 포탈
  const ENTRY = { x0: C2.x - SP.R0 + SP.HW - 3, x1: C2.x - TOWN_R + 2, hz: 5 };                                 // 서문에서 길로 나가는 목
  // 걸어 다닐 수 있는 곳인가 (도시 · 서문 목 · 길 · 석굴 입구)
  function hInside(x, z, rad = 0) {
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    if (d2 < TOWN_R + 1.5 - rad) return true;
    if (x > ENTRY.x0 && x < ENTRY.x1 && Math.abs(z - C2.z) < ENTRY.hz - rad) return true;
    if (Math.hypot(x - PIT.x, z - PIT.z) < PIT.r + 1 - rad) return true;
    const n = spNear(x, z); return !!n && n.e <= -rad;
  }
  // 길 밖으로 나간 거리 (땅 높이·색에 쓴다)
  function hOutside(x, z) {
    const d2 = Math.hypot(x - C2.x, z - C2.z); let e = d2 - TOWN_R - 1.5;
    const ex = Math.max(ENTRY.x0 - x, x - ENTRY.x1, Math.abs(z - C2.z) - ENTRY.hz); if (ex < e) e = ex;
    const ep = Math.hypot(x - PIT.x, z - PIT.z) - PIT.r - 1; if (ep < e) e = ep;
    const n = spNear(x, z); if (n && n.e < e) e = n.e;
    return e;
  }
  const DUN = { x: 0, z: 422, R: 14, corZ0: 394, corZ1: 409, corW: 3.2 };
  const BOSS_HOME = { x: 0, z: 421 };
  const LAIR = { x: 470, z: 0, r: 18 };              // 심연 끝 붉은 용의 둥지
  const HALL = { x: 0, z: -500, R: 24 };             // 동쪽 황야 끝 포탈 너머: 지하실 (둥근 방, 천장이 막혀 있다)
  const WLAIR = { x: 200, z: -520, r: 22 };
  // 지하실 포탈 너머의 다섯 땅 (동쪽 멀리, 한 줄로)
  const ISLES = {
    silva:  { x: 900,  z: 0, R: 80 },   // 숲
    arbus:  { x: 1200, z: 0, R: 80 },   // 설산
    kaolis: { x: 1500, z: 0, R: 80 },   // 바다
    subcus: { x: 1800, z: 0, R: 75 },   // 지하 동굴
    marcus: { x: 2600, z: 0, R: 475 },   // 왕국 (성벽 반지름 350)
    milgol: { x: 3500, z: 0, R: 230 },   // 밀골: 밀 농사 마을 + 왕실 곡창
    fort:   { x: 4150, z: 0, R: 190 },   // 통로 요새
    coachway: { x: 5300, z: 0, R: 400 }, // 왕도: 마차가 달리는 고리 길 (타고 가는 동안만 머문다)
    castle: { x: 6400, z: 0, R: 300 },   // 엑시즈 성: 엑시즈 시내 왕궁 남문으로 들어가면 나온다
    guildhall: { x: 7100, z: 0, R: 140 }, // 길드홀: 엑시즈 시내 길드홀 정문으로 들어가면 나온다 (3층 건물과 뒤뜰)
    exmarket: { x: 7700, z: 0, R: 110 }, // 중앙 시장: 엑시즈 시내 시장 문으로 들어가면 나온다 (좌판·회랑·장비점·마구간)
    arena: { x: 8200, z: 0, R: 70 },     // 투기장: 어느 땅과도 이어지지 않는 둥근 콜로세움. 결투가 시작되면 둘이 옮겨 가고 끝나면 돌아온다
    // 엑시즈 동문 밖 사냥터 (Lv 100–125): 서쪽 끝으로 들어와 동쪽 끝으로 나가면 다음 땅. 마지막 땅을 나가면 밀골
    mfield: { x: 2700, z: 900, R: 150 },   // 들판
    mhill:  { x: 3150, z: 900, R: 150 },   // 구릉
    mwood:  { x: 3600, z: 900, R: 150 },   // 숲길
    mvale:  { x: 4050, z: 900, R: 150 },   // 계곡
    mpass:  { x: 4500, z: 900, R: 150 },   // 고개
  };
  // 엑시즈 문 밖 사냥터 줄: 숫자=줄(1 동문 · 2 북문 · 3 서문 · 4 남문), 글자=그 줄의 몇 번째 땅. 땅 생김새(kind)는 들판·구릉·숲·계곡·고개
  const MLINES = [
    { n: 1, gate: '동문', end: 'milgol', zones: [['mfield', 'field'], ['mhill', 'hill'], ['mwood', 'wood'], ['mvale', 'vale'], ['mpass', 'pass']] },
    { n: 2, gate: '북문', zones: [['m2a', 'wood'], ['m2b', 'hill'], ['m2c', 'wood'], ['m2d', 'vale'], ['m2e', 'pass']] },
    { n: 3, gate: '서문', zones: [['m3a', 'field'], ['m3b', 'hill'], ['m3c', 'field'], ['m3d', 'wood'], ['m3e', 'hill']] },
    { n: 4, gate: '남문', zones: [['m4a', 'wood'], ['m4b', 'vale'], ['m4c', 'wood'], ['m4d', 'vale'], ['m4e', 'pass']] },
  ];
  for (const L of MLINES) L.zones.forEach(([id, kind], i) => { const I = ISLES[id] || (ISLES[id] = { x: 2700 + i * 450, z: 900 + (L.n - 1) * 450, R: 150 }); I.kind = kind; I.line = L.n; I.seq = i; });
  const MHUNT = MLINES.flatMap((L) => L.zones.map((q) => q[0]));
  const ISLE_ORDER = ['silva', 'arbus', 'kaolis', 'subcus', 'marcus', 'milgol', 'fort', 'coachway', 'castle', 'guildhall', 'exmarket', 'arena', ...MHUNT];
  // 엑시즈 성벽(섬 중심 기준 m, 시계 방향)과 가장자리: 성벽에서 바깥으로 약 70m까지만 땅이 있다 (들쭉날쭉)
  const MARCUS_WALL_M = [[-303,-218],[-247,-216],[-173,-213],[-112,-240],[-57,-264],[11,-277],[134,-264],[214,-234],[282,-206],[355,-151],[380,-58],[380,28],[368,101],[355,138],[331,194],[282,243],[220,280],[134,292],[42,286],[-63,264],[-161,249],[-260,218],[-333,175],[-370,89],[-376,15],[-361,-46],[-352,-114],[-333,-169]];
  const MARCUS_EDGE_GAP = 70;
  function polyRay(P, a) { const ux = Math.cos(a), uz = Math.sin(a); let best = 0; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], dx = B[0] - A[0], dz = B[1] - A[1], den = ux * dz - uz * dx; if (Math.abs(den) < 1e-9) continue; const t = (A[0] * dz - A[1] * dx) / den, s = (A[0] * uz - A[1] * ux) / den; if (t > best && s >= 0 && s <= 1) best = t; } return best; }
  for (const k of ISLE_ORDER) { const I = ISLES[k]; I.id = k; I.entry = { x: I.x, z: I.z + I.R - 12 }; }   // 들어오는 자리 (남쪽 가장자리)
  ISLES.marcus.entry = { x: ISLES.marcus.x, z: ISLES.marcus.z + isleEdge(ISLES.marcus, Math.PI / 2) - 12 };   // 엑시즈: 가장자리가 성벽을 따르므로 남쪽 끝에서 잰다
  for (const k of MHUNT) { const I = ISLES[k]; I.entry = { x: I.x - I.R + 14, z: I.z }; I.exit = { x: I.x + I.R - 14, z: I.z }; }   // 사냥터: 서쪽으로 들어와 동쪽으로 나간다
  // 섬 가장자리 반지름 (엑시즈는 둥글지 않게 들쭉날쭉: 언덕 너머로 이어지는 땅처럼 보이게)
  function isleEdge(I, a) { if (I.id !== 'marcus') return I.R; return polyRay(MARCUS_WALL_M, a) + MARCUS_EDGE_GAP + 6 * Math.sin(3 * a + 1.3) + 4 * Math.sin(7 * a + 0.4) + 2 * Math.sin(13 * a + 2.1); }
  function isleAt(x, z) { let b = null, bd = 1e9; for (const k of ISLE_ORDER) { const I = ISLES[k]; const d = Math.hypot(x - I.x, z - I.z) - I.R; if (d < bd) { bd = d; b = I; } } return b; }
  // 지하실 위층의 작은 방 (계단을 올라가면 나온다)
  const HALL_ROOM = { x: 0, z0: -500 - 24 - 8.3 - 10, z1: -500 - 24 - 8.3, hw: 4.5, y: 4.5, corHw: 1.8, stHw: 1.5, stLen: 16, stRise: 9, stLand: 3.4 };
  // 계단 꼭대기 너머: 길드홀 지하 창고 (북쪽 벽의 짧은 계단 위 문으로 길드홀 1층에 오른다)
  const CELLAR = (() => { const H = HALL_ROOM, zS = H.z0 - H.stLen - H.stLand; return { x: H.x, z1: zS, z0: zS - 14, hw: 7, y: H.y + H.stRise, up: 2.0, stL: 4.4, land: 1.8 }; })();   // st*: 방 안쪽(북쪽) 벽에서 위로 오르는 계단           // 포탈을 처음 타면 가는 와이번의 둥지 (잡으면 다음부터는 바로 지하실)                 // 동쪽 황야 끝 포탈

  // 튀르팽의 집: 하레나 성안 흙집 안 (작은 방 하나, 문으로 드나든다)
  const THOUSE = { x: -200, z: -800, hw: 5.5, hd: 4.5, rh: 3.8 };
  const inTHouse = (x, z) => Math.abs(x - THOUSE.x) < THOUSE.hw + 6 && Math.abs(z - THOUSE.z) < THOUSE.hd + 6;
  function zoneAt(x, z) {
    if (inTHouse(x, z)) return 'thouse';
    if (x >= 800) return isleAt(x, z).id;
    if (z > 300) return 'dungeon';
    if (z < -300) return x > 100 ? 'wlair' : 'hall';
    // 하레나와 둘레 길 (옛 첫 지역은 없앴다: 하레나에서 시작해 60레벨까지 키운다)
    if (Math.hypot(x - C2.x, z - C2.z) < TOWN_R) return 'town';
    const n = spNear(x, z); const i = n ? clampN(Math.floor(n.t / SP.Q), 0, 7) : 0;
    return SP.ZONES[i];
  }
  const SAFE = { village: 1, town: 1, hall: 1, thouse: 1, marcus: 1, milgol: 1, fort: 1, coachway: 1, castle: 1, guildhall: 1, exmarket: 1, arena: 1 };

  // 걸어 다닐 수 있는 곳 안으로 붙잡는다 (첫 지역 원, 길, 두 번째 지역 원, 석굴)
  function roomClamp(p, rad) {
    const R = DUN.R - rad, d = Math.hypot(p.x - DUN.x, p.z - DUN.z);
    const x0 = DUN.x - DUN.corW + rad, x1 = DUN.x + DUN.corW - rad, z0 = DUN.corZ0 + 0.6 + rad, z1 = DUN.corZ1 + 2;
    if (d <= R || (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) return;
    const k = R / Math.max(d, 1e-4), ax = DUN.x + (p.x - DUN.x) * k, az = DUN.z + (p.z - DUN.z) * k;
    const bx = clampN(p.x, x0, x1), bz = clampN(p.z, z0, z1);
    if (Math.hypot(p.x - ax, p.z - az) <= Math.hypot(p.x - bx, p.z - bz)) { p.x = ax; p.z = az; } else { p.x = bx; p.z = bz; }
  }
  const inHallAnnex = (p, rad) => { const H = HALL_ROOM; if (Math.abs(p.x - H.x) < H.hw - rad && p.z > H.z0 + rad && p.z < H.z1 + 1) return true;
    if (Math.abs(p.x - H.x) < H.stHw - rad && p.z > H.z0 - H.stLen - H.stLand - 1 && p.z <= H.z0 + rad + 0.01) return true;
    { const C = CELLAR; if (Math.abs(p.x - C.x) < C.hw - rad && p.z > C.z0 + rad && p.z <= C.z1 + 0.01) return true; } return Math.abs(p.x - H.x) < H.corHw - rad * 0.5 && p.z > H.z1 - 1 && p.z < HALL.z - HALL.R + 2; };
  function worldClamp(p, rad) {
    if (inTHouse(p.x, p.z)) { const T = THOUSE; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (p.x >= 800) { const I = isleAt(p.x, p.z); const d = Math.hypot(p.x - I.x, p.z - I.z), r = isleEdge(I, Math.atan2(p.z - I.z, p.x - I.x)) - rad; if (d > r) { p.x = I.x + (p.x - I.x) * r / d; p.z = I.z + (p.z - I.z) * r / d; } return; }
    if (p.z > 300) return roomClamp(p, rad);
    if (p.z < -300 && p.x <= 100 && inHallAnnex(p, rad)) return;
    /* 지하실 딸린 방·계단·창고 밖으로 나갔으면 (벽을 뚫었으면) 가장 가까운 안쪽 자리로 되민다 — 둥근 방 가장자리로 튕겨 보내지 않는다 */
    if (p.z < -300 && p.x <= 100 && p.z < HALL.z - HALL.R + 2 && Math.hypot(p.x - HALL.x, p.z - HALL.z) > HALL.R - rad) { const H = HALL_ROOM, C = CELLAR, zS = H.z0 - H.stLen - H.stLand;
      const R = [[H.x - H.hw + rad, H.x + H.hw - rad, H.z0 + rad, H.z1 + 1], [H.x - H.stHw + rad, H.x + H.stHw - rad, zS - 1, H.z0 + rad], [C.x - C.hw + rad, C.x + C.hw - rad, C.z0 + rad, C.z1], [H.x - H.corHw + rad * 0.5, H.x + H.corHw - rad * 0.5, H.z1 - 1, HALL.z - HALL.R + 2]];
      let bx = p.x, bz = p.z, bd = 1e9; for (const [x0, x1, z0, z1] of R) { const qx = clampN(p.x, x0, x1), qz = clampN(p.z, z0, z1), d = Math.hypot(qx - p.x, qz - p.z); if (d < bd) { bd = d; bx = qx; bz = qz; } }
      p.x = bx; p.z = bz; return; }
    if (p.z < -300) { const A = p.x > 100 ? { x: WLAIR.x, z: WLAIR.z, R: WLAIR.r } : HALL; const d = Math.hypot(p.x - A.x, p.z - A.z), r = A.R - rad; if (d > r) { p.x = A.x + (p.x - A.x) * r / d; p.z = A.z + (p.z - A.z) * r / d; } return; }
    // 하레나 둘레: 도시 · 서문 목 · 길 · 석굴 입구 안으로 (가장 가까운 자리로 민다)
    if (hInside(p.x, p.z, rad)) return;
    const c = [], d2 = Math.hypot(p.x - C2.x, p.z - C2.z);
    { const r = TOWN_R + 1.5 - rad - 0.05; c.push({ x: C2.x + (p.x - C2.x) * r / Math.max(d2, 1e-4), z: C2.z + (p.z - C2.z) * r / Math.max(d2, 1e-4) }); }
    c.push({ x: clampN(p.x, ENTRY.x0 + 0.05, ENTRY.x1 - 0.05), z: clampN(p.z, C2.z - ENTRY.hz + rad + 0.05, C2.z + ENTRY.hz - rad - 0.05) });
    { const dp = Math.hypot(p.x - PIT.x, p.z - PIT.z), r = PIT.r + 1 - rad - 0.05; c.push({ x: PIT.x + (p.x - PIT.x) * r / Math.max(dp, 1e-4), z: PIT.z + (p.z - PIT.z) * r / Math.max(dp, 1e-4) }); }
    const a = Math.atan2(p.z - C2.z, p.x - C2.x);
    for (let k = 0; k < 3; k++) {   // 같은 각도의 길 고리들
      const t = (((a - PI) % (2 * PI)) + 2 * PI) % (2 * PI) + 2 * PI * k; if (t > SP.T) break;
      const R = spR(t), h = Math.max(0.2, spHW(t) - rad - 0.05), r = clampN(d2, R - h, R + h);
      c.push({ x: C2.x + Math.cos(a) * r, z: C2.z + Math.sin(a) * r });
    }
    for (const t of [0.004, SP.T - 0.004]) { const R = spR(t), h = SP.HW - rad - 0.05; c.push(spPos(t, clampN(d2 - R, -h, h))); }   // 길의 처음과 끝
    let best = null, bd = 1e9;
    for (const q of c) { if (!hInside(q.x, q.z, rad * 0.9)) continue; const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; best = q; } }
    if (best) { p.x = best.x; p.z = best.z; }
  }
  // 몬스터가 들어가면 안 되는 안전 지대 밖으로 밀어낸다
  function keepOutOfSafe(p, rad) {
    const d2 = Math.hypot(p.x - C2.x, p.z - C2.z);
    if (d2 < TOWN_R + 2 + rad) { const k = (TOWN_R + 2 + rad) / Math.max(d2, 1e-4); p.x = C2.x + (p.x - C2.x) * k; p.z = C2.z + (p.z - C2.z) * k; }
  }

  // ---------- 몬스터 ----------
  // fixed: 첫 지역의 손으로 정한 능력치 / 나머지는 레벨 공식(hpM·atkM·defM 배율)
  const MON = {
    slime:    { name: '슬라임', lv: 1, fixed: { hp: 26, atk: 6, def: 1, exp: 9 }, build: 'slime', color: 0x7fd067 },
    wolf:     { name: '회색 늑대', lv: 3, fixed: { hp: 38, atk: 8, def: 2, exp: 14 }, build: 'quad', color: 0x8d8f92 },
    boar:     { name: '사막멧돼지', lv: 4, fixed: { hp: 58, atk: 11, def: 4, exp: 22 }, build: 'quad', color: 0x6e4b31, tusk: true },
    goblin:   { name: '사막고블린', lv: 6, fixed: { hp: 54, atk: 13, def: 4, exp: 26 }, build: 'biped', color: 0x6f9440, scale: 0.8, ears: true },
    toad:     { name: '독두꺼비', lv: 8, fixed: { hp: 84, atk: 16, def: 6, exp: 38 }, build: 'slime', color: 0x6a7a2c, toad: true, scale: 1.2 },
    lizard:   { name: '모래도마뱀', lv: 10, fixed: { hp: 104, atk: 19, def: 8, exp: 50 }, build: 'biped', color: 0x3f7d60, tail: true },
    skeleton: { name: '사막방울뱀', lv: 12, fixed: { hp: 120, atk: 23, def: 9, exp: 64 }, build: 'snake', color: 0xc4a46e, scale: 1.6 },
    ogre:     { name: '낙타', lv: 15, fixed: { hp: 200, atk: 29, def: 12, exp: 98 }, build: 'biped', color: 0xc8a068, scale: 1.15 },
    // 길
    dog:      { name: '들개', lv: 12, build: 'quad', color: 0x7a5a3a, hpM: 0.8, atkM: 1 },
    bandit:   { name: '산적', lv: 16, build: 'biped', color: 0x6b4a2e, hpM: 1, atkM: 1.05, sword: true },
    // 서쪽 황야 (Lv 20–30)
    jackal:   { name: '자칼', lv: 22, build: 'quad', color: 0xa88a5a, hpM: 0.85, atkM: 1 },
    sandslime:{ name: '모래 슬라임', lv: 27, build: 'slime', color: 0xc9a46a, hpM: 1.2, atkM: 0.9, scale: 1.3 },
    // 북쪽 황야 (Lv 28–40)
    hyena:    { name: '하이에나', lv: 31, build: 'quad', color: 0x8a7a5a, hpM: 0.95, atkM: 1.1, scale: 1.05 },
    rockslime:{ name: '바위 슬라임', lv: 35, build: 'slime', color: 0x8a8478, hpM: 1.4, atkM: 0.95, scale: 1.4 },
    nomad:    { name: '사막 거북', lv: 39, build: 'quad', color: 0x8a6a44, hpM: 1.05, atkM: 1.15, scale: 1.3 },   // 등딱지에 돌이 박힌 큰 사막 거북
    // 남쪽 황야 (Lv 38–50)
    scorpion: { name: '전갈', lv: 42, build: 'quad', color: 0xb07a3a, hpM: 1.1, atkM: 1.1, tail: true, scale: 1.1 },
    salamander:{ name: '불도마뱀', lv: 45, build: 'biped', color: 0xb8402a, hpM: 1.1, atkM: 1.2, tail: true },
    duneogre: { name: '모래 벌레', lv: 49, build: 'quad', color: 0xcfae7a, hpM: 1.6, atkM: 1.2, scale: 1.2 },   // 모래 속을 파고 다니다 솟아오르는 큰 벌레
    // 동쪽 황야 (Lv 48–60)
    redlizard:{ name: '사막 독수리', lv: 52, build: 'quad', color: 0x3a2a20, hpM: 1.1, atkM: 1.2, scale: 1.25 },   // 땅을 걸어 다니다 날개를 펴고 쪼는 큰 대머리 독수리
    emberslime:{ name: '불씨 슬라임', lv: 56, build: 'slime', color: 0xd8702a, hpM: 1.1, atkM: 1.2, scale: 1.4, glow: 0xff5a10 },
    redgiant: { name: '붉은 바위 거인', lv: 59, build: 'biped', color: 0x7a3a2a, hpM: 1.8, atkM: 1.25, scale: 2.1, club: true },
    // 석굴
    kingslime:{ name: '킹 슬라임', lv: 20, fixed: { hp: 16000, atk: 70, def: 14, exp: 4500 }, gold: 1500, build: 'slime', color: 0x56c860, scale: 4.2, boss: true },
    slimelet: { name: '킹 슬라임 조각', lv: 18, build: 'slime', color: 0x7fe07a, hpM: 0.5, atkM: 0.8, scale: 1.1 },
    // 심연 끝
    wyvern:{ name: '와이번', lv: 62, fixed: { hp: 45000, atk: 330, def: 40, exp: 20000 }, gold: 6000, build: 'dragon', wyvern: true, color: 0x2f5a46, scale: 1.3, dragon: true, arena: 'WLAIR' },
    // 실바 (Lv 60–70)
    silvawolf:{ name: '은빛 늑대', lv: 63, build: 'quad', color: 0xc8ccd4, hpM: 1.0, atkM: 1.15, scale: 1.1 },
    mossslime:{ name: '이끼 슬라임', lv: 66, build: 'slime', color: 0x5a8a3a, hpM: 1.3, atkM: 1.0, scale: 1.4, glow: 0x3aa050 },
    treant:   { name: '나무 거인', lv: 69, build: 'biped', color: 0x6a4a2a, hpM: 1.9, atkM: 1.3, scale: 2.0, club: true },
    // 아르부스 (Lv 70–80)
    snowwolf: { name: '설산 늑대', lv: 73, build: 'quad', color: 0xf0f2f4, hpM: 1.05, atkM: 1.2, scale: 1.15 },
    frostslime:{ name: '서리 슬라임', lv: 76, build: 'slime', color: 0xb8e0f8, hpM: 1.35, atkM: 1.05, scale: 1.45, glow: 0x60b0ff },
    yeti:     { name: '예티', lv: 79, build: 'biped', color: 0xe8ecf0, hpM: 1.9, atkM: 1.35, scale: 2.0, club: true },
    // 카올리스 (Lv 80–90)
    mackerel: { name: '화난 고등어', lv: 84, build: 'quad', color: 0x2a5a78, hpM: 1.15, atkM: 1.3, scale: 1.25 },
    octopus:  { name: '큰 문어', lv: 88, build: 'quad', color: 0xb8483a, hpM: 1.35, atkM: 1.35, scale: 1.3 },   // 여덟 다리로 모래 위를 기어 다니는 큰 문어
    tideslime:{ name: '파도 슬라임', lv: 86, build: 'slime', color: 0x40a0c0, hpM: 1.4, atkM: 1.1, scale: 1.5, glow: 0x30c0e0 },
    // 숩쿠스 (Lv 90–100)
    darkhound:{ name: '어둠 사냥개', lv: 93, build: 'quad', color: 0x2a2630, hpM: 1.1, atkM: 1.3, scale: 1.2 },
    crystalslime:{ name: '수정 슬라임', lv: 96, build: 'slime', color: 0x9a60e0, hpM: 1.5, atkM: 1.15, scale: 1.5, glow: 0xb070ff },
    cavetroll:{ name: '동굴 트롤', lv: 99, build: 'biped', color: 0x5a5a62, hpM: 2.1, atkM: 1.45, scale: 2.2, club: true },
    // 엑시즈 동문 밖 사냥터 (Lv 100–125)
    fieldwolf:{ name: '들늑대', lv: 101, build: 'quad', color: 0x8a6e4e, hpM: 1.1, atkM: 1.25, scale: 1.2 },
    mudslime: { name: '진흙 슬라임', lv: 104, build: 'slime', color: 0x7a5e3e, hpM: 1.5, atkM: 1.15, scale: 1.55 },
    hillboar: { name: '큰 멧돼지', lv: 106, build: 'quad', color: 0x4e3626, hpM: 1.4, atkM: 1.35, scale: 1.45, tusk: true },
    meadowviper:{ name: '풀뱀', lv: 109, build: 'snake', color: 0x5a8a3e, hpM: 1.1, atkM: 1.45, scale: 1.8 },
    woodbear: { name: '흑곰', lv: 111, build: 'quad', color: 0x2c2420, hpM: 1.7, atkM: 1.4, scale: 1.7 },
    thornslime:{ name: '가시 슬라임', lv: 113, build: 'slime', color: 0x3e6a2a, hpM: 1.55, atkM: 1.25, scale: 1.55, glow: 0x9ad040 },
    woodtroll:{ name: '숲 트롤', lv: 115, build: 'biped', color: 0x4e5e3a, hpM: 2.2, atkM: 1.5, scale: 2.25, club: true },
    stonehound:{ name: '돌개', lv: 116, build: 'quad', color: 0x7a7670, hpM: 1.35, atkM: 1.4, scale: 1.3 },
    valleyogre:{ name: '계곡 오우거', lv: 119, build: 'biped', color: 0x8a6a4a, hpM: 2.3, atkM: 1.55, scale: 2.3, club: true },
    windwolf: { name: '바람 늑대', lv: 121, build: 'quad', color: 0xb8c4cc, hpM: 1.3, atkM: 1.5, scale: 1.3 },
    mistslime:{ name: '안개 슬라임', lv: 123, build: 'slime', color: 0xc8d4dc, hpM: 1.6, atkM: 1.3, scale: 1.6, glow: 0xa0c8e8 },
    cliffgiant:{ name: '벼랑 거인', lv: 125, build: 'biped', color: 0x6a6662, hpM: 2.5, atkM: 1.6, scale: 2.5, club: true },
    // 엑시즈 북문 밖 (Lv 125–150)
    pinewolf: { name: '솔늑대', lv: 126, build: 'quad', color: 0x5a4a3a, hpM: 1.2, atkM: 1.4, scale: 1.25 },
    barkslime:{ name: '나무껍질 슬라임', lv: 128, build: 'slime', color: 0x6a4e32, hpM: 1.6, atkM: 1.3, scale: 1.6 },
    hornboar: { name: '뿔멧돼지', lv: 131, build: 'quad', color: 0x3e2e22, hpM: 1.5, atkM: 1.45, scale: 1.5, tusk: true },
    rockviper:{ name: '바위뱀', lv: 134, build: 'snake', color: 0x6e6a60, hpM: 1.2, atkM: 1.55, scale: 1.9 },
    greybear: { name: '회색곰', lv: 136, build: 'quad', color: 0x6a645c, hpM: 1.8, atkM: 1.5, scale: 1.75 },
    resinslime:{ name: '송진 슬라임', lv: 138, build: 'slime', color: 0xc8902a, hpM: 1.6, atkM: 1.35, scale: 1.6, glow: 0xffb040 },
    pinetroll:{ name: '솔숲 트롤', lv: 140, build: 'biped', color: 0x3e4a32, hpM: 2.3, atkM: 1.6, scale: 2.3, club: true },
    cragdog:  { name: '바위개', lv: 141, build: 'quad', color: 0x5e5a54, hpM: 1.4, atkM: 1.5, scale: 1.35 },
    rockogre: { name: '바위 오우거', lv: 144, build: 'biped', color: 0x7a7266, hpM: 2.4, atkM: 1.65, scale: 2.35, club: true },
    icewolf:  { name: '얼음 늑대', lv: 146, build: 'quad', color: 0xd0e0ea, hpM: 1.35, atkM: 1.6, scale: 1.35 },
    snowslime:{ name: '눈 슬라임', lv: 148, build: 'slime', color: 0xeef4f8, hpM: 1.7, atkM: 1.4, scale: 1.65, glow: 0xc0e0ff },
    frostgiant:{ name: '서리 거인', lv: 150, build: 'biped', color: 0x9ab0c0, hpM: 2.6, atkM: 1.7, scale: 2.6, club: true },
    // 엑시즈 서문 밖 (Lv 150–175)
    steppewolf:{ name: '초원 늑대', lv: 151, build: 'quad', color: 0x9a8058, hpM: 1.25, atkM: 1.5, scale: 1.3 },
    clayslime:{ name: '점토 슬라임', lv: 154, build: 'slime', color: 0xa86a48, hpM: 1.7, atkM: 1.35, scale: 1.65 },
    wildram:  { name: '들양', lv: 156, build: 'quad', color: 0xd8ccb0, hpM: 1.5, atkM: 1.5, scale: 1.4, tusk: true },
    reedviper:{ name: '갈대뱀', lv: 159, build: 'snake', color: 0x8a9a4a, hpM: 1.25, atkM: 1.65, scale: 2.0 },
    warboar:  { name: '싸움 멧돼지', lv: 161, build: 'quad', color: 0x5a3626, hpM: 1.6, atkM: 1.6, scale: 1.55, tusk: true },
    pollenslime:{ name: '꽃가루 슬라임', lv: 163, build: 'slime', color: 0xe8d050, hpM: 1.7, atkM: 1.4, scale: 1.65, glow: 0xfff070 },
    fieldogre:{ name: '들판 오우거', lv: 165, build: 'biped', color: 0x9a7a52, hpM: 2.5, atkM: 1.7, scale: 2.4, club: true },
    ashwolf:  { name: '잿빛 늑대', lv: 166, build: 'quad', color: 0x6a6866, hpM: 1.4, atkM: 1.65, scale: 1.35 },
    brownbear:{ name: '불곰', lv: 169, build: 'quad', color: 0x5a3a22, hpM: 1.9, atkM: 1.6, scale: 1.85 },
    hilltroll:{ name: '언덕 트롤', lv: 171, build: 'biped', color: 0x6a7a4a, hpM: 2.5, atkM: 1.7, scale: 2.35, club: true },
    stoneslime:{ name: '돌 슬라임', lv: 173, build: 'slime', color: 0x8a8680, hpM: 1.9, atkM: 1.45, scale: 1.7 },
    hillgiant:{ name: '언덕 거인', lv: 175, build: 'biped', color: 0x8a7a62, hpM: 2.7, atkM: 1.75, scale: 2.65, club: true },
    // 엑시즈 남문 밖 (Lv 175–200)
    shadewolf:{ name: '그늘 늑대', lv: 176, build: 'quad', color: 0x3a3a3e, hpM: 1.4, atkM: 1.7, scale: 1.35 },
    leafslime:{ name: '잎 슬라임', lv: 178, build: 'slime', color: 0x4a8a3a, hpM: 1.8, atkM: 1.5, scale: 1.7, glow: 0x80e060 },
    cliffboar:{ name: '벼랑 멧돼지', lv: 181, build: 'quad', color: 0x4a3a30, hpM: 1.7, atkM: 1.7, scale: 1.6, tusk: true },
    pitviper: { name: '살무사', lv: 184, build: 'snake', color: 0x5a4a32, hpM: 1.3, atkM: 1.8, scale: 2.0 },
    moonbear: { name: '반달곰', lv: 186, build: 'quad', color: 0x1e1a1a, hpM: 2.0, atkM: 1.7, scale: 1.85 },
    rotslime: { name: '썩은 잎 슬라임', lv: 188, build: 'slime', color: 0x5a5a2a, hpM: 1.9, atkM: 1.55, scale: 1.7 },
    oldtroll: { name: '늙은 트롤', lv: 190, build: 'biped', color: 0x4a5a4a, hpM: 2.7, atkM: 1.8, scale: 2.45, club: true },
    gorgehound:{ name: '협곡 사냥개', lv: 191, build: 'quad', color: 0x7a5e48, hpM: 1.55, atkM: 1.75, scale: 1.4 },
    gorgeogre:{ name: '협곡 오우거', lv: 194, build: 'biped', color: 0x7a5a42, hpM: 2.8, atkM: 1.85, scale: 2.5, club: true },
    stormwolf:{ name: '폭풍 늑대', lv: 196, build: 'quad', color: 0x7a8a9a, hpM: 1.6, atkM: 1.85, scale: 1.45 },
    cloudslime:{ name: '구름 슬라임', lv: 198, build: 'slime', color: 0xf0f2f6, hpM: 2.0, atkM: 1.6, scale: 1.75, glow: 0xd8e8ff },
    peakgiant:{ name: '봉우리 거인', lv: 200, build: 'biped', color: 0x8a8a92, hpM: 3.0, atkM: 1.9, scale: 2.8, club: true },
    reddragon:{ name: '붉은 용 이그니스', lv: 100, fixed: { hp: 450000, atk: 900, def: 60, exp: 80000 }, gold: 80000, build: 'dragon', color: 0xa8231a, scale: 1, dragon: true },
  };
  const HP_MUL = 1.6, EXP_MUL = 1.25;
  function monStats(ty, lv) {
    const D = MON[ty];
    // 모든 몬스터: HP 1.6배, 대신 경험치 1.25배
    if (D.fixed) return { ...D.fixed, hp: Math.round(D.fixed.hp * HP_MUL), exp: Math.round(D.fixed.exp * EXP_MUL), lv: D.lv };
    const L = lv;
    return {
      lv: L,
      hp: Math.round((12 * Math.pow(L, 1.25) + 15) * (D.hpM || 1) * HP_MUL),
      atk: Math.round((5 + 2.4 * Math.pow(L, 1.1)) * (D.atkM || 1)),
      def: Math.round(L * 0.9 * (D.defM || 1)),
      exp: Math.round(6 * Math.pow(L, 1.3) * (0.5 + 0.5 * (D.hpM || 1)) * EXP_MUL),
    };
  }
  const ZONE_MON = {
    forest: ['slime', 'slime', 'wolf'], plains: ['boar', 'goblin'], swamp: ['toad', 'lizard'], ruins: ['skeleton', 'skeleton', 'ogre'],
    wwest: ['jackal', 'sandslime'], wnorth: ['hyena', 'rockslime', 'nomad'], wsouth: ['scorpion', 'duneogre'], weast: ['redlizard', 'emberslime', 'redgiant'],
    silva: ['silvawolf', 'mossslime'], arbus: ['snowwolf', 'frostslime'], kaolis: ['mackerel', 'tideslime', 'octopus'], subcus: ['darkhound', 'crystalslime'],
    mfield: ['fieldwolf', 'fieldwolf', 'mudslime'], mhill: ['hillboar', 'meadowviper'], mwood: ['woodbear', 'thornslime', 'woodtroll'], mvale: ['stonehound', 'valleyogre'], mpass: ['windwolf', 'mistslime', 'cliffgiant'],
    m2a: ['pinewolf', 'pinewolf', 'barkslime'], m2b: ['hornboar', 'rockviper'], m2c: ['greybear', 'resinslime', 'pinetroll'], m2d: ['cragdog', 'rockogre'], m2e: ['icewolf', 'snowslime', 'frostgiant'],
    m3a: ['steppewolf', 'steppewolf', 'clayslime'], m3b: ['wildram', 'reedviper'], m3c: ['warboar', 'pollenslime', 'fieldogre'], m3d: ['ashwolf', 'brownbear'], m3e: ['hilltroll', 'stoneslime', 'hillgiant'],
    m4a: ['shadewolf', 'shadewolf', 'leafslime'], m4b: ['cliffboar', 'pitviper'], m4c: ['moonbear', 'rotslime', 'oldtroll'], m4d: ['gorgehound', 'gorgeogre'], m4e: ['stormwolf', 'cloudslime', 'peakgiant'],
  };
  const ZONE_COUNT = { forest: 14, plains: 15, swamp: 16, ruins: 17, wwest: 28, wnorth: 30, wsouth: 32, weast: 34, silva: 30, arbus: 30, kaolis: 30, subcus: 30, mfield: 40, mhill: 42, mwood: 44, mvale: 44, mpass: 46, m2a: 32, m2b: 32, m2c: 32, m2d: 32, m2e: 32, m3a: 32, m3b: 32, m3c: 32, m3d: 32, m3e: 32, m4a: 32, m4b: 32, m4c: 32, m4d: 32, m4e: 32 };
  // 지역별 레벨: 두 번째 지역은 도시에서 멀수록 강하다
  function levelAt(zone, x, z) {
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    const f = (a, b, lo, hi) => Math.round(lo + (hi - lo) * clampN((d2 - a) / (b - a), 0, 1));
    if (ISLES[zone] && ZONE_LEVELS[zone]) { const I = ISLES[zone], L = ZONE_LEVELS[zone]; const d = Math.hypot(x - I.entry.x, z - I.entry.z); return Math.round(L[0] + (L[1] - L[0]) * clampN((d - 12) / (I.R * 1.7 - 12), 0, 1)); }   // 들어온 자리에서 멀수록 강하다
    switch (zone) {
      case 'forest': case 'plains': case 'swamp': case 'ruins': case 'wwest': case 'wnorth': case 'wsouth': case 'weast': {   // 길을 따라 갈수록 강하다
        const n = spNear(x, z), L = ZONE_LEVELS[zone], i = SP.ZONES.indexOf(zone), fr = n ? clampN((n.t - i * SP.Q) / SP.Q, 0, 1) : 0;
        return Math.round(L[0] + (L[1] - L[0]) * fr); }
      default: return 1;
    }
  }
  const ZONE_LEVELS = { village: [0, 0], forest: [1, 3], plains: [4, 6], swamp: [8, 10], ruins: [12, 15], dungeon: [18, 22], town: [0, 0], hall: [60, 60], wlair: [62, 62], wwest: [16, 27], wnorth: [31, 39], wsouth: [42, 49], weast: [52, 59], silva: [60, 70], arbus: [70, 80], kaolis: [80, 90], subcus: [90, 100], marcus: [0, 0], milgol: [0, 0], fort: [0, 0], coachway: [0, 0], castle: [0, 0], guildhall: [0, 0], exmarket: [0, 0], arena: [0, 0], mfield: [100, 105], mhill: [105, 110], mwood: [110, 115], mvale: [115, 120], mpass: [120, 125] };
  MLINES.forEach((L) => { if (L.n > 1) L.zones.forEach(([id], i) => { const a = 125 + (L.n - 2) * 25 + i * 5; ZONE_LEVELS[id] = [a, a + 5]; }); });

  // ---------- 의뢰 게시판 포스터 ----------
  // 의뢰를 주는 NPC마다 게시판이 따로 있다. 포스터는 마을 사람(실제 NPC)이 이유를 적어 붙인 것
  // {m}: 몬스터 이름, {z}: 지역 이름
  const G = (n, r, why) => ({ n, r, why });
  const BOARDS = {
    kyle: { title: '사냥꾼 길드 게시판', cap: 12, zones: ['forest', 'plains', 'swamp', 'ruins', 'wwest', 'wnorth', 'wsouth', 'weast'], givers: [   /* 마르타의 게시판을 합쳤다 */

      G('하레나 주민', '주민', ['나무꾼들이 {z}에 들어가질 못하고 있어요. {m} 때문에 겨울 땔감이 모자랄 지경이에요.', '아이들이 {z} 쪽 들판으로 놀러 갔다가 {m}에게 쫓겨 왔어요. 다시는 그런 일이 없게 해 주세요.']),
      G('엘리스', '순간이동 술사', ['별빛 길을 여는 수정을 {z}에 두고 왔는데, {m}이(가) 그 주변에 진을 쳤어요. 길을 터 주면 수정을 찾으러 갈게요.']),
      G('토르간', '하레나 대장장이', ['숲에서 오는 숯 마차가 {z}에서 {m}에게 습격당했어. 불이 꺼지면 망치도 멈춘다고.']),
      G('카일', '사냥꾼 길드장', ['{z}의 {m} 무리가 길드 사냥꾼 둘을 다치게 했다. 무리의 수를 확 줄여 놓게.', '{z}에 {m}이(가) 부쩍 늘었다. 이대로 두면 하레나 성벽까지 내려올 거다.']),
      G('브론', '무기상', ['칼날 재료를 실은 상단이 {z}에서 {m}에게 습격당했소. 길이 안전해져야 좋은 무기를 들여올 수 있지.']),
      G('미나', '잡화상', ['{z}에서 나는 약초를 받아 와야 포션을 만들 수 있는데, {m} 때문에 채집꾼들이 다 돌아왔어요.']),
      G('베른', '지도 제작자', ['{z}의 지도를 마저 그려야 하는데 {m}이(가) 측량대를 쫓아냈어! 한동안 조용하게 만들어 줘.']),
      G('튀르팽', '현자', ['{z}에서 이상한 기운이 느껴집니다. {m}이(가) 그 기운에 끌려 모여드는 것 같아요. 수를 줄여 주면 원인을 살펴보겠습니다.']),
      G('로웬', '경비대장', ['{z}에서 {m}이(가) 무리를 지어 성벽 쪽으로 오고 있다. 경비대만으로는 모자라니 힘을 보태라.', '어젯밤 {z} 감시탑이 {m}에게 습격당했다. 감시탑을 다시 세울 수 있게 주변을 쓸어 버려라.']),
      G('한나', '여관 주인', ['손님들이 {z}를 지나오다 {m}에게 짐을 다 잃었대요. 여관 손님이 끊기면 저도 큰일이에요.', '{z}에서 오는 식재료 마차가 {m} 때문에 사흘째 안 와요. 수프 냄비가 비어 가요!']),
      G('티모', '아이', ['아빠가 {z}로 장 보러 갔는데 {m}이(가) 무섭대요… 아빠가 무사히 돌아오게 해 주세요!']),
      G('나그네', '두건 쓴 여행자', ['…{z}를 지나야 하는데 {m}이(가) 길을 막고 있다. 대가는 넉넉히 치르지.'])] },
  };
  /* 엑시즈 모험가 길드의 큰 게시판: 등급(레벨대)별로 칸이 나뉘어 있고, 칸마다 의뢰가 고르게 붙는다 */
  BOARDS.guild = { title: '모험가 길드 의뢰 게시판', cap: 40, zones: [],
    tiers: [{ id: 'd', name: '초급', lv: [1, 15], zones: ['forest', 'plains', 'swamp', 'ruins'] }, { id: 'c', name: '중급', lv: [16, 59], zones: ['wwest', 'wnorth', 'wsouth', 'weast'] },
      { id: 'b', name: '상급', lv: [60, 100], zones: ['silva', 'arbus', 'kaolis', 'subcus'] }, { id: 'a', name: '특급', lv: [100, 999], zones: MHUNT.filter((z) => ZONE_MON[z]) }],
    givers: [
      G('엑시즈 상인', '상인', ['{z}를 지나는 상단이 {m}에게 번번이 털립니다. 길이 안전해지면 왕도 물가도 내려갈 거예요.', '{z}에서 들여오는 물건이 {m} 때문에 끊겼어요. 가게 선반이 비어 갑니다.']),
      G('길드 접수원', '모험가 길드', ['{z}에 나간 모험가들이 {m} 때문에 돌아오지 못하고 있어요. 수를 줄여 길을 열어 주세요.', '{z}의 {m}에 대한 신고가 길드에 쌓였어요. 처리해 주실 분을 찾습니다.']),
      G('왕성 경비대', '경비대', ['{z}에서 {m}이(가) 왕도 쪽으로 몰려오고 있다. 성벽 밖에서 막아라.', '{z}로 나간 순찰대가 {m}에게 밀려 돌아왔다. 길드의 힘을 빌린다.']),
      G('엑시즈 농부', '농부', ['{z} 가까운 밭이 {m} 때문에 엉망이에요. 가을걷이 전에 쫓아 주세요.']),
      G('마차 조합', '마부', ['{z} 길에서 {m}이(가) 마차를 세웁니다. 노선을 지키려면 길을 쓸어야 해요.']),
      G('왕실 학자', '학자', ['{z}에서 {m}을(를) 조사하려는데 수가 너무 많아 가까이 갈 수 없습니다. 좀 줄여 주시면 사례하지요.']),
      G('항구 조합', '뱃사람', ['{z} 쪽 뱃길 근처에 {m}이(가) 꼬였소. 짐을 내릴 수가 없어.'])] };
  const BOARD_CAP = {}; for (const k in BOARDS) BOARD_CAP[k] = BOARDS[k].cap;
  const boardTierOf = (board, zone) => { const B = BOARDS[board]; if (!B || !B.tiers) return null; for (const t of B.tiers) if (t.zones.includes(zone)) return t.id; return null; };
  function makePoster(board, rnd, id) {
    const B = BOARDS[board]; let zone;
    if (B.tiers) { const t = B.tiers[Math.floor(rnd() * B.tiers.length)]; zone = t.zones[Math.floor(rnd() * t.zones.length)]; } else zone = B.zones[Math.floor(rnd() * B.zones.length)];
    const L = ZONE_LEVELS[zone]; const tys = [...new Set(ZONE_MON[zone])];
    const lv = Math.round(L[0] + rnd() * (L[1] - L[0]));
    // 무거운 의뢰: 한 종류를 많이, 또는 두 종류를 함께
    const two = tys.length > 1 && rnd() < 0.45, rare = rnd() < 0.15;
    const pick = tys.slice().sort(() => rnd() - 0.5).slice(0, two ? 2 : 1);
    const goals = pick.map((ty, k) => ({ ty, need: (two ? 8 : 15) + Math.floor(rnd() * (two ? 7 : 11)) - (k ? 3 : 0), have: 0 }));
    let exp = 0; for (const g of goals) { const L2 = MON[g.ty].fixed ? MON[g.ty].lv : lv; exp += monStats(g.ty, L2).exp * g.need; }
    const tot = goals.reduce((a, g) => a + g.need, 0);
    const gv = B.givers[Math.floor(rnd() * B.givers.length)];
    const why = gv.why[Math.floor(rnd() * gv.why.length)];
    return { id, board, zone, lv, goals, ty: goals[0].ty, exp: Math.round(exp * (rare ? 1.9 : 1.4)), gold: Math.round(lv * tot * (rare ? 20 : 11)), rare: rare ? 1 : 0,
      giver: gv.n, role: gv.r, why, at: Date.now() };
  }
  const api = { boardTierOf, MHUNT, MLINES, THOUSE, inTHouse, isleEdge, R1, C2, R2, ROAD, TOWN_R, INNER, SP, spR, spHW, spPos, spNear, hInside, hOutside, ENTRY, TOWN_BLD, PIT, DUN, BOSS_HOME, LAIR, HALL, EPORTAL, WLAIR, ISLES, ISLE_ORDER, isleAt, HALL_ROOM, CELLAR, inHallAnnex, zoneAt, SAFE, roomClamp, worldClamp, keepOutOfSafe, MON, monStats, ZONE_MON, ZONE_COUNT, levelAt, ZONE_LEVELS, smooth: sm, BOARDS, BOARD_CAP, makePoster };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OR = api;
})(typeof self !== 'undefined' ? self : this);
