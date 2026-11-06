# 오를란도

브라우저에서 링크만 열면 로그인 없이 바로 같이 플레이할 수 있는 3D 판타지 RPG입니다.

**지금 플레이하기: https://orlando.io.kr**

## 같이 하는 방법

- 링크를 열고 캐릭터를 만들면 바로 같은 세계에 들어갑니다. 로그인은 필요 없습니다.
- 오른쪽 아래 **현재 접속자**에 친구 이름이 보이면 연결된 것입니다.
- 몬스터와 보스는 서버가 움직이므로, 같은 사냥터에 있는 사람끼리 같은 몬스터를 함께 잡습니다.

## 들어 있는 파일

| 파일 | 하는 일 |
|---|---|
| `server.js` | 게임 페이지와 파일을 보여 주고, `/ws`로 들어온 접속자끼리 위치·스킬 효과·채팅을 주고받게 해 주는 서버. `/health`는 서버 상태를 한 줄로 알려 줍니다. |
| `sim.js` | 몬스터와 보스를 서버에서 움직이는 코드 (게임 안의 코드와 같음) |
| `shared.js` | 지도·지역·몬스터 정보처럼 게임과 서버가 함께 쓰는 데이터 |
| `colliders.json` | 서버가 쓰는 충돌(벽·건물) 정보 |
| `package.json` | 서버를 실행하는 방법(`npm start`)과 필요한 부품(`ws`) 목록 |
| `public/index.html` | 게임 본체 (three.js) |
| `public/player.glb`, `public/pmodel/` | 캐릭터 모델 |
| `public/models/*.glb.wasm` | 풍경·건물·몬스터 모델 (내용은 `.glb`, 이름 끝만 `.wasm`) |
| `public/npcbake/`, `public/citbake/` | 미리 구워 둔 NPC·시민 데이터 |
| `public/music/`, `public/sfx.json`, `public/fonts/`, `public/icon/` | 음악, 효과음, 글꼴, 아이콘 |
| `public/site/*.html`, `site-src/` | 게임 소개·시작 안내·직업·세계·소식·질문·개인정보처리방침·이용약관·문의 페이지 (`/about` 같은 주소). 글은 `site-src/pages.js`에서 고치고 `node site-src/build.js`로 다시 굽습니다. 애드센스 심사와 검색 노출에 필요합니다. |
| `public/robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `og.jpg`, `ads.txt` | 검색·공유·앱 설치용 파일 |

저장소 맨 위의 `.github/workflows/keepalive.yml`은 10분마다 `https://orlando.io.kr/health`를 불러 무료 서버가 잠들지 않게 합니다.

## 배포 방식

- 게임은 `orlando-server` 폴더를 실행하는 Node 서버(Render 웹 서비스)에서 돌아가고, `orlando.io.kr` 도메인이 그 서버에 연결되어 있습니다.
- `main` 브랜치에 올리면 서버가 알아서 새 버전으로 바뀝니다. 설정은 **Build Command** `npm install`, **Start Command** `npm start`, Node 18 이상입니다.
- 서버는 `RENDER_EXTERNAL_URL`이 있으면 10분마다 자기 자신의 `/health`를 부르고, 위의 GitHub Actions가 예비로 한 번 더 부릅니다.

## 게임을 고친 뒤 올릴 때 알아 둘 점

- **서버 버전 맞추기.** `server.js`의 `VERSION`과 `public/index.html`의 `SERVER_VER`는 같은 숫자여야 합니다. 서버 쪽 파일(`server.js`, `shared.js`, `sim.js`, `colliders.json`)을 바꿨다면 두 숫자를 함께 올리세요. 다르면 게임 화면에 "서버 파일이 게임과 맞지 않"는다는 안내가 뜹니다.
- **게임 코드는 jsDelivr에서 받아요.** 서버 전송량을 아끼려고, 서버는 `index.html`의 화면 틀만 보내고 큰 게임 코드는 jsDelivr(무료 CDN)에 있는 **지금 배포된 커밋**의 `index.html`에서 받게 합니다. 배포된 커밋 번호는 Render가 알려 주므로(`RENDER_GIT_COMMIT`) 따로 손댈 것은 없습니다. 받은 코드는 지문(sha256)이 맞을 때만 쓰고, 안 되면 서버의 `/game-src.html`에서 받습니다. 그래서 이 저장소는 공개(Public)로 두어야 합니다.
- **큰 파일은 고정된 커밋에서 받아요.** `models/`, `npcbake/`, `pmodel/`, `citbake/`, `music/`, `player.glb`는 `public/index.html`의 `ORLANDO_CDN` 주소(이 저장소의 특정 커밋을 가리키는 jsDelivr 주소)에서 받고, 실패하면 서버에서 받습니다. 이 폴더의 파일을 바꾸거나 새로 넣었다면 먼저 커밋해 올린 뒤, `ORLANDO_CDN`의 커밋 번호를 그 커밋으로 바꿔 다시 올리세요. 그대로 두면 예전 파일이 보입니다.
- **새 종류의 파일은 서버 목록에 넣어야 해요.** `server.js`는 정해 둔 파일과 폴더(이름 규칙에 맞는 파일)만 보여 줍니다. 새 폴더나 새 확장자를 쓰려면 `server.js`의 목록에도 추가하세요.

## 내 컴퓨터에서 실행하기

```bash
cd orlando-server
npm install
npm start
```

`http://localhost:3000`을 열면 됩니다. (`PORT` 환경 변수로 포트를 바꿀 수 있습니다.) 내 컴퓨터에서는 커밋 번호가 없으므로 게임 코드를 jsDelivr에서 나눠 받지 않고 `index.html`을 통째로 보냅니다.

## 알아 둘 점

- **저장은 각자 브라우저에 됩니다.** 캐릭터는 접속한 브라우저에 저장되므로 다른 기기에서는 새로 만들어야 합니다.
- **처음 접속이 조금 느릴 수 있어요.** 처음에는 모델과 데이터를 받느라 시간이 걸리고, 다시 접속할 때는 브라우저에 저장된 것을 씁니다.

## 업데이트를 올리는 순서 (시험판 → 본 서버)

- 새 업데이트는 먼저 시험용 브랜치 **`dev`** 에 합칩니다. 본 서버(`main`)에는 바로 들어가지 않습니다.
- `dev` 의 게임은 claude.ai 아티팩트 **"오를란도 시험판"** 으로 미리 해 볼 수 있습니다. 올리는 법: `node orlando-server/tools/preview.js <출력 폴더> [지난번 커밋]`
- 매일 **오전 4시(한국 시간)** 에 `.github/workflows/nightly-release.yml` 이 그때까지 `dev` 에 들어온 것을 `main` 으로 한 번에 합치고, 그러면 Render 가 본 서버를 새로 배포합니다. GitHub 예약 실행이 자주 늦거나 빠져서 08:37 까지 여러 번 다시 걸어 두었고, 이미 올렸으면 그냥 끝납니다.
- 급한 고침만 `main` 에 바로 합칩니다. 그러면 `.github/workflows/sync-dev.yml` 이 그 고침을 `dev` 에도 곧바로 섞습니다.
