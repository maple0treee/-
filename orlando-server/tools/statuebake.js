#!/usr/bin/env node
/*
 * 석상 굽기: 거리 함수로 한 덩어리로 빚은 석상(tools/statuebake/*.js)의 겉면을 뽑아 대리석 결·그늘을 칠하고,
 * 면을 줄여 public/statue/<이름>.json 에 굽는다. 게임은 석상이 있는 곳을 지을 때 이 파일을 받아 갈아 끼운다.
 * 몬스터 굽기 도구(tools/monbake)를 그대로 쓴다. 가까이 볼 모양(lod 0)과 멀리서 볼 모양(lod 1)을 같이 담는다.
 *
 * 쓰는 법:
 *   cd <아무 빈 폴더> && npm i meshoptimizer@0.21.0   # 한 번만
 *   NODE_PATH=<그 폴더>/node_modules node orlando-server/tools/statuebake.js [seagod dolphin_bronze dolphin_top]
 *   (H=.005 처럼 빚는 칸 크기를 바꿀 수 있다. 작을수록 곱고 느리다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { bakeModel } = require('./monbake/bake');
const DL = () => require('./statuebake/dolphin');
const MODELS = { seagod: () => require('./statuebake/seagod').seaGod(), dolphin_bronze: () => DL().fountainBronze(), dolphin_top: () => DL().fountainTop() };
const OUT = process.env.OUT || path.join(__dirname, '..', 'public', 'statue');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of (process.argv.length > 2 ? process.argv.slice(2) : Object.keys(MODELS))) {
    const t0 = Date.now(), model = MODELS[t]();
    const r = await bakeModel(model, { h: +(process.env.H || .005), log: true });
    r.t = t;
    for (const l of r.lod) for (const p of l) { delete p.S; delete p.W; }   /* 석상은 움직이지 않아 뼈가 필요 없다 */
    fs.writeFileSync(path.join(OUT, t + '.json'), JSON.stringify(r));
    console.log(t, ((Date.now() - t0) / 1000).toFixed(0) + '초', r.lod.map(l => l.map(p => p.g + ':' + p.tri).join(' ')).join(' / '));
  }
})();
