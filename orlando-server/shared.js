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
    coachway: { x: 5300, z: 0, R: 400 }, // 왕도: 마차가 달리는 고리 길 (타고 가는 동안만 머문다)
    castle: { x: 6400, z: 0, R: 300 },   // 엑시즈 성: 엑시즈 시내 왕궁 남문으로 들어가면 나온다
    guildhall: { x: 7100, z: 0, R: 140 }, // 길드홀: 엑시즈 시내 길드홀 정문으로 들어가면 나온다 (3층 건물과 뒤뜰)
    exmarket: { x: 7700, z: 0, R: 110 }, // 중앙 시장: 엑시즈 시내 시장 문으로 들어가면 나온다 (좌판·회랑·장비점·마구간)
    arena: { x: 8200, z: 0, R: 70 },     // 투기장: 어느 땅과도 이어지지 않는 둥근 콜로세움. 결투가 시작되면 둘이 옮겨 가고 끝나면 돌아온다
    library: { x: 8600, z: 0, R: 22 },   // 엑시즈 왕립 도서관: 시내 도서관 문으로 들어가면 나온다 (5층 원통 건물 안, R = 바깥벽 안쪽 면)
    hechil: { x: 10200, z: 0, R: 70 },   /* 허칠 산장: 사냥터가 아닌 산장 맵 (남쪽 끝에서 들어와 산장까지). 2026-11-06 원호: 허칠은 사냥터마다 따로 된 맵 */
    hpeak:  { x: 11800, z: 0, R: 120 },   // 허칠 봉우리: 골짜기 갈림길 위 벼랑 틈을 지나면 나오는 따로 된 땅 (땅 좌표는 허칠과 같다: 봉우리 둘레 벼랑 안만 걷는다)
    hcave:  { x: 11000, z: 0, R: 240 },   // 허칠산 동굴: 갈림길 동쪽 벼랑의 굴 입구로 들어간다 (땅 밑 굴은 따로 된 땅)   // 허칠산: 엑시즈 북서쪽 눈 덮인 산. 북문 밖 숲(3A) 바깥 산길 끝에서 넘어온다 (남쪽 가장자리로 들어온다)
    khq: { x: 9100, z: 0, R: 90 },
    /* 허칠 사냥터 맵 (땅 좌표는 허칠 산장·동굴과 같다: 같은 산을 옮겨 그린다). hpeak = 눈 비탈, hcave = 박쥐 굴 */
    hwood: { x: 12600, z: 0, R: 120 }, hlake: { x: 13400, z: 0, R: 120 }, hscree: { x: 14200, z: 0, R: 120 }, hridge: { x: 15000, z: 0, R: 120 }, htop: { x: 15800, z: 0, R: 120 },
    hcrys: { x: 16500, z: 0, R: 240 }, hfall: { x: 17100, z: 0, R: 240 }, hden: { x: 17700, z: 0, R: 240 },       // 기사단 본부: 엑시즈 시내 기사단 본부 정문으로 들어가면 나온다 (2층 회당 건물과 동쪽 훈련 마당)
    // 엑시즈 남문 밖 사냥터 (모래톱, Lv 60–67). 자리는 아래 MLINES에서 정한다
    mfield: { x: 2700, z: 900, R: 150 },
  };
  // 엑시즈 문 밖 사냥터 줄: 숫자=줄, 글자=그 줄의 몇 번째 땅. 땅 생김새(kind)는 들판·구릉·숲·계곡·고개·호숫가·강가와 바닷가(모래톱·갯바위·해안 절벽·곶)
  // 2026-11-03 원호: 엑시즈는 남문·동문 쪽이 바다, 북문·서문 쪽이 숲·들판. 사냥터도 뭍을 따라 말굽 모양으로 놓는다
  //   1 남문(Lv 60, 바닷가에서 시작) → 2 서문 → 3 북문 → 4 동문(Lv 200, 바닷가 절벽에서 끝). 세 번째 칸 'c' = 바다에 닿은 땅(바깥쪽이 바다)
  // 2026-11-05 원호: 문마다 첫 땅 하나씩, 네 곳만 남긴다 (모래톱·들판·숲·고개). 2026-11-06 원호 "사냥터 조금만 추가하자" → 문마다 두 번째 땅을 하나씩 더 (해안 들판·호숫가·강가·해안 절벽).
  //   한 문의 두 땅은 넓은 목으로 이어지고, 다른 문의 땅과는 이어지지 않는다. 자리(k = (줄-1)·5 + 순번)는 말굽 위 예전 그대로라 줄 사이에 빈 산이 있다. 밀골은 마차로만 간다
  const MLINES_ALL = [
    // 2026-11-06 원호: 북문·남문·동문은 나중에 고레벨 땅으로 열 곳이라 지금은 닫아 둔다 (성문을 경비병이 막는다). off를 지우면 다시 켜진다
    { n: 1, off: true, gate: '남문', zones: [['mfield', 'beach', 'c'], ['mhill', 'field', 'c']] },
    // 2026-11-06 원호: 서문 → 숲 가는 길(60–70) → 엑시즈 숲(70–80) → 깊은 숲(80–90) → 추운 계곡(90–100) → 허칠 산장.
    //   sep: 땅마다 따로 된 맵 (목으로 잇지 않고, 땅 끝 문을 지나면 다음 땅으로 넘어간다). ks: 말굽 위 자리(한 칸씩 띄워 산으로 멀리 떨어뜨린다). names: 네 번째 칸이 온 이름. lv: 땅마다 적정레벨
    { n: 2, gate: '서문', sep: true, names: true, ks: [5, 7, 9, 11], lv: [[60, 70], [70, 80], [80, 90], [90, 100]],
      zones: [['m2a', 'trail', 0, '숲 가는 길'], ['m2b', 'wood', 0, '엑시즈 숲'], ['m2c', 'deep', 0, '깊은 숲'], ['m2d', 'cold', 0, '추운 계곡']] },
    { n: 3, off: true, gate: '북문', zones: [['m3a', 'wood'], ['m3b', 'river']] },
    { n: 4, off: true, gate: '동문', zones: [['m4a', 'pass'], ['m4b', 'cliff', 'c']] },
    // 고리 밖으로 뻗은 가지: 4E에서 이어지는 새 지역 (엑시즈로 가는 문은 없다)
    // off: 게임에서 잠시 뺀 줄 (2026-11-03 원호: 몬스터가 예전과 똑같이 생겨서 다시 만들 때까지 뺀다). off를 지우면 다시 켜진다
    { n: 5, off: true, region: '불타는 협곡', branch: [162, 130, 100, 70, 40], zones: [['m5a', 'ash'], ['m5b', 'vale'], ['m5c', 'lava'], ['m5d', 'vale'], ['m5e', 'pass']] },
  ];
  const MLINES = MLINES_ALL.filter((L) => !L.off);
  // 사냥터 땅은 엑시즈를 둘러싼 말굽(고리의 일부) 위에 레벨 순서대로 놓는다: 남(남문, Lv 60)에서 시작해 시계 방향으로 서(서문, 95) → 북(북문, 130) → 동(동문, 165).
  // 말굽이 트인 남동쪽(TH1과 TH0 사이)은 바다다. 고리 안쪽은 엑시즈를 둘러싼 산이고, 문마다 안쪽으로 고갯길이 나 있다
  const MH = { cx: 3600, cz: 2200, RR: 1600, R: 150, neckHW: 60, gateHW: 14, gateLen: 55 };
  MH.DTH = 2 * Math.asin(180 / MH.RR);   // 이웃 땅 사이 각 (가운데 사이 360m)
  MH.TH0 = 102.5 * PI / 180;             // 1A(모래톱) 자리 (남쪽 조금 서쪽)
  MH.TH1 = MH.TH0 + 19 * MH.DTH;         // 말굽 뭍의 동쪽 끝 (동쪽 조금 북쪽). 여기서 TH0까지(남동)가 바다
  MH.SEA = 45 * PI / 180;                // 바다가 트인 쪽 (남동)
  // 가지(branch): 앞 땅에서 정한 방향(도, 지도에서 x 오른쪽 0 · z 아래 90)으로 MH.STEP씩 나아간다. th는 나아가는 방향에서 90도 뺀 값 (고리 땅처럼 th의 접선이 길 방향)
  MH.STEP = 360;
  MLINES.forEach((L) => L.zones.forEach(([id, kind, cst], i) => { const k = L.ks ? L.ks[i] : (L.n - 1) * 5 + i; const I = ISLES[id] || (ISLES[id] = { R: MH.R }); I.R = MH.R; I.kind = kind; I.coast = cst === 'c' ? 1 : 0; I.line = L.n; I.seq = i; I.k = k; I.sep = L.sep ? 1 : 0;
    if (L.branch) { const prev = i ? ISLES[L.zones[i - 1][0]] : ISLES[MLINES[L.n - 2].zones[MLINES[L.n - 2].zones.length - 1][0]], h = L.branch[i] * PI / 180; I.x = prev.x + Math.cos(h) * MH.STEP; I.z = prev.z + Math.sin(h) * MH.STEP; I.th = h - PI / 2; I.branch = 1; }
    else { const th = MH.TH0 + k * MH.DTH; I.x = MH.cx + Math.cos(th) * MH.RR; I.z = MH.cz + Math.sin(th) * MH.RR; I.th = th; } }));
  const MHUNT = MLINES.flatMap((L) => L.zones.map((q) => q[0]));
  const ISLE_ORDER = ['silva', 'arbus', 'kaolis', 'subcus', 'marcus', 'milgol', 'coachway', 'castle', 'guildhall', 'exmarket', 'arena', 'library', 'hechil', 'hcave', 'hpeak', 'khq', 'hwood', 'hlake', 'hscree', 'hridge', 'htop', 'hcrys', 'hfall', 'hden', ...MHUNT];
  // 엑시즈 성벽(섬 중심 기준 m, 시계 방향)과 가장자리: 성벽에서 바깥으로 약 70m까지만 땅이 있다 (들쭉날쭉)
  const MARCUS_WALL_M = [[-303,-218],[-247,-216],[-173,-213],[-112,-240],[-57,-264],[11,-277],[134,-264],[214,-234],[282,-206],[355,-151],[380,-58],[380,28],[368,101],[355,138],[331,194],[282,243],[220,280],[134,292],[42,286],[-63,264],[-161,249],[-260,218],[-333,175],[-370,89],[-376,15],[-361,-46],[-352,-114],[-333,-169]];
  const MARCUS_EDGE_GAP = 70;
  function polyRay(P, a) { const ux = Math.cos(a), uz = Math.sin(a); let best = 0; for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], dx = B[0] - A[0], dz = B[1] - A[1], den = ux * dz - uz * dx; if (Math.abs(den) < 1e-9) continue; const t = (A[0] * dz - A[1] * dx) / den, s = (A[0] * uz - A[1] * ux) / den; if (t > best && s >= 0 && s <= 1) best = t; } return best; }
  for (const k of ISLE_ORDER) { const I = ISLES[k]; I.id = k; I.entry = { x: I.x, z: I.z + I.R - 12 }; }   // 들어오는 자리 (남쪽 가장자리)
  ISLES.marcus.entry = { x: ISLES.marcus.x - 62.7, z: ISLES.marcus.z + 284 };   // 엑시즈: 남쪽은 바다라서 남문 바로 앞 돌둑 길 위
  // ---------- 허칠산 (2026-11-06 다시 짬): 산장 → 갈림길 (Lv 100–110) → 동쪽 동굴 (110–130) / 북쪽 봉우리 (130–150) ----------
  // 봉우리 둘레는 바위 벼랑(RB)이 둘러 막고, 갈림길에서 오르는 산길 자리(GATE)만 열려 있다. 좌표는 땅 가운데 기준
  const HCH = (() => {
    const H = { HUT: { x: -77, z: 240 }, FORK: { x: 34, z: 58 }, TOP: { x: -16, z: -162 }, RB: 140, WT: 3.2, GW: 6.5, MOUTH: { x: 236, z: -10 },
      MAIN: [[0, 328], [4, 305], [-8, 280], [-22, 258], [-12, 232], [12, 205], [40, 180], [62, 152], [68, 120], [56, 92], [34, 58]],
      SPUR: [[-22, 258], [-42, 252], [-58, 246], [-66, 243]],
      PEAK: [[34, 58], [50, 32], [30, 8], [46, -14], [16, -30], [32, -54], [4, -72], [22, -94], [-6, -106], [10, -124], [-14, -131], [2, -141], [-18, -147], [-4, -154], [-16, -162]],
      CAVE: [[34, 58], [66, 50], [98, 40], [130, 28], [162, 16], [192, 6], [216, -4], [236, -10]],
      /* 동굴 (동굴 땅 가운데 기준): [x, z, 반폭, 천장 높이]. 들어오는 굴 입구(남)에서 굽이굽이 북쪽 끝 큰 방까지, 중간에 넓은 방 셋 */
      TUN: [[0, 214, 5, 6], [3, 194, 5.5, 6], [-6, 172, 6, 6.5], [-24, 150, 7, 7], [-36, 124, 22, 13], [-30, 98, 7, 7], [-8, 80, 6, 6.5], [18, 62, 6.5, 7], [40, 38, 7, 7.5], [46, 12, 24, 14], [34, -14, 7, 7], [10, -30, 6, 6], [-18, -42, 6, 6.5], [-44, -58, 7, 7], [-58, -84, 7, 7.5], [-56, -112, 25, 15], [-36, -134, 7, 7], [-6, -146, 6, 6.5], [22, -158, 7, 7], [38, -176, 12, 10], [40, -196, 27, 16], [38, -218, 8, 7], [36, -226, 2, 4]] };
    const pl = (C) => { let s = 0; return C.map((p, i) => { if (i) s += Math.hypot(p[0] - C[i - 1][0], p[1] - C[i - 1][1]); return { x: p[0], z: p[1], w: p[2] || 0, c: p[3] || 0, s }; }); };
    const chk = (C) => { const o = [C[0]]; for (let i = 0; i + 1 < C.length; i++) { const A = C[i], B = C[i + 1]; o.push(A.map((v, k) => v * 0.75 + B[k] * 0.25), A.map((v, k) => v * 0.25 + B[k] * 0.75)); } o.push(C[C.length - 1]); return o; };   /* 꺾인 굴길을 둥글게 */
    H.pl = pl; H.chk = chk; H.T = pl(chk(chk(H.TUN))); H.TL = H.T[H.T.length - 1].s;
    /* 꺾은선에서 가장 가까운 자리 (거리·길이 s·반폭 w·천장 c) */
    H.near = (L, x, z) => { let b = null; for (let i = 0; i + 1 < L.length; i++) { const A = L[i], B = L[i + 1], dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / l2)), px = A.x + dx * t, pz = A.z + dz * t, d = Math.hypot(x - px, z - pz);
      if (!b || d < b.d) b = { d, x: px, z: pz, i, t, s: A.s + (B.s - A.s) * t, w: A.w + (B.w - A.w) * t, c: A.c + (B.c - A.c) * t }; } return b; };
    H.rb = (a) => H.RB + 8 * Math.sin(3 * a + 1.1) + 5 * Math.sin(5 * a + 2.3) + 2.5 * Math.sin(11 * a + 0.4);   /* 벼랑 둘레: 들쭉날쭉 */
    /* 벼랑 틈: 봉우리 산길이 벼랑 둘레를 지나는 자리 */
    { const P = pl(H.PEAK), dT = (q) => Math.hypot(q.x - H.TOP.x, q.z - H.TOP.z) - H.rb(Math.atan2(q.z - H.TOP.z, q.x - H.TOP.x)); for (let i = 0; i + 1 < P.length; i++) { const a = dT(P[i]), b = dT(P[i + 1]); if (a >= 0 && b < 0) { const k = a / (a - b); H.GATE = { x: P[i].x + (P[i + 1].x - P[i].x) * k, z: P[i].z + (P[i + 1].z - P[i].z) * k }; break; } }
      H.aG = Math.atan2(H.GATE.z - H.TOP.z, H.GATE.x - H.TOP.x); }
    /* 골짜기 축: 산장 → 갈림길. vt = 그 축 위 거리 비율 (산장 0, 갈림길 1). 산장 터는 HUTT 앞까지 (사냥터 아님), 숲길·호숫가는 HUTB에서 나뉜다 */
    { const ax = H.FORK.x - H.HUT.x, az = H.FORK.z - H.HUT.z, L = Math.hypot(ax, az); H.AX = { ux: ax / L, uz: az / L, L }; }
    H.HUTT = 0.22; H.HUTB = H.HUTT + (1 - H.HUTT) / 2;
    H.vt = (lx, lz) => ((lx - H.HUT.x) * H.AX.ux + (lz - H.HUT.z) * H.AX.uz) / H.AX.L;
    /* 적정레벨: 봉우리 벼랑 안은 130→150 (꼭대기로 갈수록), 그 밖 골짜기는 산장→갈림길 100→110, 동굴은 굴 길이 따라 110→130 */
    H.lvOut = (lx, lz) => { const d = Math.hypot(lx - H.TOP.x, lz - H.TOP.z), r = H.rb(Math.atan2(lz - H.TOP.z, lx - H.TOP.x)); if (d < r) return Math.round(130 + 20 * Math.pow(Math.max(0, Math.min(1, (r - d) / (r - 14))), 0.75));
      return Math.round(100 + 10 * Math.max(0, Math.min(1, (H.vt(lx, lz) - H.HUTT) / (1 - H.HUTT)))); };
    /* 사냥터 (2026-11-06 원호: 레벨별로 나눠서 여러 곳): 골짜기 둘, 동굴 넷(방마다 하나, 좁은 굴목에서 나뉨), 봉우리 넷(벼랑 안 둘레 띠) */
    H.AREAS = [
      { id: 'wood', name: '산장 숲길', lv: [100, 105] }, { id: 'lake', name: '호숫가 골짜기', lv: [105, 110] },
      { id: 'bat', name: '박쥐 굴', lv: [110, 115], cave: 1, s: [0, 170] }, { id: 'crys', name: '수정 굴', lv: [115, 120], cave: 1, s: [170, 315] },
      { id: 'fall', name: '얼음 폭포 굴', lv: [120, 125], cave: 1, s: [315, 470] }, { id: 'den', name: '곰 굴', lv: [125, 130], cave: 1, s: [470, H.TL - 16] },
      { id: 'slope', name: '눈 비탈', lv: [130, 135] }, { id: 'scree', name: '서리 바위밭', lv: [135, 140] }, { id: 'ridge', name: '바람 능선', lv: [140, 145] }, { id: 'top', name: '꼭대기', lv: [145, 150] }];
    H.areaOfLv = (lv, cave) => { const L = H.AREAS.filter((A) => !!A.cave === !!cave); for (const A of L) if (lv < A.lv[1] || (lv === A.lv[1] && A.id === 'lake')) return A; return L[L.length - 1]; };
    H.caveArea = (s) => { let A = null; for (const B of H.AREAS) if (B.cave) { A = B; if (s < B.s[1]) break; } return A; };
    /* 동굴 적정레벨: 사냥터마다 굴 길이 따라 5씩 */
    H.lvCave = (lx, lz) => { const s = H.near(H.T, lx, lz).s, A = H.caveArea(s); return Math.min(A.lv[1], Math.floor(A.lv[0] + 5 * Math.max(0, Math.min(1, (s - A.s[0]) / (A.s[1] - A.s[0]))))); };
    H.HUTA = { id: 'hut', name: '산장', lv: [0, 0], zone: 'hechil' };
    /* 봉우리 벼랑 안 레벨 (반올림 없이): 벼랑 밖이면 -1 */
    H.pkLv = (lx, lz) => { const d = Math.hypot(lx - H.TOP.x, lz - H.TOP.z), r = H.rb(Math.atan2(lz - H.TOP.z, lx - H.TOP.x)); return d < r ? 130 + 20 * Math.pow(Math.max(0, Math.min(1, (r - d) / (r - 14))), 0.75) : -1; };
    H.areaAt = (lx, lz, cave) => { if (cave) return H.caveArea(H.near(H.T, lx, lz).s); const k = H.pkLv(lx, lz), A = H.AREAS;
      if (k >= 0) return k < 135 ? A[6] : k < 140 ? A[7] : k < 145 ? A[8] : A[9]; const t = H.vt(lx, lz); return t < H.HUTT ? H.HUTA : t < H.HUTB ? A[0] : A[1]; };
    /* 봉우리 띠 경계: 벼랑 안에서 적정레벨 lv가 되는 꼭대기까지 거리 (각도 a) */
    H.ringR = (a, lv) => { const r = H.rb(a); return r - Math.pow((lv - 130) / 20, 1 / 0.75) * (r - 14); };
    /* 봉우리 벼랑: 틈이 아니면 벽 두께 안에 들어온 것을 가까운 쪽으로 밀어낸다 */
    H.wall = (p, rad, I) => { const dx = p.x - I.x - H.TOP.x, dz = p.z - I.z - H.TOP.z, d = Math.hypot(dx, dz) || 1, w = H.WT + rad, a = Math.atan2(dz, dx), r0 = H.rb(a); if (Math.abs(d - r0) >= w) return;
      let da = a - H.aG; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) * r0 < H.GW - rad) return;
      const r = d < r0 ? r0 - w : r0 + w; p.x = I.x + H.TOP.x + dx / d * r; p.z = I.z + H.TOP.z + dz / d * r; };
    return H; })();
  /* ---------- 허칠 맵 (2026-11-07 원호: "허칠 맵 하나하나가 나눠져 있었으면, 맵이 너무 커") ----------
     산장과 사냥터 10곳이 저마다 따로 떨어진 작은 맵이다 (도서관·길드홀처럼). 바깥 맵 일곱(산장·숲길·호숫가·눈 비탈·바위밭·능선·꼭대기)은
     저마다 제 땅: 남쪽(+z)에서 들어와 북쪽(-z)으로 이어지는 걷는 길 사슬(HCH.OM, [x, z, 반폭]) 둘레를 벼랑·숲(능선·꼭대기는 낭떠러지)이 막는다.
     굴 넷은 한 굴(HCH.T)을 굴목마다 막아 나눈 방이다. 이웃 맵으로는 길 끝 문(HCH.GATES)으로만 넘어간다 */
  {
    const H = HCH, A = H.AREAS, ZA = { hwood: 'wood', hlake: 'lake', hcave: 'bat', hcrys: 'crys', hfall: 'fall', hden: 'den', hpeak: 'slope', hscree: 'scree', hridge: 'ridge', htop: 'top' };
    for (const z in ZA) A.find((q) => q.id === ZA[z]).zone = z;
    H.HZ = Object.keys(ZA);   // 사냥터 맵
    H.ZONES = ['hechil', ...H.HZ];
    H.areaOf = (z) => z === 'hechil' ? H.HUTA : A.find((q) => q.zone === z) || null;
    H.fam = (z) => { const Q = H.areaOf(z); return !Q ? null : Q.cave ? 'cave' : 'out'; };   // 'out' = 바깥 맵, 'cave' = 굴
    /* 굴길 위 자리 (길이 s): 가운데·반폭·방향 */
    H.sAt = (s) => { const T = H.T; s = Math.max(0, Math.min(H.TL, s)); let i = 0; while (i < T.length - 2 && T[i + 1].s < s) i++; const P = T[i], Q = T[i + 1], L = (Q.s - P.s) || 1, k = (s - P.s) / L;
      return { x: P.x + (Q.x - P.x) * k, z: P.z + (Q.z - P.z) * k, w: P.w + (Q.w - P.w) * k, ux: (Q.x - P.x) / L, uz: (Q.z - P.z) / L }; };
    /* 바깥 맵: 걷는 길 사슬 (맵 가운데 기준). up = 둘레가 솟은 벼랑·숲, 아니면 낭떠러지. rise = 들어온 곳에서 나가는 곳까지 오르는 높이 */
    H.OM = {
      hechil: { up: 1, rise: 6, L: [[[0, 70, 8], [1, 56, 10], [-2, 40, 16], [-8, 20, 24], [-4, 0, 26], [2, -18, 22], [4, -34, 13], [0, -50, 8], [0, -58, 7]]], hut: { x: -20, z: 6, ry: Math.PI / 2, r: 13 } },
      hwood: { up: 1, rise: 10, L: [[[0, 90, 8], [0, 78, 15], [-12, 58, 22], [-6, 34, 26], [10, 10, 26], [8, -14, 26], [-8, -38, 24], [-4, -62, 16], [0, -78, 10], [0, -90, 8]]] },
      hlake: { up: 1, rise: 8, L: [[[0, 85, 8], [0, 72, 16], [8, 48, 30], [0, 16, 40], [-8, -16, 40], [0, -46, 26], [0, -70, 12], [0, -84, 8]], [[20, 6, 10], [38, 2, 9], [54, -1, 8], [66, -2, 7]]], lake: { x: -6, z: 2, r: 20 } },
      hpeak: { up: 1, rise: 46, L: [[[0, 85, 8], [0, 72, 14], [-22, 56, 18], [18, 36, 18], [-20, 14, 18], [18, -8, 18], [-16, -30, 18], [0, -52, 14], [0, -70, 10], [0, -82, 8]]] },
      hscree: { up: 1, rise: 22, L: [[[0, 80, 8], [0, 68, 15], [-12, 44, 30], [8, 14, 34], [-6, -18, 32], [4, -46, 22], [0, -66, 12], [0, -80, 8]]] },
      hridge: { up: 0, rise: 24, L: [[[0, 90, 8], [0, 78, 11], [-8, 54, 12], [6, 28, 13], [-6, 2, 12], [8, -24, 13], [-2, -50, 12], [0, -72, 10], [0, -88, 8]]] },
      htop: { up: 0, rise: 8, L: [[[0, 50, 8], [0, 40, 13], [0, 22, 26], [0, 0, 30], [0, -18, 24], [0, -28, 14]]], cairn: { x: 0, z: -10 } },
    };
    for (const z in H.OM) { const M = H.OM[z]; M.id = z; M.C = M.L.map((c) => H.pl(H.chk(H.chk(c)))); const C0 = M.C[0]; M.len = C0[C0.length - 1].s; M.z0 = C0[0].z; M.z1 = C0[C0.length - 1].z; }
    /* 사슬 위 자리 (길이 s): 가운데·반폭·나아가는 방향 */
    H.cAt = (C, s) => { s = Math.max(0, Math.min(C[C.length - 1].s, s)); let i = 0; while (i < C.length - 2 && C[i + 1].s < s) i++; const P = C[i], Q = C[i + 1], L = (Q.s - P.s) || 1, k = (s - P.s) / L;
      return { x: P.x + (Q.x - P.x) * k, z: P.z + (Q.z - P.z) * k, w: P.w + (Q.w - P.w) * k, ux: (Q.x - P.x) / L, uz: (Q.z - P.z) / L }; };
    /* 가장 가까운 길 (어느 사슬이든) */
    H.omNear = (M, lx, lz) => { let b = null; M.C.forEach((C, k) => { const q = H.near(C, lx, lz); if (!b || q.d - q.w < b.d - b.w) { b = q; b.k = k; } }); return b; };
    H.omT = (M, lx, lz) => Math.max(0, Math.min(1, (M.z0 - lz) / (M.z0 - M.z1)));   // 들어온 곳 0 → 나가는 곳 1
    /* 문: 맵 a ↔ 맵 b. 쪽마다(A·B) 그 맵 안의 문 자리 p와 바깥(이웃 맵 쪽)을 향한 n, 반폭 hw. 걸어 나가다 p를 지나면 이웃 맵의 문 안쪽 3m에 선다 */
    H.GATES = [];
    const side = (z, C, end) => { const L = C[C.length - 1].s, s = end ? L - 3 : 3, p = H.cAt(C, s), sg = end ? 1 : -1; return { x: p.x, z: p.z, nx: p.ux * sg, nz: p.uz * sg, hw: Math.max(3, p.w - 0.6) }; };
    const link = (a, b, A2, B2, k) => H.GATES.push({ a, b, A: A2, B: B2, k });
    const chain = ['hechil', 'hwood', 'hlake', 'hpeak', 'hscree', 'hridge', 'htop'];
    for (let i = 0; i + 1 < chain.length; i++) { const a = chain[i], b = chain[i + 1]; link(a, b, side(a, H.OM[a].C[0], 1), side(b, H.OM[b].C[0], 0), 'out'); }
    /* 호숫가 동쪽 갈래 끝 = 굴 입구 ↔ 박쥐 굴 입구 */
    { const T = H.T, u = H.sAt(0), p = { x: T[0].x - u.ux * 2, z: T[0].z - u.uz * 2, nx: -u.ux, nz: -u.uz, hw: T[0].w, noModel: 1 }; link('hlake', 'hcave', side('hlake', H.OM.hlake.C[1], 1), p, 'mouth'); }
    /* 굴목: 굴 넷은 같은 굴을 나눈 방 (땅 좌표가 같다) */
    for (const [a, b] of [['hcave', 'hcrys'], ['hcrys', 'hfall'], ['hfall', 'hden']]) { const s = H.areaOf(b).s[0], p = H.sAt(s), w = p.w;
      link(a, b, { x: p.x - p.ux * 1.2, z: p.z - p.uz * 1.2, nx: p.ux, nz: p.uz, hw: w }, { x: p.x + p.ux * 1.2, z: p.z + p.uz * 1.2, nx: -p.ux, nz: -p.uz, hw: w }, 'cave'); H.GATES[H.GATES.length - 1].s = s; H.GATES[H.GATES.length - 1].c = p; }
    H.arrive = (S) => ({ x: S.x - S.nx * 3, z: S.z - S.nz * 3 });   // 그 쪽 문으로 들어와 서는 자리
    const E = 0.3;
    /* 굴 맵: 굴 벽 안, 제 굴목 사이만 */
    const tunnel = (p, rad, I, s0, s1) => { let q = H.near(H.T, p.x - I.x, p.z - I.z);
      if ((s0 > 0 && q.s < s0 - E) || (s1 != null && q.s > s1 + E)) { const P = H.sAt(q.s < s0 ? s0 - E : s1 + E), lx = p.x - I.x - P.x, lz = p.z - I.z - P.z, m = Math.max(0.3, P.w - rad - 0.4), u = Math.max(-m, Math.min(m, -lx * P.uz + lz * P.ux)); p.x = I.x + P.x - P.uz * u; p.z = I.z + P.z + P.ux * u; q = H.near(H.T, p.x - I.x, p.z - I.z); }
      const m = Math.max(0.3, q.w - rad - 0.4); if (q.d > m) { p.x = I.x + q.x + (p.x - I.x - q.x) * m / q.d; p.z = I.z + q.z + (p.z - I.z - q.z) * m / q.d; } };
    for (const z of H.ZONES) { const I = ISLES[z], Q = H.areaOf(z), cave = !!Q.cave, M = H.OM[z], L = (q) => ({ x: I.x + q.x, z: I.z + q.z });
      I.harea = Q; if (M) I.hmap = M;
      if (M) I.clamp = (p, rad) => { const q = H.omNear(M, p.x - I.x, p.z - I.z), m = Math.max(0.3, q.w - rad - 0.3); if (q.d > m) { p.x = I.x + q.x + (p.x - I.x - q.x) * m / q.d; p.z = I.z + q.z + (p.z - I.z - q.z) * m / q.d; } return true; };
      else I.clamp = (p, rad) => { tunnel(p, rad, I, Q.s[0], z === 'hden' ? null : Q.s[1]); return true; };
      const sides = []; for (const g of H.GATES) { if (g.a === z) sides.push(g.A); if (g.b === z) sides.push(g.B); }
      for (const g of H.GATES) { if (g.b === z) I.entry = L(H.arrive(g.B)); else if (g.a === z && !I.exit) I.exit = L(H.arrive(g.A)); }
      if (z === 'hechil') continue;   // 산장: 사냥터가 아니다 (몬스터·적정레벨 없음). 들어오는 자리는 남쪽 끝 (I.entry 기본값)
      I.noSpawn = sides.map((S) => ({ x: S.x, z: S.z, r: 14 }));
      if (M) { const lv0 = Q.lv[0], lv1 = Q.lv[1], C0 = M.C[0];
        I.lvAt = (x, z2) => Math.round(lv0 + (lv1 - lv0) * H.omT(M, x - I.x, z2 - I.z));
        I.areaLv = () => Q.lv;
        I.randPt = (rnd) => { const P = H.cAt(C0, rnd(12, M.len - 12)), u = rnd(-1, 1) * Math.max(0, P.w - 3); return { x: I.x + P.x - P.uz * u, z: I.z + P.z + P.ux * u }; }; }
      else { I.lvAt = (x, z2) => Math.max(Q.lv[0], Math.min(Q.lv[1], H.lvCave(x - I.x, z2 - I.z)));
        I.areaLv = (x, z2) => H.areaAt(x - I.x, z2 - I.z, 1).lv;
        I.randPt = (rnd) => { const s = rnd(Math.max(30, Q.s[0] + 8), Q.s[1] - 8), P = H.sAt(s), u = rnd(-1, 1) * Math.max(0, P.w - 2.2); return { x: I.x + P.x - P.uz * u, z: I.z + P.z + P.ux * u }; }; } }
    /* 맵 사이로 옮기기 (굴 방끼리는 땅 좌표가 같다) */
    H.shift = (x, z, from, to) => ({ x: x - ISLES[from].x + ISLES[to].x, z: z - ISLES[from].z + ISLES[to].z });
    H.zoneAtLocal = (fam, lx, lz) => fam === 'cave' ? H.areaAt(lx, lz, 1).zone : null;
    /* 예전 저장 자리 고치기 (맵을 작게 다시 짓기 전 자리): 바깥 맵에서 길 밖이면 그 맵 들어오는 자리로, 굴은 그 자리 방으로. 고칠 게 없으면 null */
    H.fixSave = (x, z) => { const I = isleAt(x, z), f = I && H.fam(I.id); if (!f) return null;
      if (f === 'cave') { const zz = H.zoneAtLocal('cave', x - I.x, z - I.z); return zz && zz !== I.id ? H.shift(x, z, I.id, zz) : null; }
      const q = H.omNear(I.hmap, x - I.x, z - I.z); return q.d > q.w + 1 ? { x: I.entry.x, z: I.entry.z } : null; };
  }
  function HCHL() { return HCH.TL; }
  // 고리 위의 자리 (각도 th, 중심에서 거리 r)
  const ringP = (th, r) => ({ x: MH.cx + Math.cos(th) * r, z: MH.cz + Math.sin(th) * r });
  for (const k of MHUNT) { const I = ISLES[k], dt = (I.R - 14) / MH.RR; I.entry = ringP(I.th - dt, MH.RR); I.exit = ringP(I.th + dt, MH.RR);
    if (I.branch) { const j = MHUNT.indexOf(k), A = ISLES[MHUNT[j - 1]], B = ISLES[MHUNT[j + 1]], tw = (Q, s) => { const d = Math.hypot(Q.x - I.x, Q.z - I.z); return { x: I.x + (Q.x - I.x) / d * s, z: I.z + (Q.z - I.z) / d * s }; };
      I.entry = tw(A, I.R - 14); I.exit = B ? tw(B, I.R - 14) : { x: I.x - Math.sin(I.th) * (I.R - 14), z: I.z + Math.cos(I.th) * (I.R - 14) }; } }   // 사냥터: 레벨이 낮은 쪽(고리 반시계)에서 들어와 높은 쪽(시계)으로 나간다
  // 걸어 다닐 수 있는 사냥터 모양: 둥근 땅들 + 이웃 땅을 잇는 넓은 목(neck) + 문마다 엑시즈 쪽(안쪽)으로 난 고갯길(gate), 밀골로 가는 바깥 고갯길
  MH.links = [];
  for (let i = 0; i + 1 < MHUNT.length; i++) { const A = ISLES[MHUNT[i]], B = ISLES[MHUNT[i + 1]]; if ((A.line !== B.line && !B.branch) || A.sep || B.sep) continue;   // 다른 문의 땅끼리는 잇지 않는다. 따로 된 맵(sep)도 목 없이 땅 끝 문으로만 넘어간다
    MH.links.push({ a: A.id, b: B.id, ax: A.x, az: A.z, bx: B.x, bz: B.z, hw: MH.neckHW, k: 'neck' }); }
  // gate: 고갯길 끝의 문(엑시즈·밀골로 넘어가는 자리)과 넘어왔을 때 서는 자리(arr), 바라보는 방향(ux, uz)
  for (const L of MLINES) { if (!L.gate) continue; const F = ISLES[L.zones[0][0]], e = ringP(F.th, MH.RR - F.R - MH.gateLen); F.gate = { ...ringP(F.th, MH.RR - F.R - MH.gateLen + 6), arr: ringP(F.th, MH.RR - F.R - MH.gateLen + 14), ux: Math.cos(F.th), uz: Math.sin(F.th) }; MH.links.push({ a: F.id, b: null, ax: F.x, az: F.z, bx: e.x, bz: e.z, hw: MH.gateHW, k: 'gate' });
    if (L.end === 'milgol') { const E = ISLES[L.zones[L.zones.length - 1][0]], o = ringP(E.th, MH.RR + E.R + MH.gateLen); E.mgate = { ...ringP(E.th, MH.RR + E.R + MH.gateLen - 6), arr: ringP(E.th, MH.RR + E.R + MH.gateLen - 14), ux: -Math.cos(E.th), uz: -Math.sin(E.th) }; MH.links.push({ a: E.id, b: null, ax: E.x, az: E.z, bx: o.x, bz: o.z, hw: MH.gateHW, k: 'gate' }); } }
  // 지도에 밀골을 그릴 자리: 예전 남문 줄 끝(1E) 바깥 고갯길 문 자리 (지금은 걸어서 가는 길이 없다)
  { const th = MH.TH0 + 4 * MH.DTH; MH.milgolMark = { ...ringP(th, MH.RR + MH.R + MH.gateLen - 6), ux: -Math.cos(th), uz: -Math.sin(th) }; }
  // 사냥터 땅 바깥쪽으로 난 산길: 끝의 문을 넘으면 따로 떨어진 땅으로 간다 (허칠산: 북문 밖 숲 3A의 바깥 = 엑시즈 북서쪽)
  MH.trails = [{ from: 'm2d', to: 'hechil' }].filter((T) => MHUNT.includes(T.from) && ISLES[T.to]);
  for (const T of MH.trails) { const F = ISLES[T.from], o = ringP(F.th, MH.RR + F.R + MH.gateLen); F.tgate = { ...ringP(F.th, MH.RR + F.R + MH.gateLen - 6), arr: ringP(F.th, MH.RR + F.R + MH.gateLen - 14), ux: -Math.cos(F.th), uz: -Math.sin(F.th), to: T.to }; MH.links.push({ a: F.id, b: null, ax: F.x, az: F.z, bx: o.x, bz: o.z, hw: MH.gateHW, k: 'gate', trail: T.to }); }
  // 따로 된 맵(sep) 줄: 땅마다 고리 방향 앞뒤 끝에 짧은 길과 문. 앞 땅의 '다음 문'(ngate)을 넘으면 다음 땅의 '앞 문'(pgate) 안쪽(arr)에 선다.
  //   들어오는 자리(entry)는 들어온 문 안쪽, 나가는 자리(exit)는 다음 문 (허칠로 가는 마지막 땅은 바깥 산길 문)
  for (const L of MLINES) { if (!L.sep) continue; const Z = L.zones.map((q) => ISLES[q[0]]);
    Z.forEach((I, i) => { const tx = -Math.sin(I.th), tz = Math.cos(I.th), door = (sg) => { const at = (d) => ({ x: I.x + tx * sg * d, z: I.z + tz * sg * d }), e = at(I.R + MH.gateLen); MH.links.push({ a: I.id, b: null, ax: I.x, az: I.z, bx: e.x, bz: e.z, hw: MH.gateHW, k: 'gate', sep: 1 }); return { ...at(I.R + MH.gateLen - 6), arr: at(I.R + MH.gateLen - 14), ux: -tx * sg, uz: -tz * sg }; };
      if (i) { I.pgate = door(-1); I.pgate.to = Z[i - 1].id; I.entry = { x: I.pgate.arr.x, z: I.pgate.arr.z }; }
      else if (I.gate) I.entry = { x: I.gate.arr.x, z: I.gate.arr.z };
      if (i + 1 < Z.length) { I.ngate = door(1); I.ngate.to = Z[i + 1].id; I.exit = { x: I.ngate.x, z: I.ngate.z }; }
      else if (I.tgate) I.exit = { x: I.tgate.x, z: I.tgate.z }; }); }
  const segQ = (L, x, z) => { const dx = L.bx - L.ax, dz = L.bz - L.az, t = clampN(((x - L.ax) * dx + (z - L.az) * dz) / (dx * dx + dz * dz), 0, 1), qx = L.ax + dx * t, qz = L.az + dz * t; return { x: qx, z: qz, t, d: Math.hypot(x - qx, z - qz) }; };
  // 걸을 수 있는 곳 경계까지의 거리 (안쪽은 음수)
  // (빠르게: 가장 가까울 수 없는 땅은 Math.hypot 없이 건너뛴다. hypot(a,b) >= max(|a|,|b|) 이라 결과는 똑같다. 목 거리는 segQ와 같은 계산을 객체 없이)
  function mhWalkD(x, z) { let e = 1e9;
    for (const k of MHUNT) { const I = ISLES[k], ax = Math.abs(x - I.x), az = Math.abs(z - I.z); if ((ax > az ? ax : az) - I.R >= e) continue; const d = Math.hypot(x - I.x, z - I.z) - I.R; if (d < e) e = d; }
    for (const L of MH.links) { const dx = L.bx - L.ax, dz = L.bz - L.az, t = clampN(((x - L.ax) * dx + (z - L.az) * dz) / (dx * dx + dz * dz), 0, 1), d = Math.hypot(x - (L.ax + dx * t), z - (L.az + dz * t)) - L.hw; if (d < e) e = d; }
    return e; }
  function mhClamp(p, rad) {
    if (mhWalkD(p.x, p.z) <= -rad) return;
    let bx = p.x, bz = p.z, bd = 1e9;
    const tryQ = (qx, qz) => { if (mhWalkD(qx, qz) > -rad + 0.02) return; const d = Math.hypot(qx - p.x, qz - p.z); if (d < bd) { bd = d; bx = qx; bz = qz; } };
    for (const k of MHUNT) { const I = ISLES[k]; const d = Math.hypot(p.x - I.x, p.z - I.z); if (d > I.R + 200) continue; const r = I.R - rad - 0.05, kk = r / Math.max(d, 1e-4); tryQ(I.x + (p.x - I.x) * kk, I.z + (p.z - I.z) * kk); }
    for (const L of MH.links) { const q = segQ(L, p.x, p.z); if (q.d > L.hw + 200) continue; const r = L.hw - rad - 0.05, kk = r / Math.max(q.d, 1e-4); tryQ(q.x + (p.x - q.x) * kk, q.z + (p.z - q.z) * kk); }
    if (bd < 1e9) { p.x = bx; p.z = bz; } }
  MH.walkD = mhWalkD; MH.clamp = mhClamp; MH.segQ = segQ; MH.ringP = ringP;
  // 섬 가장자리 반지름 (엑시즈는 둥글지 않게 들쭉날쭉: 언덕 너머로 이어지는 땅처럼 보이게)
  function isleEdge(I, a) { if (I.id !== 'marcus') return I.R; return polyRay(MARCUS_WALL_M, a) + MARCUS_EDGE_GAP + 6 * Math.sin(3 * a + 1.3) + 4 * Math.sin(7 * a + 0.4) + 2 * Math.sin(13 * a + 2.1); }
  function isleAt(x, z) { let b = null, bd = 1e9; for (const k of ISLE_ORDER) { const I = ISLES[k], ax = Math.abs(x - I.x), az = Math.abs(z - I.z); if ((ax > az ? ax : az) - I.R >= bd) continue; const d = Math.hypot(x - I.x, z - I.z) - I.R; if (d < bd) { bd = d; b = I; } } return b; }   // 위와 같이 먼 땅은 건너뛴다
  // 지하실 위층의 작은 방 (계단을 올라가면 나온다)
  const HALL_ROOM = { x: 0, z0: -500 - 24 - 8.3 - 10, z1: -500 - 24 - 8.3, hw: 4.5, y: 4.5, corHw: 1.8, stHw: 1.5, stLen: 16, stRise: 9, stLand: 3.4 };
  // 계단 꼭대기 너머: 길드홀 지하 창고 (북쪽 벽의 짧은 계단 위 문으로 길드홀 1층에 오른다)
  const CELLAR = (() => { const H = HALL_ROOM, zS = H.z0 - H.stLen - H.stLand; return { x: H.x, z1: zS, z0: zS - 14, hw: 7, y: H.y + H.stRise, up: 2.0, stL: 4.4, land: 1.8 }; })();   // st*: 방 안쪽(북쪽) 벽에서 위로 오르는 계단           // 포탈을 처음 타면 가는 와이번의 둥지 (잡으면 다음부터는 바로 지하실)                 // 동쪽 황야 끝 포탈

  // 튀르팽의 집: 하레나 성안 흙집 안 (작은 방 하나, 문으로 드나든다)
  const THOUSE = { x: -200, z: -800, hw: 5.5, hd: 4.5, rh: 3.8 };
  const inTHouse = (x, z) => Math.abs(x - THOUSE.x) < THOUSE.hw + 6 && Math.abs(z - THOUSE.z) < THOUSE.hd + 6;
  // 내 집: 엑시즈 시내에서 배정받은 집의 안 (집마다 문은 다르지만 안은 이 방 하나를 함께 쓴다, 다른 사람은 안 보인다)
  const MYHOME = { x: -200, z: -840, hw: 5.5, hd: 4.5, rh: 3.8 };
  const inMyHome = (x, z) => Math.abs(x - MYHOME.x) < MYHOME.hw + 6 && Math.abs(z - MYHOME.z) < MYHOME.hd + 6;
  // 가늘롱 저택: 엑시즈 귀족 구역에 선 귀족 가늘롱의 집 안 (2층: 1층 바닥 y 0, 2층 바닥 y 4.6, 천장 8.8. 가운데 두 층 높이 현관홀, 양옆 방들)
  const GHOUSE = { x: -240, z: -800, hw: 10, hd: 7.5, f1: 4.6, rh: 8.8 };
  const inGHouse = (x, z) => Math.abs(x - GHOUSE.x) < GHOUSE.hw + 6 && Math.abs(z - GHOUSE.z) < GHOUSE.hd + 6;
  // 제빵소: 엑시즈 서문 대로(여관가와 주거 지구 사이)에 선 바르톨 제빵소의 안 (왼쪽은 손님 자리, 오른쪽은 계산대 뒤 화덕과 반죽대. 앞이 +z)
  const BAKERY = { x: -285, z: -800, hw: 6.5, hd: 5, rh: 4.3 };
  const inBakery = (x, z) => Math.abs(x - BAKERY.x) < BAKERY.hw + 6 && Math.abs(z - BAKERY.z) < BAKERY.hd + 6;
  // 마법 상점: 엑시즈 중앙 시장 북쪽 담에 붙은 작은 가게 안 (편의점만 한 방 하나)
  const MSHOP = { x: -300, z: -760, hw: 5, hd: 3.6, rh: 3.6 };
  const inMShop = (x, z) => Math.abs(x - MSHOP.x) < MSHOP.hw + 6 && Math.abs(z - MSHOP.z) < MSHOP.hd + 6;
  function zoneAt(x, z) {
    if (inTHouse(x, z)) return 'thouse';
    if (inMyHome(x, z)) return 'myhome';
    if (inGHouse(x, z)) return 'ghouse';
    if (inBakery(x, z)) return 'bakery';
    if (inMShop(x, z)) return 'mshop';
    if (x >= 800) return isleAt(x, z).id;
    if (z > 300) return 'dungeon';
    if (z < -300) return x > 100 ? 'wlair' : 'hall';
    // 하레나와 둘레 길 (옛 첫 지역은 없앴다: 하레나에서 시작해 60레벨까지 키운다)
    if (Math.hypot(x - C2.x, z - C2.z) < TOWN_R) return 'town';
    const n = spNear(x, z); const i = n ? clampN(Math.floor(n.t / SP.Q), 0, 7) : 0;
    return SP.ZONES[i];
  }
  const SAFE = { village: 1, town: 1, hall: 1, thouse: 1, myhome: 1, ghouse: 1, bakery: 1, mshop: 1, marcus: 1, milgol: 1, coachway: 1, castle: 1, guildhall: 1, exmarket: 1, arena: 1, library: 1, khq: 1, hechil: 1 };

  // 걸어 다닐 수 있는 곳 안으로 붙잡는다 (첫 지역 원, 길, 두 번째 지역 원, 석굴)
  function roomClamp(p, rad) {
    const R = DUN.R - rad, d = Math.hypot(p.x - DUN.x, p.z - DUN.z);
    const x0 = DUN.x - DUN.corW + rad, x1 = DUN.x + DUN.corW - rad, z0 = DUN.corZ0 + 0.6 + rad, z1 = DUN.corZ1 + 2;
    if (d <= R || (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) return;
    const k = R / Math.max(d, 1e-4), ax = DUN.x + (p.x - DUN.x) * k, az = DUN.z + (p.z - DUN.z) * k;
    const bx = clampN(p.x, x0, x1), bz = clampN(p.z, z0, z1);
    if (Math.hypot(p.x - ax, p.z - az) <= Math.hypot(p.x - bx, p.z - bz)) { p.x = ax; p.z = az; } else { p.x = bx; p.z = bz; }
  }
  const inHallAnnex = (p, rad) => { const H = HALL_ROOM; if (Math.abs(p.x - H.x) < H.hw - rad && p.z > H.z0 + rad && p.z < H.z1 - rad) return true;   // 남쪽 벽(z1~z1+1) 안으로는 못 들어간다 (가운데 통로로만)
    if (Math.abs(p.x - H.x) < H.stHw - rad && p.z > H.z0 - H.stLen - H.stLand - 1 && p.z <= H.z0 + rad + 0.01) return true;
    { const C = CELLAR; if (Math.abs(p.x - C.x) < C.hw - rad && p.z > C.z0 + rad && p.z <= C.z1 - rad) return true; } return Math.abs(p.x - H.x) < H.corHw - rad && p.z > H.z1 - 1 && p.z < HALL.z - HALL.R + 2; };   // 벽에 바짝 붙어도 눈(카메라)이 벽 속으로 들어가지 않게 몸 반지름만큼 띄운다
  function worldClamp(p, rad) {
    if (inTHouse(p.x, p.z)) { const T = THOUSE; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (inGHouse(p.x, p.z)) { const T = GHOUSE; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (inBakery(p.x, p.z)) { const T = BAKERY; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (inMShop(p.x, p.z)) { const T = MSHOP; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (inMyHome(p.x, p.z)) { const T = MYHOME; p.x = clampN(p.x, T.x - T.hw + rad, T.x + T.hw - rad); p.z = clampN(p.z, T.z - T.hd + rad, T.z + T.hd - rad); return; }
    if (p.x >= 800) { const I = isleAt(p.x, p.z); if (I.line) return mhClamp(p, rad); if (I.clamp && I.clamp(p, rad)) return; const d = Math.hypot(p.x - I.x, p.z - I.z), r = isleEdge(I, Math.atan2(p.z - I.z, p.x - I.x)) - rad; if (d > r) { p.x = I.x + (p.x - I.x) * r / d; p.z = I.z + (p.z - I.z) * r / d; } return; }
    if (p.z > 300) return roomClamp(p, rad);
    if (p.z < -300 && p.x <= 100 && inHallAnnex(p, rad)) return;
    /* 지하실 딸린 방·계단·창고 밖으로 나갔으면 (벽을 뚫었으면) 가장 가까운 안쪽 자리로 되민다 — 둥근 방 가장자리로 튕겨 보내지 않는다 */
    if (p.z < -300 && p.x <= 100 && p.z < HALL.z - HALL.R + 2 && Math.hypot(p.x - HALL.x, p.z - HALL.z) > HALL.R - rad) { const H = HALL_ROOM, C = CELLAR, zS = H.z0 - H.stLen - H.stLand;
      const R = [[H.x - H.hw + rad, H.x + H.hw - rad, H.z0 + rad, H.z1 - rad], [H.x - H.stHw + rad, H.x + H.stHw - rad, zS - 1, H.z0 + rad], [C.x - C.hw + rad, C.x + C.hw - rad, C.z0 + rad, C.z1 - rad], [H.x - H.corHw + rad, H.x + H.corHw - rad, H.z1 - 1, HALL.z - HALL.R + 2]];
      let bx = p.x, bz = p.z, bd = 1e9; for (const [x0, x1, z0, z1] of R) { const qx = clampN(p.x, x0, x1), qz = clampN(p.z, z0, z1), d = Math.hypot(qx - p.x, qz - p.z); if (d < bd) { bd = d; bx = qx; bz = qz; } }
      p.x = bx; p.z = bz; return; }
    if (p.z < -300) { const A = p.x > 100 ? { x: WLAIR.x, z: WLAIR.z, R: WLAIR.r } : HALL; const d = Math.hypot(p.x - A.x, p.z - A.z), r = A.R - rad - (A === HALL ? 0.45 : 0);   /* 지하실 둥근 벽은 여러 조각이라 안쪽 면이 원보다 조금 안에 있다 */ if (d > r) { p.x = A.x + (p.x - A.x) * r / d; p.z = A.z + (p.z - A.z) * r / d; } return; }
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
    slime:    { name: '슬라임', lv: 1, hpM: 0.8, atkM: 0.8, build: 'slime', color: 0x7fd067 },
    wolf:     { name: '회색 늑대', lv: 3, hpM: 0.9, atkM: 1.05, build: 'quad', color: 0x8d8f92 },
    boar:     { name: '사막멧돼지', lv: 4, hpM: 1.15, atkM: 1, build: 'quad', color: 0x6e4b31, tusk: true },
    goblin:   { name: '사막고블린', lv: 6, hpM: 0.95, atkM: 1.1, build: 'biped', color: 0x6f9440, scale: 0.8, ears: true },
    toad:     { name: '독두꺼비', lv: 8, hpM: 1.25, atkM: 0.95, build: 'slime', color: 0x6a7a2c, toad: true, scale: 1.2 },
    lizard:   { name: '모래도마뱀', lv: 10, hpM: 1.1, atkM: 1.05, build: 'biped', color: 0x3f7d60, tail: true },
    skeleton: { name: '사막방울뱀', lv: 12, hpM: 0.95, atkM: 1.15, build: 'snake', color: 0xc4a46e, scale: 1.6 },
    ogre:     { name: '낙타', lv: 15, hpM: 1.5, atkM: 1.05, build: 'biped', color: 0xc8a068, scale: 1.15 },
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
    // 엑시즈 남문 밖 사냥터 (Lv 60–95)
    fieldwolf:{ name: '들늑대', lv: 60, build: 'quad', color: 0x8a6e4e, hpM: 1.1, atkM: 1.25, scale: 1.2 },
    mudslime: { name: '진흙 슬라임', lv: 62, build: 'slime', color: 0x7a5e3e, hpM: 1.5, atkM: 1.15, scale: 1.55 },
    hillboar: { name: '큰 멧돼지', lv: 62, build: 'quad', color: 0x4e3626, hpM: 1.4, atkM: 1.35, scale: 1.45, tusk: true },
    meadowviper:{ name: '풀뱀', lv: 64, build: 'snake', color: 0x5a8a3e, hpM: 1.1, atkM: 1.45, scale: 1.8 },
    woodbear: { name: '흑곰', lv: 64, build: 'quad', color: 0x2c2420, hpM: 1.7, atkM: 1.4, scale: 1.7 },
    thornslime:{ name: '가시 슬라임', lv: 65, build: 'slime', color: 0x3e6a2a, hpM: 1.55, atkM: 1.25, scale: 1.55, glow: 0x9ad040 },
    woodtroll:{ name: '숲 트롤', lv: 66, build: 'biped', color: 0x4e5e3a, hpM: 2.2, atkM: 1.5, scale: 2.25, club: true },
    stonehound:{ name: '돌개', lv: 66, build: 'quad', color: 0x7a7670, hpM: 1.35, atkM: 1.4, scale: 1.3 },
    valleyogre:{ name: '계곡 오우거', lv: 68, build: 'biped', color: 0x8a6a4a, hpM: 2.3, atkM: 1.55, scale: 2.3, club: true },
    windwolf: { name: '바람 늑대', lv: 68, build: 'quad', color: 0xb8c4cc, hpM: 1.3, atkM: 1.5, scale: 1.3 },
    mistslime:{ name: '안개 슬라임', lv: 69, build: 'slime', color: 0xc8d4dc, hpM: 1.6, atkM: 1.3, scale: 1.6, glow: 0xa0c8e8 },
    cliffgiant:{ name: '벼랑 거인', lv: 70, build: 'biped', color: 0x6a6662, hpM: 2.5, atkM: 1.6, scale: 2.5, club: true },
    // 엑시즈 서문 밖 (Lv 95–130)
    pinewolf: { name: '솔늑대', lv: 70, build: 'quad', color: 0x5a4a3a, hpM: 1.2, atkM: 1.4, scale: 1.25 },
    barkslime:{ name: '나무껍질 슬라임', lv: 71, build: 'slime', color: 0x6a4e32, hpM: 1.6, atkM: 1.3, scale: 1.6 },
    hornboar: { name: '뿔멧돼지', lv: 72, build: 'quad', color: 0x3e2e22, hpM: 1.5, atkM: 1.45, scale: 1.5, tusk: true },
    rockviper:{ name: '바위뱀', lv: 74, build: 'snake', color: 0x6e6a60, hpM: 1.2, atkM: 1.55, scale: 1.9 },
    greybear: { name: '회색곰', lv: 74, build: 'quad', color: 0x6a645c, hpM: 1.8, atkM: 1.5, scale: 1.75 },
    resinslime:{ name: '송진 슬라임', lv: 75, build: 'slime', color: 0xc8902a, hpM: 1.6, atkM: 1.35, scale: 1.6, glow: 0xffb040 },
    pinetroll:{ name: '솔숲 트롤', lv: 76, build: 'biped', color: 0x3e4a32, hpM: 2.3, atkM: 1.6, scale: 2.3, club: true },
    cragdog:  { name: '바위개', lv: 76, build: 'quad', color: 0x5e5a54, hpM: 1.4, atkM: 1.5, scale: 1.35 },
    rockogre: { name: '바위 오우거', lv: 78, build: 'biped', color: 0x7a7266, hpM: 2.4, atkM: 1.65, scale: 2.35, club: true },
    icewolf:  { name: '얼음 늑대', lv: 78, build: 'quad', color: 0xd0e0ea, hpM: 1.35, atkM: 1.6, scale: 1.35 },
    snowslime:{ name: '눈 슬라임', lv: 79, build: 'slime', color: 0xeef4f8, hpM: 1.7, atkM: 1.4, scale: 1.65, glow: 0xc0e0ff },
    frostgiant:{ name: '서리 거인', lv: 80, build: 'biped', color: 0x9ab0c0, hpM: 2.6, atkM: 1.7, scale: 2.6, club: true },
    // 엑시즈 북문 밖 (Lv 130–165)
    steppewolf:{ name: '초원 늑대', lv: 80, build: 'quad', color: 0x9a8058, hpM: 1.25, atkM: 1.5, scale: 1.3 },
    clayslime:{ name: '점토 슬라임', lv: 82, build: 'slime', color: 0xa86a48, hpM: 1.7, atkM: 1.35, scale: 1.65 },
    wildram:  { name: '들양', lv: 82, build: 'quad', color: 0xd8ccb0, hpM: 1.5, atkM: 1.5, scale: 1.4, tusk: true },
    reedviper:{ name: '갈대뱀', lv: 84, build: 'snake', color: 0x8a9a4a, hpM: 1.25, atkM: 1.65, scale: 2.0 },
    warboar:  { name: '싸움 멧돼지', lv: 84, build: 'quad', color: 0x5a3626, hpM: 1.6, atkM: 1.6, scale: 1.55, tusk: true },
    pollenslime:{ name: '꽃가루 슬라임', lv: 85, build: 'slime', color: 0xe8d050, hpM: 1.7, atkM: 1.4, scale: 1.65, glow: 0xfff070 },
    fieldogre:{ name: '들판 오우거', lv: 86, build: 'biped', color: 0x9a7a52, hpM: 2.5, atkM: 1.7, scale: 2.4, club: true },
    ashwolf:  { name: '잿빛 늑대', lv: 86, build: 'quad', color: 0x6a6866, hpM: 1.4, atkM: 1.65, scale: 1.35 },
    brownbear:{ name: '불곰', lv: 88, build: 'quad', color: 0x5a3a22, hpM: 1.9, atkM: 1.6, scale: 1.85 },
    hilltroll:{ name: '언덕 트롤', lv: 88, build: 'biped', color: 0x6a7a4a, hpM: 2.5, atkM: 1.7, scale: 2.35, club: true },
    stoneslime:{ name: '돌 슬라임', lv: 89, build: 'slime', color: 0x8a8680, hpM: 1.9, atkM: 1.45, scale: 1.7 },
    hillgiant:{ name: '언덕 거인', lv: 90, build: 'biped', color: 0x8a7a62, hpM: 2.7, atkM: 1.75, scale: 2.65, club: true },
    // 엑시즈 동문 밖 (Lv 165–200)
    shadewolf:{ name: '그늘 늑대', lv: 90, build: 'quad', color: 0x3a3a3e, hpM: 1.4, atkM: 1.7, scale: 1.35 },
    leafslime:{ name: '잎 슬라임', lv: 91, build: 'slime', color: 0x4a8a3a, hpM: 1.8, atkM: 1.5, scale: 1.7, glow: 0x80e060 },
    cliffboar:{ name: '벼랑 멧돼지', lv: 92, build: 'quad', color: 0x4a3a30, hpM: 1.7, atkM: 1.7, scale: 1.6, tusk: true },
    pitviper: { name: '살무사', lv: 94, build: 'snake', color: 0x5a4a32, hpM: 1.3, atkM: 1.8, scale: 2.0 },
    moonbear: { name: '반달곰', lv: 94, build: 'quad', color: 0x1e1a1a, hpM: 2.0, atkM: 1.7, scale: 1.85 },
    rotslime: { name: '썩은 잎 슬라임', lv: 95, build: 'slime', color: 0x5a5a2a, hpM: 1.9, atkM: 1.55, scale: 1.7 },
    oldtroll: { name: '늙은 트롤', lv: 96, build: 'biped', color: 0x4a5a4a, hpM: 2.7, atkM: 1.8, scale: 2.45, club: true },
    gorgehound:{ name: '협곡 사냥개', lv: 96, build: 'quad', color: 0x7a5e48, hpM: 1.55, atkM: 1.75, scale: 1.4 },
    gorgeogre:{ name: '협곡 오우거', lv: 98, build: 'biped', color: 0x7a5a42, hpM: 2.8, atkM: 1.85, scale: 2.5, club: true },
    stormwolf:{ name: '폭풍 늑대', lv: 98, build: 'quad', color: 0x7a8a9a, hpM: 1.6, atkM: 1.85, scale: 1.45 },
    cloudslime:{ name: '구름 슬라임', lv: 99, build: 'slime', color: 0xf0f2f6, hpM: 2.0, atkM: 1.6, scale: 1.75, glow: 0xd8e8ff },
    peakgiant:{ name: '봉우리 거인', lv: 100, build: 'biped', color: 0x8a8a92, hpM: 3.0, atkM: 1.9, scale: 2.8, club: true },
    // 불타는 협곡 (4E 너머, Lv 200–235)
    cinderhound:{ name: '잿빛 사냥개', lv: 202, build: 'quad', color: 0x4a4440, hpM: 1.5, atkM: 1.85, scale: 1.4 },
    cinderslime:{ name: '불씨 슬라임', lv: 205, build: 'slime', color: 0x3a2a26, hpM: 2.0, atkM: 1.6, scale: 1.75, glow: 0xff7a30 },
    scorchboar:{ name: '그을린 멧돼지', lv: 209, build: 'quad', color: 0x3a2a22, hpM: 1.8, atkM: 1.85, scale: 1.65, tusk: true },
    magmaviper:{ name: '용암 독사', lv: 214, build: 'snake', color: 0x8a2a14, hpM: 1.4, atkM: 1.95, scale: 2.1 },
    ashbear:  { name: '잿더미 곰', lv: 216, build: 'quad', color: 0x5a524c, hpM: 2.1, atkM: 1.85, scale: 1.9 },
    lavaslime:{ name: '용암 슬라임', lv: 220, build: 'slime', color: 0xd04a14, hpM: 2.1, atkM: 1.7, scale: 1.8, glow: 0xff9a40 },
    lavatroll:{ name: '용암 트롤', lv: 221, build: 'biped', color: 0x5a3a2e, hpM: 2.8, atkM: 1.9, scale: 2.5, club: true },
    flamehound:{ name: '불길 사냥개', lv: 223, build: 'quad', color: 0x9a3a1a, hpM: 1.6, atkM: 1.95, scale: 1.45 },
    flameogre:{ name: '화염 오우거', lv: 228, build: 'biped', color: 0x7a2e1e, hpM: 2.9, atkM: 1.95, scale: 2.55, club: true },
    firewolf: { name: '불꽃 늑대', lv: 230, build: 'quad', color: 0xb04a1e, hpM: 1.7, atkM: 2.0, scale: 1.5 },
    smokeslime:{ name: '연기 슬라임', lv: 233, build: 'slime', color: 0x6a6662, hpM: 2.2, atkM: 1.75, scale: 1.85, glow: 0xffb070 },
    firegiant:{ name: '불의 거인', lv: 235, build: 'biped', color: 0x6a2a1e, hpM: 3.2, atkM: 2.0, scale: 2.9, club: true },
    // 허칠산 (설산, Lv 100–150): 산장~갈림길 골짜기 100–110, 동굴 110–130, 봉우리 130–150
    frostfox: { name: '서리 여우', lv: 102, build: 'quad', color: 0xeef2f6, hpM: 1.15, atkM: 1.3 },
    snowgoat: { name: '눈 산양', lv: 108, build: 'quad', color: 0xe8e4da, hpM: 1.5, atkM: 1.35 },
    snowyeti: { name: '설인', lv: 132, build: 'biped', color: 0xe9edf0, hpM: 2.2, atkM: 1.6 },
    icewisp:  { name: '얼음 정령', lv: 136, build: 'wisp', color: 0xcfeaf8, hpM: 1.25, atkM: 1.5 },
    avagolem: { name: '눈사태 골렘', lv: 141, build: 'biped', color: 0xe6ecf2, hpM: 2.7, atkM: 1.65, defM: 1.3 },
    snowowl:  { name: '눈부엉이', lv: 144, build: 'bird', color: 0xf4f6f8, hpM: 1.45, atkM: 1.75 },
    frostmammoth:{ name: '얼음 매머드', lv: 148, build: 'quad', color: 0x8a7a6a, hpM: 3.0, atkM: 1.8 },
    // 허칠산 동굴 (Lv 110–130): 설산 굴에 사는 짐승 — 박쥐 떼, 굴을 보금자리 삼는 눈표범, 겨울잠 자는 동굴곰
    cavebat:  { name: '서리 박쥐', lv: 112, build: 'bird', color: 0x4a4650, hpM: 1.0, atkM: 1.45 },
    snowleopard:{ name: '눈표범', lv: 118, build: 'quad', color: 0xd8d4c8, hpM: 1.5, atkM: 1.6 },
    cavebear: { name: '동굴곰', lv: 124, build: 'quad', color: 0x5a4636, hpM: 2.4, atkM: 1.6 },
    elderbear:{ name: '늙은 동굴곰', lv: 129, build: 'quad', color: 0x3e3430, hpM: 3.2, atkM: 1.75, defM: 1.2 },
    reddragon:{ name: '붉은 용 이그니스', lv: 100, fixed: { hp: 450000, atk: 900, def: 60, exp: 80000 }, gold: 80000, build: 'dragon', color: 0xa8231a, scale: 1, dragon: true },
  };
  /* ---------- 몬스터 능력치 (밸런스) ----------
     몬스터는 "그 레벨에 그 레벨 장비를 갖춘 보통 모험가"(REF)를 기준으로 맞춘다.
     - 보통 몬스터(hpM·atkM이 그 레벨에서 흔한 값)는 평타 TTK(L)대에 쓰러지고, 보통 모험가를 HTD(L)대에 쓰러뜨린다
     - 한 레벨을 올리는 데 같은 레벨 보통 몬스터 KPL(L)마리
     - hpM·atkM은 같은 레벨대 몬스터 사이의 차이로만 쓴다 (높은 레벨 몬스터일수록 값이 커지던 것을 그 레벨의 흔한 값으로 나눈다) */
  const lerpT = (T, L) => { if (L <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (L <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (L - a) / (b - a); } const [a, va] = T[T.length - 2], [b, vb] = T[T.length - 1]; return vb + (vb - va) * (L - b) / (b - a); };
  const REF_ATK = [[1, 15], [5, 27], [10, 50], [20, 95], [30, 125], [45, 200], [60, 260], [80, 360], [100, 425], [130, 500], [165, 590], [200, 695]];
  const REF_DEF = [[1, 7], [5, 18], [10, 40], [20, 70], [30, 112], [45, 145], [60, 195], [80, 250], [100, 315], [130, 360], [165, 410], [200, 460]];
  const REF_HP = [[1, 76], [5, 140], [10, 265], [20, 440], [30, 740], [45, 900], [60, 1390], [80, 1610], [100, 2220], [130, 2520], [165, 2870], [200, 3290]];
  const TTK = [[1, 4], [10, 6], [30, 9], [60, 12], [100, 13], [200, 15]];      // 보통 몬스터를 쓰러뜨리는 평타 수
  const HTD = [[1, 18], [10, 15], [30, 13], [60, 11], [200, 10]];             // 보통 모험가가 버티는 몬스터 평타 수
  const KPL = [[1, 3], [10, 6], [30, 10], [60, 15], [100, 20], [170, 26], [200, 28]];   // 한 레벨에 잡는 마리 수
  const needExpS = (lv) => Math.floor(20 * Math.pow(lv, 1.5));               // 게임의 needExp와 같다
  const typHpM = (lv) => 1.08 + 0.0031 * lv, typAtkM = (lv) => 1 + 0.0042 * lv;
  function monStats(ty, lv) {
    const D = MON[ty];
    if (D.fixed) return { ...D.fixed, hp: Math.round(D.fixed.hp * 1.6), exp: Math.round(D.fixed.exp * 1.25), lv: D.lv };   // 보스·용은 따로 정한 값 (예전 그대로)
    const L = Math.max(1, lv);
    const hN = (D.hpM || 1) / typHpM(D.lv || L), aN = (D.atkM || 1) / typAtkM(D.lv || L);
    const def = Math.round(L * 0.4 * (D.defM || 1));
    const hit = Math.max(1, lerpT(REF_ATK, L) - def * 0.5);
    return {
      lv: L,
      hp: Math.round(hit * lerpT(TTK, L) * hN),
      atk: Math.round((lerpT(REF_HP, L) / lerpT(HTD, L) + lerpT(REF_DEF, L) * 0.6) * aN),
      def,
      exp: Math.max(1, Math.round(needExpS(L) / lerpT(KPL, L) * (0.25 + 0.75 * hN))),
    };
  }
  const ZONE_MON = {
    forest: ['slime', 'slime', 'wolf'], plains: ['boar', 'goblin'], swamp: ['toad', 'lizard'], ruins: ['skeleton', 'skeleton', 'ogre'],
    wwest: ['jackal', 'sandslime'], wnorth: ['hyena', 'rockslime', 'nomad'], wsouth: ['scorpion', 'duneogre'], weast: ['redlizard', 'emberslime', 'redgiant'],
    silva: ['silvawolf', 'mossslime'], arbus: ['snowwolf', 'frostslime'], kaolis: ['mackerel', 'tideslime', 'octopus'], subcus: ['darkhound', 'crystalslime'],
    // 엑시즈 사냥터: 첫 땅 = 예전 그 줄 1·2번째 땅 몬스터, 두 번째 땅 = 3·4·5번째 땅 몬스터
    // 2026-11-06 서문 길 네 땅: 예전 여덟 땅의 몬스터 48종을 땅 생김새에 맞게 나눴다 (레벨은 아래 SEP_LV로 그 땅 적정레벨 안에 고르게)
    m2a: ['fieldwolf', 'mudslime', 'hillboar', 'meadowviper', 'steppewolf', 'clayslime', 'stonehound', 'wildram', 'reedviper', 'pollenslime', 'warboar', 'fieldogre'],   /* 숲 가는 길: 들판 짐승 */
    m2b: ['pinewolf', 'barkslime', 'hornboar', 'woodbear', 'thornslime', 'rockviper', 'resinslime', 'greybear', 'woodtroll', 'pinetroll', 'leafslime', 'brownbear'],   /* 엑시즈 숲: 솔숲 짐승 */
    m2c: ['shadewolf', 'mistslime', 'rotslime', 'ashwolf', 'pitviper', 'cragdog', 'moonbear', 'cliffboar', 'gorgehound', 'hilltroll', 'valleyogre', 'oldtroll'],   /* 깊은 숲: 어두운 숲 짐승 */
    m2d: ['icewolf', 'snowslime', 'windwolf', 'stoneslime', 'stormwolf', 'cloudslime', 'rockogre', 'cliffgiant', 'gorgeogre', 'frostgiant', 'hillgiant', 'peakgiant'],   /* 추운 계곡: 바람 찬 골짜기 짐승 */
    /* 허칠: 사냥터 맵마다 제 종 (산장은 몬스터 없음) */
    hwood: ['frostfox'], hlake: ['snowgoat'], hcave: ['cavebat'], hcrys: ['snowleopard'], hfall: ['cavebear'], hden: ['elderbear'],
    hpeak: ['snowyeti'], hscree: ['icewisp'], hridge: ['avagolem', 'snowowl'], htop: ['frostmammoth'],
    m5a: ['cinderhound', 'cinderhound', 'cinderslime'], m5b: ['scorchboar', 'magmaviper'], m5c: ['ashbear', 'lavaslime', 'lavatroll'], m5d: ['flamehound', 'flameogre'], m5e: ['firewolf', 'smokeslime', 'firegiant'],
  };
  const ZONE_COUNT = { forest: 14, plains: 15, swamp: 16, ruins: 17, wwest: 28, wnorth: 30, wsouth: 32, weast: 34, silva: 30, arbus: 30, kaolis: 30, subcus: 30, m2a: 60, m2b: 60, m2c: 60, m2d: 60, hwood: 30, hlake: 30, hcave: 22, hcrys: 22, hfall: 22, hden: 22, hpeak: 28, hscree: 26, hridge: 24, htop: 14,   /* 2026-11-07 허칠 맵을 작게 떼면서 줄임 */   /* 2026-11-06 원호: 몬스터가 너무 적다 → 땅마다 60 */ m5a: 32, m5b: 32, m5c: 32, m5d: 32, m5e: 32 };
  for (const L of MLINES_ALL) if (L.off) for (const [id] of L.zones) { delete ZONE_COUNT[id]; delete ZONE_MON[id]; }   // 꺼 둔 땅에는 몬스터가 나오지 않는다
  // 지역별 레벨: 두 번째 지역은 도시에서 멀수록 강하다
  function levelAt(zone, x, z) {
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    const f = (a, b, lo, hi) => Math.round(lo + (hi - lo) * clampN((d2 - a) / (b - a), 0, 1));
    if (ISLES[zone] && ISLES[zone].lvAt) return ISLES[zone].lvAt(x, z);   // 허칠산·동굴: 길 따라 정한 레벨
    if (ISLES[zone] && ZONE_LEVELS[zone]) { const I = ISLES[zone], L = ZONE_LEVELS[zone]; const d = Math.hypot(x - I.entry.x, z - I.entry.z); return Math.round(L[0] + (L[1] - L[0]) * clampN((d - 12) / (I.R * 1.7 - 12), 0, 1)); }   // 들어온 자리에서 멀수록 강하다
    switch (zone) {
      case 'forest': case 'plains': case 'swamp': case 'ruins': case 'wwest': case 'wnorth': case 'wsouth': case 'weast': {   // 길을 따라 갈수록 강하다
        const n = spNear(x, z), L = ZONE_LEVELS[zone], i = SP.ZONES.indexOf(zone), fr = n ? clampN((n.t - i * SP.Q) / SP.Q, 0, 1) : 0;
        return Math.round(L[0] + (L[1] - L[0]) * fr); }
      default: return 1;
    }
  }
  const ZONE_LEVELS = { village: [0, 0], forest: [1, 3], plains: [4, 6], swamp: [8, 10], ruins: [12, 15], dungeon: [18, 22], town: [0, 0], hall: [60, 60], wlair: [62, 62], wwest: [16, 27], wnorth: [31, 39], wsouth: [42, 49], weast: [52, 59], silva: [60, 70], arbus: [70, 80], kaolis: [80, 90], subcus: [90, 100], marcus: [0, 0], milgol: [0, 0], coachway: [0, 0], castle: [0, 0], guildhall: [0, 0], exmarket: [0, 0], arena: [0, 0], library: [0, 0], khq: [0, 0], hechil: [0, 0], ...Object.fromEntries(HCH.AREAS.map((A) => [A.zone, A.lv])) };
  MLINES.forEach((L) => { if (L.lv) { L.zones.forEach(([id], i) => { ZONE_LEVELS[id] = L.lv[i].slice(); }); return; }
    if (L.branch) { L.zones.forEach(([id], i) => { const a = 60 + (L.n - 1) * 35 + i * 7; ZONE_LEVELS[id] = [a, a + 7]; }); return; }
    const a = 60 + (L.n - 1) * 10, w = 10 / L.zones.length; L.zones.forEach(([id], i) => { ZONE_LEVELS[id] = [Math.round(a + i * w), Math.round(a + (i + 1) * w)]; }); });   /* 엑시즈 사냥터: 60레벨부터 문 하나에 10레벨, 그 문의 땅들이 나눠 맡는다 (2026-11-06 원호: 60–100. 100–150은 허칠산) */
  /* 따로 된 맵 줄(서문 길): 그 땅 몬스터 종들의 레벨을 땅 적정레벨 안에 고르게 (같은 종은 늘 같은 레벨) */
  MLINES.forEach((L) => { if (!L.sep || !L.lv) return; L.zones.forEach(([id], i) => { const T = ZONE_MON[id], [lo, hi] = L.lv[i]; if (T) T.forEach((ty, j) => { if (MON[ty]) MON[ty].lv = Math.round(lo + (hi - lo) * j / Math.max(1, T.length - 1)); }); }); });

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
  BOARDS.guild = { title: '모험가 길드 의뢰 게시판', cap: 50, zones: [],
    /* 엑시즈 길드는 60레벨 이상 의뢰만: 스물여덟 레벨씩 칸을 나눈다 (사냥터의 시작 레벨로 가른다). 그 아래는 하레나 게시판 */
    tiers: [...[[60, 70], [70, 80], [80, 90], [90, 100], [100, 125], [125, 150]].map(([lo, hi], i) => ({ id: 'a' + i, name: ['1급', '2급', '3급', '4급', '5급', '6급'][i], lv: [lo, hi], zones: [...MHUNT, ...HCH.HZ].filter((z) => ZONE_MON[z] && ZONE_LEVELS[z] && ZONE_LEVELS[z][0] >= lo && ZONE_LEVELS[z][0] < hi) }))].filter((t) => t.zones.length),
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
  const api = { HCH, boardTierOf, MHUNT, MLINES, MH, THOUSE, inTHouse, MYHOME, inMyHome, GHOUSE, inGHouse, BAKERY, inBakery, MSHOP, inMShop, isleEdge, R1, C2, R2, ROAD, TOWN_R, INNER, SP, spR, spHW, spPos, spNear, hInside, hOutside, ENTRY, TOWN_BLD, PIT, DUN, BOSS_HOME, LAIR, HALL, EPORTAL, WLAIR, ISLES, ISLE_ORDER, isleAt, HALL_ROOM, CELLAR, inHallAnnex, zoneAt, SAFE, roomClamp, worldClamp, keepOutOfSafe, MON, monStats, ZONE_MON, ZONE_COUNT, levelAt, ZONE_LEVELS, smooth: sm, BOARDS, BOARD_CAP, makePoster };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OR = api;
})(typeof self !== 'undefined' ? self : this);
