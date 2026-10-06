/* 오를란도 몬스터 시뮬레이션: 서버에서도, Claude 안의 게임에서도 같은 코드로 몬스터와 보스를 움직인다 */
(function (root) {
  'use strict';
  const OR = (typeof module !== 'undefined' && module.exports) ? require('./shared.js') : root.OR;

  function createSim(opts) {
    const { MON, monStats, ZONE_MON, ZONE_COUNT, levelAt, zoneAt, SAFE, worldClamp, roomClamp, keepOutOfSafe, DUN, BOSS_HOME, C2, R2, ROAD, PIT, TOWN_R, LAIR } = OR;
    const TICK = 0.1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const r2 = (v) => Math.round(v * 100) / 100;
    const later = opts.later || ((fn, ms) => setTimeout(fn, ms));

    // ---------- 장애물 (나무·바위·집) ----------
    const GRID = new Map(), CELL = 8;
    for (const c of opts.cols || []) {
      const [x, z, r] = c;
      for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++)
        for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
          const k = gx + ',' + gz; if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(c);
        }
    }
    function pushOut(p, rad) {
      const list = GRID.get(Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL));
      if (!list) return;
      for (const [x, z, r] of list) {
        const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), mn = r + rad;
        if (d < mn && d > 1e-4) { p.x = x + (dx / d) * mn; p.z = z + (dz / d) * mn; }
      }
    }
    const blocked = (x, z, rad) => { const p = { x, z }; pushOut(p, rad); return Math.hypot(p.x - x, p.z - z) > 0.01; };

    // ---------- 접속자 ----------
    const clients = new Map(); // id -> {send, pres}
    const send = (id, msg) => { const c = clients.get(id); if (c) c.send(msg); };
    const broadcast = (msg, except) => { for (const [id, c] of clients) if (id !== except) c.send(msg); };
    const inRotunda = (p) => p.z > 300 && Math.hypot(p.x - DUN.x, p.z - DUN.z) < DUN.R - 1.5;
    const inLair = (p) => Math.hypot(p.x - LAIR.x, p.z - LAIR.z) < LAIR.r - 0.5;

    // ---------- 몬스터 ----------
    const monsters = new Map();
    let seq = 0;
    function randPointIn(zone) {
      for (let i = 0; i < 400; i++) {
        let x, z;
        if (zone === 'road') { x = rnd(ROAD.x0 + 10, ROAD.x1 - 6); z = rnd(-3, 3); }
        else if (['waste', 'snow', 'grave', 'volcano', 'abyss'].includes(zone)) {
          const a = rnd(-Math.PI, Math.PI), d = rnd(TOWN_R + 5, R2 - 4); x = C2.x + Math.cos(a) * d; z = C2.z + Math.sin(a) * d;
          if (Math.abs(z) < 6 && x < C2.x) continue; // 도시로 가는 길은 비워 둔다
        } else { const a = rnd(-Math.PI, Math.PI), d = rnd(34, 100); x = Math.cos(a) * d; z = Math.sin(a) * d; }
        if (zoneAt(x, z) !== zone) continue;
        if (zone !== 'road' && Math.min(Math.abs(x), Math.abs(z)) < 4 && x < 110) continue;
        if (Math.hypot(x - PIT.x, z - PIT.z) < 13) continue;
        if (Math.hypot(x - LAIR.x, z - LAIR.z) < LAIR.r + 8) continue;
        if (blocked(x, z, 1)) continue;
        let near = false;
        for (const c of clients.values()) if (c.pres.on && Math.hypot(c.pres.x - x, c.pres.z - z) < 2.5) near = true; // 바로 발밑만 피한다
        if (!near) return { x, z };
      }
      return null;
    }
    function makeMon(ty, zone, p, lv, extra = {}) {
      const D = MON[ty], st = monStats(ty, lv);
      const m = {
        i: ++seq, ty, zone, D, lv: st.lv, x: p.x, z: p.z, ry: rnd(0, 6.28), hp: st.hp, mh: st.hp, atk: st.atk,
        home: { x: p.x, z: p.z }, target: { x: p.x, z: p.z }, wait: rnd(0, 3), stun: 0, dot: null,
        atkCd: 1, windup: 0, aggroOn: null, hitBy: new Set(), lastHit: 0, r: 0.7 * (D.scale || 1), dirty: true, stuck: 0, detour: null,
        ...extra,
      };
      monsters.set(m.i, m);
      return m;
    }
    function spawn(zone) {
      const p = randPointIn(zone); if (!p) return null;
      const ty = pick(ZONE_MON[zone]);
      return makeMon(ty, zone, p, MON[ty].lv || levelAt(zone, p.x, p.z)); // 같은 종은 늘 같은 레벨
    }
    const pub = (m) => ({ i: m.i, ty: m.ty, zone: m.zone, lv: m.lv, x: r2(m.x), z: r2(m.z), ry: r2(m.ry), hp: Math.max(0, Math.round(m.hp)), mh: m.mh });
    function spawnBoss() {
      return makeMon('kingslime', 'dungeon', { ...BOSS_HOME }, 20, { ry: Math.PI, boss: true, cd: { slam: 4, acid: 7, wave: 10, rain: 12, absorb: 20 }, gap: 0, act: null, phase: 0, idleT: 0, vuln: 0, queue: [] });
    }
    function spawnDragon() {
      return makeMon('reddragon', 'lair', { x: LAIR.x + 4, z: LAIR.z }, 100, { dragon: true, r: 3.4, ry: -Math.PI / 2, cd: { breath: 3, tail: 6, stomp: 9, dive: 13, meteor: 16 }, gap: 0, sks: [], phase: 1, idleT: 0, mv: null, skSeq: 0, said: 0 });
    }
    for (const z in ZONE_COUNT) for (let k = 0; k < ZONE_COUNT[z]; k++) spawn(z);
    spawnBoss();
    spawnDragon();

    function kill(m) {
      monsters.delete(m.i);
      broadcast({ t: 'mdie', i: m.i, by: [...m.hitBy].filter((id) => clients.has(id)) });
      if (m.boss) {
        for (const s of [...monsters.values()]) if (s.summon) { monsters.delete(s.i); broadcast({ t: 'mdie', i: s.i, by: [] }); }
        later(() => broadcast({ t: 'mspawn', m: pub(spawnBoss()) }), 90000);
      } else if (m.dragon) {
        later(() => broadcast({ t: 'mspawn', m: pub(spawnDragon()) }), 300000);
      } else if (!m.summon && !m.dragon) later(() => { const n = spawn(m.zone); if (n) broadcast({ t: 'mspawn', m: pub(n) }); }, 9000);
    }
    function hurt(m, dmg, from) {
      if (m.boss && m.vuln > 0) dmg *= 1.6;
      m.hp -= dmg; m.dirty = true; m.lastHit = Date.now();
      if (from) { m.hitBy.add(from); if (!m.boss) m.aggroOn = from; }
      if (m.hp <= 0) kill(m);
    }

    // ---------- 움직임 도우미 ----------
    const turn = (m, want, rate) => { let d = want - m.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); m.ry += d * Math.min(1, rate); };
    function moveToward(m, gx, gz, spd) {
      const dx = gx - m.x, dz = gz - m.z, l = Math.hypot(dx, dz);
      if (l < 0.05) return 0;
      const s = Math.min(spd * TICK, l);
      m.x += (dx / l) * s; m.z += (dz / l) * s;
      turn(m, Math.atan2(dx, dz), 0.5);
      return s;
    }
    function targetsFor() {
      const out = [];
      for (const [id, c] of clients) {
        const p = c.pres;
        if (!p.on || !p.al) continue;
        if (SAFE[zoneAt(p.x, p.z)]) continue;
        out.push({ id, x: p.x, z: p.z, dun: p.z > 300, rot: inRotunda(p) });
      }
      return out;
    }

    // ---------- 킹 슬라임 ----------
    function bossSay(text) { broadcast({ t: 'bsay', m: text }); }
    function bossTick(m, ts) {
      const tg = ts.filter((t) => t.rot);
      const C = m.cd;
      if (!tg.length) {
        m.idleT += TICK; m.act = null; m.queue = [];
        if (m.idleT > 8 && (m.hp < m.mh || m.phase > 0)) {
          m.hp = Math.min(m.mh, m.hp + m.mh * 0.12 * TICK); m.dirty = true;
          if (m.hp >= m.mh) {
            m.phase = 0; m.hitBy.clear(); m.vuln = 0;
            for (const s of [...monsters.values()]) if (s.summon) { monsters.delete(s.i); broadcast({ t: 'mdie', i: s.i, by: [] }); }
          }
        }
        moveToward(m, BOSS_HOME.x, BOSS_HOME.z, 2);
        return;
      }
      m.idleT = 0;
      for (const k in C) C[k] -= TICK;
      m.gap -= TICK; m.vuln = Math.max(0, m.vuln - TICK); m.stun = Math.max(0, m.stun - TICK * 2);
      const frac = m.hp / m.mh;
      const ph = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
      if (ph > (m.phase || 1)) {
        m.phase = ph;
        const n = ph === 2 ? 3 : 4;
        bossSay(ph === 2 ? '킹 슬라임이 몸을 떨며 조각들을 뱉어냈다! 바닥을 타고 퍼지는 충격파는 점프로 넘으세요.' : '킹 슬라임이 분노했다! 하늘에서 점액이 쏟아진다. 조각이 보스에게 닿으면 체력을 회복합니다.');
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, p = { x: m.x + Math.cos(a) * (m.r + 1.5), z: m.z + Math.sin(a) * (m.r + 1.5) };
          roomClamp(p, 0.8);
          const s = makeMon('slimelet', 'dungeon', p, 18, { summon: true, aggroOn: pick(tg).id });
          broadcast({ t: 'mspawn', m: pub(s) });
        }
      }
      if (!m.phase) m.phase = 1;
      const rage = m.phase === 3;
      // 진행 중인 행동
      if (m.act) {
        const A = m.act; A.t += TICK;
        if (A.type === 'slam') {
          const k = Math.min(1, A.t / A.dur);
          m.x = A.fx + (A.tx - A.fx) * k; m.z = A.fz + (A.tz - A.fz) * k;
          if (k >= 1) {
            broadcast({ t: 'bland', i: m.i, x: r2(A.tx), z: r2(A.tz), r: A.r });
            for (const t of tg) if (Math.hypot(t.x - A.tx, t.z - A.tz) < A.r + 1) send(t.id, { t: 'bhit', to: t.id, x: r2(A.tx), z: r2(A.tz), r: A.r, dmg: Math.round(m.atk * 1.3) });
            m.act = null;
            if (m.queue.length) { const nx = m.queue.shift(); startSlam(m, nx, 0.85, 5); }
            else if (A.combo) { m.vuln = 3.2; broadcast({ t: 'bvuln', i: m.i, d: 3.2 }); bossSay('킹 슬라임이 지쳐 주저앉았다! 지금이 기회입니다 (받는 피해 증가)'); m.gap = 3.2; }
            else m.gap = 0.8;
          }
        } else if (A.type === 'bump') {
          if (A.t >= A.dur) {
            const t = tg.find((q) => q.id === A.to);
            if (t && Math.hypot(t.x - m.x, t.z - m.z) < m.r + 2.2) send(t.id, { t: 'matk', i: m.i, to: t.id, atk: m.atk });
            broadcast({ t: 'matk', i: m.i, to: null }, A.to);
            m.act = null; m.gap = 0.6; m.windup = 0;
          }
        } else if (A.t >= A.dur) { m.act = null; m.gap = 0.8; }
        roomClamp(m, m.r * 0.8);
        return;
      }
      if (m.stun > 0 || m.vuln > 0 || m.gap > 0) { roomClamp(m, m.r * 0.8); return; }
      // 노릴 대상
      let t = tg.find((q) => q.id === m.aggroOn);
      if (!t || Math.random() < 0.02) { t = pick(tg); m.aggroOn = t.id; }
      const dx = t.x - m.x, dz = t.z - m.z, dist = Math.hypot(dx, dz);
      turn(m, Math.atan2(dx, dz), 0.35);
      const cdm = rage ? 0.7 : 1;
      if (rage && C.rain <= 0) {
        const pts = tg.map((q) => [r2(q.x), r2(q.z)]);
        for (let k = 0; k < 7; k++) { const a = rnd(0, 6.28), d = rnd(2, DUN.R - 2); pts.push([r2(DUN.x + Math.cos(a) * d), r2(DUN.z + Math.sin(a) * d)]); }
        broadcast({ t: 'brain', i: m.i, pts, r: 2.4, d: 1.4, dmg: Math.round(m.atk * 1.2) });
        C.rain = 13; m.act = { type: 'cast', t: 0, dur: 1.4 };
      } else if (m.phase >= 2 && C.wave <= 0) {
        broadcast({ t: 'bwave', i: m.i, x: r2(m.x), z: r2(m.z), r0: r2(m.r), r1: 17, spd: 8.5, w: 1.1, dmg: Math.round(m.atk * 1.0), n: rage ? 2 : 1 });
        C.wave = 11 * cdm; m.act = { type: 'cast', t: 0, dur: rage ? 2.6 : 1.8 };
      } else if (C.slam <= 0) {
        if (rage) {
          bossSay('킹 슬라임이 연달아 뛰어오른다! 세 번째 착지 뒤에 빈틈이 생깁니다.');
          const ps = [t, pick(tg), pick(tg)].map((q) => ({ x: q.x + rnd(-1.5, 1.5), z: q.z + rnd(-1.5, 1.5) }));
          startSlam(m, ps[0], 0.95, 5.8); m.queue = [ps[1], ps[2]]; m.act.combo = true;
          for (const q of m.queue) q.combo = true;
        } else startSlam(m, t, 1.3, 5.5);
        C.slam = rnd(6, 8) * cdm;
      } else if (C.acid <= 0) {
        const n = m.phase + 2, pts = [];
        for (let k = 0; k < n; k++) { const q = k < tg.length ? tg[k] : pick(tg); const p = { x: q.x + rnd(-2.5, 2.5), z: q.z + rnd(-2.5, 2.5) }; roomClamp(p, 1); pts.push([r2(p.x), r2(p.z)]); }
        broadcast({ t: 'bacid', i: m.i, pts, d: 1.0, r: 2.6, dur: 6, dps: Math.round(m.atk * 0.35) });
        C.acid = rnd(7, 9) * cdm; m.act = { type: 'cast', t: 0, dur: 0.9 };
      } else if (rage && C.absorb <= 0 && [...monsters.values()].some((s) => s.summon)) {
        for (const s of monsters.values()) if (s.summon) s.feed = true;
        bossSay('킹 슬라임이 조각들을 불러들인다! 닿기 전에 처치하세요.');
        C.absorb = 22;
      } else {
        const reach = 0.9 + m.r + 0.5;
        if (dist > reach) moveToward(m, t.x, t.z, rage ? 3.4 : 2.4);
        else if (m.atkCd <= 0) { m.act = { type: 'bump', t: 0, dur: 0.6, to: t.id }; m.windup = 0.6; m.atkCd = 1.6; }
        m.atkCd -= TICK;
      }
      roomClamp(m, m.r * 0.8);
    }
    function startSlam(m, p, dur, r) {
      const q = { x: p.x, z: p.z }; roomClamp(q, m.r * 0.6);
      m.act = { type: 'slam', t: 0, dur, fx: m.x, fz: m.z, tx: q.x, tz: q.z, r, combo: !!p.combo };
      broadcast({ t: 'bslam', i: m.i, x: r2(q.x), z: r2(q.z), r, d: dur });
    }

    // ---------- 붉은 용 (Lv 100 보스) ----------
    // 모든 큰 기술은 바닥에 경고(msk)가 먼저 뜨고, 잠시 뒤 판정(mskr). 같은 시간에 여러 개가 겹칠 수 있다.
    function lairClamp(p, rad) { const d = Math.hypot(p.x - LAIR.x, p.z - LAIR.z), mx = LAIR.r - rad; if (d > mx) { p.x = LAIR.x + (p.x - LAIR.x) * mx / d; p.z = LAIR.z + (p.z - LAIR.z) * mx / d; } }
    function dSkill(m, o) {
      const sk = { sid: ++m.skSeq, t: 0, ...o };
      sk.msg = { t: 'msk', i: m.i, sid: sk.sid, k: o.k, d: r2(o.tele), ...(o.sh === 'c' ? { sh: 'c', x: r2(o.x), z: r2(o.z), r: r2(o.r) } : { sh: 'l', x: r2(o.x), z: r2(o.z), a: r2(o.a), len: r2(o.len), w: r2(o.w) }) };
      if (o.col !== undefined) sk.msg.col = o.col;
      m.sks.push(sk); broadcast(sk.msg); return sk;
    }
    function dResolve(m, sk, tg) {
      const hit = tg.filter((t) => inShape(sk, t.x, t.z, 0.8)).map((t) => t.id);
      const out = { ...sk.msg, t: 'mskr', dmg: Math.round(m.atk * sk.mul), lv: 100, hit };
      if (sk.pool) { out.pool = sk.pool[0]; out.dps = Math.round(m.atk * sk.pool[1]); }
      if (sk.jump) out.jump = 1;
      broadcast(out);
      if (sk.k === 'dive') { m.mv = { fx: m.x, fz: m.z, tx: sk.x, tz: sk.z, t: 0, dur: 0.25 }; }
    }
    function dragonTick(m, ts) {
      const tg = ts.filter((t) => inLair(t));
      // 진행 중인 기술
      for (const sk of [...m.sks]) { sk.t += TICK; if (sk.t >= sk.tele) { dResolve(m, sk, tg); m.sks.splice(m.sks.indexOf(sk), 1); } }
      if (m.mv) { m.mv.t += TICK; const k = Math.min(1, m.mv.t / m.mv.dur); m.x = m.mv.fx + (m.mv.tx - m.mv.fx) * k; m.z = m.mv.fz + (m.mv.tz - m.mv.fz) * k; if (k >= 1) m.mv = null; lairClamp(m, m.r); return; }
      if (!tg.length) {
        m.idleT += TICK; m.aggroOn = null; m.windup = 0;
        if (m.idleT > 10 && m.hp < m.mh) { m.hp = Math.min(m.mh, m.hp + m.mh * 0.04 * TICK); m.dirty = true; if (m.hp >= m.mh) { m.hitBy.clear(); m.phase = 1; m.said = 0; } }
        moveToward(m, LAIR.x + 4, LAIR.z, 2.5); return;
      }
      if (m.idleT > 3 || !m.said) { broadcast({ t: 'bsay', m: '붉은 용 이그니스가 깨어났다! 바닥의 붉은 표시를 피하세요.', lair: 1 }); m.said = 1; }
      m.idleT = 0;
      const C = m.cd; for (const k in C) C[k] -= TICK;
      m.gap -= TICK; m.atkCd -= TICK;
      const frac = m.hp / m.mh, ph = frac < 0.25 ? 3 : frac < 0.55 ? 2 : 1;
      if (ph > m.phase) { m.phase = ph; broadcast({ t: 'bsay', m: ph === 2 ? '이그니스가 날개를 펼쳤다! 하늘에서 불덩이가 쏟아진다.' : '이그니스가 분노했다! 숨결이 두 번 휩쓴다.', lair: 1 }); C.meteor = Math.min(C.meteor, 1); }
      const fast = ph === 3 ? 0.65 : ph === 2 ? 0.82 : 1;
      if (m.windup > 0) { m.windup -= TICK; if (m.windup <= 0) { const t = tg.find((q) => q.id === m.biteTo); if (t && Math.hypot(t.x - m.x, t.z - m.z) < m.r + 3.2) send(t.id, { t: 'matk', i: m.i, to: t.id, atk: m.atk }); broadcast({ t: 'matk', i: m.i, to: null }, m.biteTo); m.atkCd = 1.8 * fast; } return; }
      if (m.gap > 0 || m.sks.some((s) => s.block)) { lairClamp(m, m.r); return; }
      let t = tg.find((q) => q.id === m.aggroOn);
      if (!t || Math.random() < 0.015) { t = pick(tg); m.aggroOn = t.id; }
      const dx = t.x - m.x, dz = t.z - m.z, dist = Math.hypot(dx, dz), a = Math.atan2(dx, dz);
      turn(m, a, 0.25);
      const head = { x: m.x + Math.sin(m.ry) * (m.r + 0.5), z: m.z + Math.cos(m.ry) * (m.r + 0.5) };
      if (C.meteor <= 0 && ph >= 2) {
        const n = 4 + ph * 2;
        for (let k = 0; k < n; k++) { const q = k < tg.length ? tg[k] : null; const p = q ? { x: q.x + rnd(-1.5, 1.5), z: q.z + rnd(-1.5, 1.5) } : (() => { const aa = rnd(0, 6.28), d = rnd(2, LAIR.r - 2); return { x: LAIR.x + Math.cos(aa) * d, z: LAIR.z + Math.sin(aa) * d }; })();
          dSkill(m, { k: 'meteor', sh: 'c', x: p.x, z: p.z, r: 2.6, tele: 1.5 + k * 0.22, mul: 1.15, pool: [3, 0.18], col: 1 }); }
        C.meteor = 16 * fast; m.gap = 1.2;
      } else if (C.dive <= 0 && dist > 6) {
        dSkill(m, { k: 'dive', sh: 'c', x: t.x, z: t.z, r: 5.5, tele: 1.9, mul: 2.0, block: true });
        C.dive = 15 * fast;
      } else if (C.breath <= 0 && dist < 20) {
        const len = 17, w = 2.7;
        dSkill(m, { k: 'breath', sh: 'l', x: head.x, z: head.z, a, len, w, tele: 1.3, mul: 1.6, pool: [3, 0.15], col: 1, block: true });
        if (ph === 3) { const s2 = Math.random() < 0.5 ? 1 : -1; dSkill(m, { k: 'breath', sh: 'l', x: head.x, z: head.z, a: a + s2 * 0.55, len, w, tele: 2.2, mul: 1.6, pool: [3, 0.15], col: 1, block: true }); }
        m.ry = a; C.breath = rnd(7, 9) * fast;
      } else if (C.tail <= 0 && dist < 10) {
        dSkill(m, { k: 'tail', sh: 'c', x: m.x, z: m.z, r: 7.5, tele: 1.0, mul: 1.3, jump: 1, block: true });
        C.tail = rnd(6, 8) * fast;
      } else if (C.stomp <= 0) {
        dSkill(m, { k: 'stomp', sh: 'c', x: m.x, z: m.z, r: 10.5, tele: 1.45, mul: 1.0, jump: 1, block: true });
        C.stomp = rnd(10, 13) * fast;
      } else if (dist > m.r + 3) { moveToward(m, t.x, t.z, 3.2); }
      else if (m.atkCd <= 0) { m.windup = 0.7; m.biteTo = t.id; }
      lairClamp(m, m.r);
    }

    // ---------- 일반 몬스터의 작은 기술 (바닥에 경고 표시 → 잠시 뒤 판정) ----------
    // sh: 'c' 원, 'l' 직선. at: 'self' 자기 자리, 'front' 바로 앞, 'target' 노린 사람 자리
    const SK = {
      slime:     { k: 'leap',  sh: 'c', at: 'target', range: [0, 7], tele: 0.85, r: 1.7, mul: 1.1, cd: [6, 9], jump: 1 },
      sandslime: { k: 'leap',  sh: 'c', at: 'target', range: [0, 8], tele: 0.85, r: 2.0, mul: 1.15, cd: [6, 9], jump: 1 },
      iceslime:  { k: 'leap',  sh: 'c', at: 'target', range: [0, 8], tele: 0.85, r: 2.2, mul: 1.2, cd: [6, 9], jump: 1 },
      voidslime: { k: 'leap',  sh: 'c', at: 'target', range: [0, 9], tele: 0.9, r: 2.6, mul: 1.3, cd: [6, 9], jump: 1 },
      ghoul:     { k: 'leap',  sh: 'c', at: 'target', range: [0, 8], tele: 0.75, r: 1.6, mul: 1.25, cd: [5, 8], jump: 1 },
      toad:      { k: 'spit',  sh: 'c', at: 'target', range: [0, 11], tele: 1.0, r: 1.8, mul: 0.9, cd: [6, 9], pool: [3.5, 0.3], col: 0 },
      fireslime: { k: 'spit',  sh: 'c', at: 'target', range: [0, 12], tele: 1.0, r: 2.0, mul: 1.0, cd: [6, 9], pool: [3, 0.35], col: 1 },
      salamander:{ k: 'spit',  sh: 'c', at: 'target', range: [0, 11], tele: 0.95, r: 1.8, mul: 1.0, cd: [6, 9], pool: [3, 0.3], col: 1 },
      goblin:    { k: 'throw', sh: 'c', at: 'target', range: [0, 12], tele: 0.9, r: 1.4, mul: 1.0, cd: [5, 8], col: 2 },
      wolf:      { k: 'dash',  sh: 'l', range: [0, 9], tele: 0.7, len: 8, w: 0.9, mul: 1.2, cd: [6, 9] },
      dog:       { k: 'dash',  sh: 'l', range: [0, 9], tele: 0.7, len: 8, w: 0.9, mul: 1.2, cd: [6, 9] },
      whitewolf: { k: 'dash',  sh: 'l', range: [0, 10], tele: 0.65, len: 9, w: 0.9, mul: 1.25, cd: [6, 9] },
      shadowwolf:{ k: 'dash',  sh: 'l', range: [0, 10], tele: 0.6, len: 10, w: 1.0, mul: 1.3, cd: [5, 8] },
      boar:      { k: 'dash',  sh: 'l', range: [0, 11], tele: 0.95, len: 11, w: 1.1, mul: 1.5, cd: [6, 9] },
      scorpion:  { k: 'sting', sh: 'l', range: [0, 4.5], tele: 0.6, len: 4.6, w: 0.7, mul: 1.5, cd: [5, 7] },
      lizard:    { k: 'thrust',sh: 'l', range: [0, 4], tele: 0.6, len: 4.2, w: 0.6, mul: 1.4, cd: [5, 7] },
      skeleton:  { k: 'spin',  sh: 'c', at: 'self', range: [0, 3], tele: 0.75, r: 2.6, mul: 1.3, cd: [6, 9] },
      bandit:    { k: 'spin',  sh: 'c', at: 'self', range: [0, 3], tele: 0.75, r: 2.6, mul: 1.3, cd: [6, 9] },
      boneknight:{ k: 'spin',  sh: 'c', at: 'self', range: [0, 3.5], tele: 0.8, r: 3.2, mul: 1.4, cd: [6, 9] },
      ogre:      { k: 'smash', sh: 'c', at: 'front', range: [0, 4], tele: 1.0, r: 2.4, mul: 1.7, cd: [6, 9], jump: 1 },
      yeti:      { k: 'smash', sh: 'c', at: 'front', range: [0, 4], tele: 1.0, r: 2.5, mul: 1.7, cd: [6, 9], jump: 1 },
      lavagiant: { k: 'smash', sh: 'c', at: 'front', range: [0, 4.5], tele: 1.05, r: 2.8, mul: 1.8, cd: [6, 9], jump: 1, pool: [3, 0.3], col: 1 },
      fallen:    { k: 'smash', sh: 'c', at: 'front', range: [0, 4], tele: 0.85, r: 2.6, mul: 1.6, cd: [5, 8], jump: 1 },
      wraith:    { k: 'scream',sh: 'c', at: 'self', range: [0, 4], tele: 0.9, r: 4, mul: 1.0, cd: [7, 10] },
    };
    function startSkill(m, S, tgt, dist) {
      const sc = 0.6 + 0.4 * (m.D.scale || 1), sk = { k: S.k, S, t: 0, tele: S.tele, to: tgt.id };
      const a = Math.atan2(tgt.x - m.x, tgt.z - m.z); m.ry = a;
      if (S.sh === 'c') {
        sk.r = S.r * sc;
        if (S.at === 'self') { sk.x = m.x; sk.z = m.z; }
        else if (S.at === 'front') { const f = m.r + sk.r * 0.75; sk.x = m.x + Math.sin(a) * f; sk.z = m.z + Math.cos(a) * f; }
        else { sk.x = tgt.x; sk.z = tgt.z; }
        sk.msg = { t: 'msk', i: m.i, k: S.k, sh: 'c', x: r2(sk.x), z: r2(sk.z), r: r2(sk.r), d: S.tele };
      } else {
        sk.x = m.x; sk.z = m.z; sk.a = a; sk.w = S.w * sc;
        sk.len = S.k === 'dash' ? Math.max(5, Math.min(S.len, dist + 3)) : S.len * sc;
        sk.msg = { t: 'msk', i: m.i, k: S.k, sh: 'l', x: r2(sk.x), z: r2(sk.z), a: r2(a), len: r2(sk.len), w: r2(sk.w), d: S.tele };
      }
      if (S.col !== undefined) sk.msg.col = S.col;
      m.sk = sk; m.windup = 0;
      broadcast(sk.msg);
    }
    function inShape(sk, x, z, pad) {
      if (sk.msg.sh === 'c') return Math.hypot(x - sk.x, z - sk.z) < sk.r + pad;
      const dx = x - sk.x, dz = z - sk.z, u = dx * Math.sin(sk.a) + dz * Math.cos(sk.a), v = dx * Math.cos(sk.a) - dz * Math.sin(sk.a);
      return u > -0.6 - pad && u < sk.len + pad && Math.abs(v) < sk.w + pad;
    }
    function resolveSkill(m, sk, ts) {
      const S = sk.S, dmg = Math.round(m.atk * S.mul);
      const hit = ts.filter((t) => (m.zone === 'dungeon' ? t.rot : !t.dun) && inShape(sk, t.x, t.z, 1.0)).map((t) => t.id);
      const out = { ...sk.msg, t: 'mskr', dmg, lv: m.lv, hit };
      if (S.pool) { out.pool = S.pool[0]; out.dps = Math.round(m.atk * S.pool[1]); }
      if (S.jump) out.jump = 1;
      broadcast(out);
      if (S.k === 'dash') { const e = sk.len - 0.6; sk.move = { fx: m.x, fz: m.z, tx: m.x + Math.sin(sk.a) * e, tz: m.z + Math.cos(sk.a) * e, dur: 0.32 }; }
      else if (S.k === 'leap') { const e = Math.max(0, Math.hypot(sk.x - m.x, sk.z - m.z) - 0.6), a = Math.atan2(sk.x - m.x, sk.z - m.z); sk.move = { fx: m.x, fz: m.z, tx: m.x + Math.sin(a) * e, tz: m.z + Math.cos(a) * e, dur: 0.3 }; }
    }
    function stepSkill(m, ts) {
      const sk = m.sk; sk.t += TICK;
      if (!sk.done) {
        if (sk.t >= sk.tele) { resolveSkill(m, sk, ts); sk.done = true; sk.t = 0; }
        return;
      }
      if (sk.move) {
        const k = Math.min(1, sk.t / sk.move.dur);
        m.x = sk.move.fx + (sk.move.tx - sk.move.fx) * k; m.z = sk.move.fz + (sk.move.tz - sk.move.fz) * k;
        if (k < 1) return;
      } else if (sk.t < 0.2) return;
      m.sk = null; m.atkCd = Math.max(m.atkCd, 0.9);
      m.skCd = rnd(sk.S.cd[0], sk.S.cd[1]);
    }

    // ---------- 매 틱 ----------
    function tick() {
      if (!clients.size) return;
      const ts = targetsFor();
      const players = [...clients.values()].filter((c) => c.pres.on);
      const active = [], updates = [];
      const boss = [...monsters.values()].find((q) => q.boss);
      for (const m of [...monsters.values()]) {
        if (!players.some((c) => Math.hypot(c.pres.x - m.x, c.pres.z - m.z) < 75)) continue;
        active.push(m);
        m.before = [m.x, m.z, m.ry, Math.round(m.hp), m.windup > 0 || !!(m.sk && !m.sk.done) || !!(m.sks && m.sks.length), m.stun > 0, !!m.dot, m.vuln > 0];
        if (m.dot) {
          m.dot.acc += m.dot.dps * TICK; m.dot.t -= TICK;
          if (m.dot.acc >= 1) { const d = Math.floor(m.dot.acc); m.dot.acc -= d; hurt(m, d, null); if (!monsters.has(m.i)) continue; }
          if (m.dot.t <= 0) m.dot = null;
        }
        if (m.boss) { bossTick(m, ts); continue; }
        if (m.dragon) { dragonTick(m, ts); continue; }
        // 보스에게 빨려 들어가는 조각
        if (m.feed && boss) {
          moveToward(m, boss.x, boss.z, 3.2);
          if (Math.hypot(boss.x - m.x, boss.z - m.z) < boss.r + m.r + 0.3) {
            boss.hp = Math.min(boss.mh, boss.hp + boss.mh * 0.04); boss.dirty = true;
            monsters.delete(m.i); broadcast({ t: 'mdie', i: m.i, by: [] }); bossSay('조각이 흡수되어 킹 슬라임이 회복했다!');
          }
          continue;
        }
        m.stun = Math.max(0, m.stun - TICK);
        const sx = m.x, sz = m.z; let want = 0;
        const homeD = Math.hypot(m.x - m.home.x, m.z - m.home.z);
        const dun = m.zone === 'dungeon';
        let tgt = null, best = 1e9;
        for (const t of ts) {
          if (dun ? !t.rot : t.dun) continue;
          const d = Math.hypot(t.x - m.x, t.z - m.z);
          if ((homeD > 45 && !m.summon) || d > 30) continue;
          const pri = t.id === m.aggroOn ? d - 6 : d;
          if ((d < 9 || t.id === m.aggroOn) && pri < best) { best = pri; tgt = t; }
        }
        if (!tgt) m.aggroOn = null;
        // 기절시키면 준비 중인 기술이 끊긴다
        if (m.sk && !m.sk.done && m.stun > 0) { broadcast({ t: 'mskx', i: m.i }); m.sk = null; m.skCd = rnd(3, 5); }
        if (m.sk) stepSkill(m, ts);
        else if (m.stun > 0) m.windup = 0;
        else if (tgt) {
          const dx = tgt.x - m.x, dz = tgt.z - m.z, dist = Math.hypot(dx, dz), reach = 0.9 + m.r + 0.5;
          m.atkCd -= TICK;
          const S = !m.summon && SK[m.ty];
          if (S) m.skCd = (m.skCd ?? rnd(2, 4)) - TICK;
          if (S && m.windup <= 0 && m.skCd <= 0 && dist >= S.range[0] && dist <= S.range[1] && !(m.detour && m.detour.t > 0)) startSkill(m, S, tgt, dist);
          else if (m.windup > 0) {
            turn(m, Math.atan2(dx, dz), 0.6);
            m.windup -= TICK;
            if (m.windup <= 0) {
              m.atkCd = 1.6;
              if (dist < reach + 0.9) send(tgt.id, { t: 'matk', i: m.i, to: tgt.id, atk: m.atk });
              broadcast({ t: 'matk', i: m.i, to: null }, tgt.id);
            }
          } else if (dist > reach) {
            const spd = m.D.build === 'slime' ? 2.8 : m.D.build === 'quad' ? 3.9 : 3.5;
            if (m.detour && m.detour.t > 0) { m.detour.t -= TICK; moveToward(m, m.detour.x, m.detour.z, spd); }
            else moveToward(m, tgt.x, tgt.z, spd);
            want = spd;
          } else { turn(m, Math.atan2(dx, dz), 0.6); if (m.atkCd <= 0) m.windup = 0.45; }
        } else {
          m.windup = 0;
          m.wait -= TICK;
          if (homeD > 12) m.target = { ...m.home };
          if (m.wait <= 0 && Math.hypot(m.target.x - m.x, m.target.z - m.z) < 0.6) {
            m.wait = rnd(1.5, 4); const a = rnd(0, 6.28), rr = rnd(2, 9);
            m.target = { x: m.home.x + Math.cos(a) * rr, z: m.home.z + Math.sin(a) * rr };
          }
          if (m.wait <= 0) { const spd = homeD > 20 ? 3 : 1.3; if (moveToward(m, m.target.x, m.target.z, spd) > 0) want = spd; }
          if (m.hp < m.mh && Date.now() - m.lastHit > 5000) { m.hp = Math.min(m.mh, m.hp + m.mh * 0.05 * TICK); if (m.hp >= m.mh) m.hitBy.clear(); }
        }
        if (dun) roomClamp(m, m.r); else { worldClamp(m, m.r); keepOutOfSafe(m, m.r);
          const ld = Math.hypot(m.x - LAIR.x, m.z - LAIR.z); if (ld < LAIR.r + 1) { const k = (LAIR.r + 1) / Math.max(ld, 1e-3); m.x = LAIR.x + (m.x - LAIR.x) * k; m.z = LAIR.z + (m.z - LAIR.z) * k; } }
        pushOut(m, m.r * 0.8);
        if (want > 0) {
          // 막혀서 제자리에서 조금씩 밀고 당겨지면 그냥 멈춰 있게 한다 (떨림 방지)
          if (Math.hypot(m.x - sx, m.z - sz) < 0.04) { m.x = sx; m.z = sz; }
          const moved = Math.hypot(m.x - sx, m.z - sz);
          if (moved < want * TICK * 0.35) m.stuck += TICK; else m.stuck = Math.max(0, m.stuck - TICK * 2);
          if (m.stuck > 0.6) {
            m.stuck = 0;
            if (tgt) {
              const side = Math.random() < 0.5 ? 1 : -1, dx = tgt.x - m.x, dz = tgt.z - m.z, l = Math.hypot(dx, dz) || 1;
              m.detour = { x: m.x + (-dz / l) * side * 3.5 + (dx / l) * 1.5, z: m.z + (dx / l) * side * 3.5 + (dz / l) * 1.5, t: 0.9 };
            } else { m.wait = rnd(0.5, 1.5); const a = rnd(0, 6.28), rr = rnd(2, 7); m.target = { x: m.home.x + Math.cos(a) * rr, z: m.home.z + Math.sin(a) * rr }; }
          }
        }
      }
      // 몬스터끼리 겹치지 않게
      for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
        const A = active[a], B = active[b];
        if (!monsters.has(A.i) || !monsters.has(B.i)) continue;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), mn = (A.r + B.r) * 0.9;
        if (d < mn && d > 1e-4) {
          const push = mn - d, ux = dx / d, uz = dz / d, wa = A.boss ? 0 : B.boss ? 1 : 0.5, wb = 1 - wa;
          const sp = push;
          A.x -= ux * sp * wa; A.z -= uz * sp * wa; B.x += ux * sp * wb; B.z += uz * sp * wb;
        }
      }
      for (const m of active) {
        if (!monsters.has(m.i)) continue;
        const after = [m.x, m.z, m.ry, Math.round(m.hp), m.windup > 0 || !!(m.sk && !m.sk.done) || !!(m.sks && m.sks.length), m.stun > 0, !!m.dot, m.vuln > 0];
        if (m.dirty || after.some((v, k) => v !== m.before[k])) {
          m.dirty = false;
          updates.push([m.i, r2(m.x), r2(m.z), r2(m.ry), Math.max(0, Math.round(m.hp)), (m.windup > 0 || (m.sk && !m.sk.done) || (m.sks && m.sks.length) ? 1 : 0) | (m.stun > 0 ? 2 : 0) | (m.dot ? 4 : 0) | (m.vuln > 0 ? 8 : 0)]);
        }
      }
      if (updates.length) broadcast({ t: 'mu', u: updates });
    }

    // ---------- 바깥과 주고받기 ----------
    return {
      join(id, sendFn) { clients.set(id, { send: sendFn, pres: {} }); sendFn({ t: 'mons', list: [...monsters.values()].map(pub) }); },
      leave(id) { clients.delete(id); for (const m of monsters.values()) if (m.aggroOn === id) m.aggroOn = null; },
      presence(id, p) { const c = clients.get(id); if (c) c.pres = p; },
      hit(id, d) {
        const c = clients.get(id); if (!c || !d || typeof d !== 'object') return;
        const m = monsters.get(d.i), dmg = Number(d.d);
        if (!m || !isFinite(dmg) || dmg <= 0) return;
        if (Math.hypot((c.pres.x || 0) - m.x, (c.pres.z || 0) - m.z) > 40) return;
        if (m.boss && !inRotunda(c.pres)) return;
        if (m.dragon && !inLair(c.pres)) return;
        const st = Number(d.st);
        if (isFinite(st) && st > 0) m.stun = Math.max(m.stun, Math.min(st, 4) * (m.boss ? 0.25 : m.dragon ? 0 : 1));
        if (Array.isArray(d.dot)) { const dps = Number(d.dot[0]), t = Number(d.dot[1]); if (isFinite(dps) && isFinite(t) && dps > 0) m.dot = { dps: Math.min(dps, 3000), t: Math.min(t, 10), acc: 0 }; }
        hurt(m, Math.min(dmg, 60000), id);
      },
      tick,
      TICK,
      count() { return monsters.size; },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = createSim; else root.createSim = createSim;
})(typeof self !== 'undefined' ? self : this);
