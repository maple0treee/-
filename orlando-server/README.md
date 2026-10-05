# 오를란도 3D 서버 올리기

링크만 열면 로그인 없이 바로 같이 플레이할 수 있는 오를란도 서버입니다.
GitHub에 파일을 올리고, Render(무료 호스팅)에 연결하는 순서로 진행합니다. 프로그램 설치나 명령어 입력은 필요 없어요.

## 들어 있는 파일

| 파일 | 하는 일 |
|---|---|
| `server.js` | 게임 페이지를 보여 주고, 접속자끼리 위치·직업·레벨·스킬 효과를 주고받게 해 주는 서버 |
| `package.json` | 서버를 실행하는 방법과 필요한 부품(ws) 목록 |
| `public/index.html` | 게임 본체 |
| `public/player.glb` | 캐릭터 모델 |

## 1단계 · GitHub에 파일 올리기

1. https://github.com 에 가입하고 로그인합니다.
2. 오른쪽 위 **+** → **New repository**를 누릅니다.
3. Repository name에 `orlando-server`를 넣고 **Public**을 고른 뒤 **Create repository**를 누릅니다.
4. 새 저장소 화면에서 **uploading an existing file** 링크를 누릅니다.
5. 압축을 푼 `orlando-server` 폴더 **안의** 파일과 폴더(`server.js`, `package.json`, `README.md`, `public` 폴더)를 한꺼번에 끌어다 놓습니다.
   - `public` 폴더째로 끌어다 놓아야 `public/index.html` 모양으로 올라갑니다.
6. 아래 **Commit changes**를 누릅니다.

## 2단계 · Render에 연결하기

1. https://render.com 에서 **GitHub 계정으로 가입**합니다.
2. 대시보드에서 **New +** → **Web Service**를 누릅니다.
3. GitHub 연결을 허용하고 `orlando-server` 저장소를 고릅니다.
4. 설정을 이렇게 맞춥니다.
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. **Deploy Web Service**를 누르고 몇 분 기다립니다. 로그에 `오를란도 서버 실행 중`이 보이면 완료입니다.
6. 화면 위쪽의 `https://orlando-server-xxxx.onrender.com` 같은 주소가 게임 링크입니다. 이 링크를 친구에게 보내면 됩니다.

## 같이 하는 방법

- 링크를 열고 캐릭터를 만들면 바로 같은 세계에 들어갑니다. 로그인은 필요 없습니다.
- 오른쪽 아래 **현재 접속자**에 친구 이름이 보이면 연결된 것입니다.

## 알아 둘 점

- **처음 접속이 느릴 수 있어요.** 무료 서버는 15분 동안 아무도 접속하지 않으면 잠들고, 다음 접속 때 깨어나는 데 1분쯤 걸립니다.
- **무료 전송량에 한도가 있어요.** Render 무료 계정은 한 달 전송량이 정해져 있습니다. 처음 접속할 때 캐릭터 모델(약 5MB)을 받고, 다시 접속할 때는 브라우저에 저장된 것을 써서 거의 들지 않습니다. 넘으면 서비스가 멈출 수 있으니 Render 대시보드에서 사용량을 가끔 확인하세요.
- **저장은 각자 브라우저에 됩니다.** 캐릭터는 접속한 브라우저에 저장되므로 다른 기기에서는 새로 만들어야 합니다.
- **몬스터는 아직 각자 따로입니다.** 서로의 모습·이름·스킬 효과는 보이지만, 같은 몬스터를 함께 잡지는 않습니다.

## 게임을 고친 뒤 다시 올리기

새 `index.html`(또는 다른 파일)을 받으면 GitHub 저장소에서 **Add file → Upload files**로 같은 이름의 파일을 다시 올리고 **Commit changes**를 누르세요. Render가 알아서 새 버전으로 바꿉니다.
