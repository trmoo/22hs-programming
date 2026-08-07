# 참고 사이트 분석 — wonedu.org 「인공지능 기초」 웹교과서

- 분석 대상: `https://wonedu.org/hs-ai/` (및 비교용으로 `/`, `/hs-info/`, 공통 에셋)
- 분석 일자: 2026-08-04
- 분석 방법: WebFetch로 페이지 열람 + 원본 HTML/CSS/JS 직접 확인
- 실제로 읽은 파일
  - `/hs-ai/index.html` (과목 홈)
  - `/hs-ai/01-인공지능의이해/index.html` (단원 열기)
  - `/hs-ai/01-인공지능의이해/lesson01.html` ~ `lesson04.html` (차시)
  - `/hs-ai/01-인공지능의이해/closing.html` (단원 마무리)
  - `/index.html` (포털)
  - `/assets/css/textbook.css`, `/assets/js/common.js`, `/assets/js/pyrunner.js`
  - `/hs-info/03-알고리즘과프로그래밍/lesson02.html` (Python 실행기 사용 예)

> 이 문서는 **구조 분석 기록**이다. 우리 「프로그래밍」 사이트에 그대로 적용할 결정 사항은 `PLAN.md`에 따로 적었다.

---

## 1. 정보 구조

### 1-1. 최상위 (포털)

`wonedu.org/` 한 장짜리 랜딩 페이지가 모든 과목 사이트의 허브다. 내비게이션은 **같은 페이지 내 앵커**뿐이고, 과목으로는 카드 링크로 이동한다.

| 구분 | 내용 |
|---|---|
| 상단 메뉴 | `#subjects` `#physical-ai` `#features` `#about` — 전부 앵커 |
| 학교급 점프 버튼 | `#elementary` `#middle` `#high` |
| 과목 카드 | `/ms-korean/` `/ms-english/` … `/hs-info/` `/hs-ai/` `/hs-ds/` `/hs-sw/` (모두 `target="_blank"`) |

고등학교 정보과 계열로 이미 4개 사이트가 있다.

```
/hs-info/   고등학교 정보        (일반 선택)
/hs-ai/     인공지능 기초        (진로 선택)
/hs-ds/     데이터 과학          (진로 선택)
/hs-sw/     소프트웨어와 생활    (융합 선택)
```

→ **「프로그래밍」은 아직 없다.** 같은 규칙을 따른다면 `/hs-prog/` 형태의 새 디렉터리가 자연스러운 자리다.

### 1-2. 단원–차시 계층

깊이 3단의 아주 단순한 트리다. 사이드바 트리는 **없고**, 각 계층의 `index.html`이 그 계층의 목차 역할을 한다.

```
과목 홈            /hs-ai/index.html
└─ 단원 열기       /hs-ai/01-인공지능의이해/index.html
   ├─ 1차시        …/lesson01.html
   ├─ 2차시        …/lesson02.html
   ├─ 3차시        …/lesson03.html
   ├─ 4차시        …/lesson04.html
   └─ 단원 마무리  …/closing.html
```

「인공지능 기초」의 실제 단원 구성(과목 홈에서 확인):

| 단원 | 폴더 | 성취기준 범위 |
|---|---|---|
| 1 인공지능의 이해 | `01-인공지능의이해/` | 12인기01-01 ~ 01-05 |
| 2 인공지능과 학습 | `02-인공지능과학습/` | 12인기02-01 ~ 02-06 |
| 3 인공지능의 사회적 영향 | `03-인공지능의사회적영향/` | 12인기03-01 ~ 03-04 |
| 4 인공지능 프로젝트 | `04-인공지능프로젝트/` | 12인기04-01 ~ 04-04 |

**차시 수 = 성취기준 수가 아니다.** 1단원은 성취기준 5개를 차시 4개로 묶었다(2차시가 `12인기01-02`, `12인기01-03`을 함께 담당). 즉 **성취기준 → 차시는 n:1도 허용**하는 설계다. 이 대응은 각 차시 hero의 `std-badge`와 단원 열기의 성취기준 표에 명시된다.

### 1-3. URL 패턴

```
/{과목슬러그}/{2자리번호}-{한글단원명}/{lesson NN | index | closing}.html
```

| 특징 | 확인된 사실 | 시사점 |
|---|---|---|
| 확장자 노출 | 전부 `.html`, 링크에도 `index.html`을 명시 | 서버 rewrite 의존 없음 |
| 폴더명 | 한글 + 공백 제거 (`01-인공지능의이해`) | URL에서 퍼센트 인코딩됨. 가독성 ↔ 인코딩 트레이드오프 |
| 링크 방식 | 전부 상대 경로(`../index.html`, `../../assets/...`) | `file://`로 열어도 동작 (common.js 주석에 의도 명시) |
| 예외 | 챗봇 위젯만 절대 경로 `/chatbot-widget.js?v=…` | |
| 이미지 | 차시 폴더 하위 `img/alan-turing.jpg` 등 | 단원 폴더 = 콘텐츠 단위 |

### 1-4. 페이지 간 이동 수단

사이드바 대신 세 가지로 해결한다.

1. **sticky 브레드크럼** — `.tb-header .crumb`, 계층 전체를 항상 노출
   `🏠 › 인공지능 기초 › 1단원 인공지능의 이해 › 1차시`
2. **단원 홈/단원 목록 버튼** — 헤더 우측 `.home-btn` (한 단계 위로)
3. **하단 이전/다음** — `.nav-foot`, 차시 제목까지 함께 표시해 선형 학습 유도

---

## 2. 한 차시 페이지의 구성 요소 (순서대로)

`lesson01.html`~`lesson04.html`이 예외 없이 같은 순서를 지킨다.

| 순서 | 블록 | 마크업 | 내용 |
|---|---|---|---|
| 1 | 헤더 | `header.tb-header` | 브레드크럼 + 단원 홈 버튼 |
| 2 | **히어로** | `section.hero` | `eyebrow`(1단원·1차시) → `h1`(2행 제목) → `p.lead`(2~3문장 도입) → `std-badge`(성취기준 코드) → `chip`(핵심 키워드 3~4개) |
| 3 | **학습 목표** | `.box.box-think` | "…할 수 있다" 형태 3개 (성취기준을 학생 말로 풀어 쓴 것) |
| 4 | **생각 열기** | `.section` (`sec-num`=🤔) | 사진 1장(`figure.img-figure` + 출처 표기) → 이야기형 도입 2단락 → `.box.box-think`(열린 발문) |
| 5 | **개념 1~3** | `.section` (`sec-num`=1,2,3…) | 본문 → `span.term[data-desc]`(용어 툴팁) → `.card-grid > .mini-card`(개념 3분할) → **시뮬레이터/게임 패널** → 표(`table.tb`) → `.box.box-tip`(해석·주의) |
| 6 | **확인 문제** | `.section` (`sec-num`=✅) + `.quiz` | 4문항, **즉시 채점**. 객관식 3~4지선다 + OX 혼합, 문항마다 `data-explain` 해설 |
| 7 | **더 알아보기** | `.section` (`sec-num`=➕) | `<details class="more-box">` 4개. `plus-tag`로 분류(인물/철학/최신/생각) |
| 8 | 하단 내비 | `.nav-foot` | 이전(단원 열기) / 다음(2차시 제목) |
| 9 | 푸터 | `footer.tb-footer` | `인공지능 기초 · 1단원 … — 1차시` |

### 2-1. 단원 열기 페이지 (`index.html`)

| 순서 | 블록 | 내용 |
|---|---|---|
| 1 | 히어로 + `<canvas class="hero-canvas">` | 단원 주제를 표현하는 배경 애니메이션(1단원=탐색 트리가 뻗어 나가는 그림) |
| 2 | **핵심 아이디어** 💡 | 단원을 관통하는 큰 생각 2개 (`mini-card`) |
| 3 | **이 단원의 성취기준** 🎯 | `std-row` = `std-badge` + 성취기준 원문(핵심어 `<strong>` 강조) |
| 4 | **흥미 유발 활동** 🕹️ | "등굣길에 숨은 AI 6곳 찾기" — 클릭형 히든 스팟 게임 |
| 5 | **학습 로드맵** 🗺️ | 차시 카드 목록. 각 카드에 제목 + 다룰 개념 + 🕹️ 활동명까지 미리 노출 |
| 6 | **출발 전 점검** 🩺 | 선수 과목(「정보」) 연계 진단 퀴즈 3문항 + "두 기둥 미리 보기" 팁 박스 |
| 7 | 하단 내비 | 단원 목록 / 1차시 |

### 2-2. 단원 마무리 페이지 (`closing.html`)

| 순서 | 블록 | 내용 |
|---|---|---|
| 1 | **핵심 정리 — 개념 지도** | `mm-node` / `mm-detail` 클릭형 개념 지도 |
| 2 | **단원평가** | `.quiz[data-graded]` — 10문항(객관식 8 + OX 2), **일괄 채점**. `[채점하기]` → 점수판 + 전체 해설, `[다시 풀기]`로 초기화 |
| 3 | **서·논술형 자기 점검** | 서술 문항 + `[예시 답안 보기]` 토글 |
| 4 | **성취기준 자가평가** | 성취기준별 3단 척도(😎🙂😅), **localStorage 저장** |
| 5 | **진로 연계** | 이 단원이 통하는 직업 소개 |
| 6 | 되짚기 팁 박스 | 헷갈리는 개념 → 해당 차시 시뮬레이터로 되돌아가는 링크 |

### 2-3. 서술 톤

- 학생을 "여러분"으로 부르고 문장은 해요체. 개념 설명 전에 **항상 이야기/질문이 먼저** 온다.
- 성취기준의 동사(비교·분석한다, 설계한다, 적용한다)를 본문에서 **명시적으로 되짚는다** — "성취기준이 요구하는 **비교·분석**은 …".
- 타 과목·타 단원과의 연결을 계속 상기시킨다("정보 4단원에서 배운 …", "2단원 딥러닝에서 자세히!").

---

## 3. 학습자 인터랙션 요소

핵심은 `assets/js/common.js` 하나에 **11개 인터랙션 엔진**을 모아 두고, 각 페이지는 **정해진 클래스/`data-` 속성만 쓰면 자동으로 살아나는** 구조다. 초기화는 `DOMContentLoaded` 한 번.

| # | 기능 | 마크업 계약 | 동작 |
|---|---|---|---|
| 1 | 읽기 진행 바 | (자동 삽입 `#scroll-progress`) | 스크롤 비율을 상단 3.5px 그라데이션 바로. `requestAnimationFrame` 스로틀 |
| 2 | 스크롤 리빌 | `.reveal` | IntersectionObserver(threshold .12)로 `.in` 부여. 미지원 브라우저는 즉시 표시 |
| 3 | 즉시 채점 퀴즈 | `.q-item[data-explain] > .q-choices > .q-choice[data-correct]` + `.q-feedback` | 클릭 즉시 정답/오답 표시, 오답이면 정답 위치도 표시, 해설 출력, 문항 잠금 |
| 4 | 일괄 채점 퀴즈 | `.quiz[data-graded]` + `[data-grade-btn]` `[data-retry-btn]` `.score-board` | 선택만 모아 두고 채점. 미응답 있으면 `alert`로 차단. 점수·격려 메시지 4단계, 다시 풀기 지원 |
| 5 | 분류 게임 | `[data-classify]` + `.c-item[data-bin]` / `.bin[data-bin]` | 항목 선택 → 통 클릭. 정/오답 색으로 누적, 진행률·결과 표시, 리셋 버튼 |
| 6 | 탭 | `[data-tabs]` + `.tab-btn` / `.tab-panel` | 인덱스 매칭 방식 |
| 7 | 용어 툴팁 | `span.term[data-desc="설명"]` | hover/click으로 `.term-pop` 생성. 화면 오른쪽 넘침 보정, 스크롤 시 닫힘 |
| 8 | 단계 스텝퍼 | `[data-stepper]` + `.step-card[data-panel="id"]` → `#id.step-detail` | 단계 카드 클릭 → 상세 패널 전환 |
| 9 | 예시 답안 토글 | `button[data-reveal="#id"]` | `.on` 토글 + 버튼 라벨 자동 전환("보기"↔"닫기") |
| 10 | 성취기준 자가평가 | `.self-assess[data-sa-key]` > `.sa-item[data-sa-id]` > `.sa-opt[data-val]` | **`localStorage["tb-sa-<key>"]`에 JSON 저장/복원** — 사이트에서 유일한 영속 상태 |
| 11 | 숫자 카운터 | `[data-counter][data-target][data-suffix]` | 화면 진입 시 1.4초 ease-out 카운트업 |
| + | 맨 위로 | (자동 삽입) | 스크롤 600px 초과 시 페이드 인 |

### 3-1. 코드 실행 (Python)

**「인공지능 기초」 1단원에는 코드 블록이 아예 없다**(`<pre>` 0개). 코드 실행기는 별도 스크립트 `assets/js/pyrunner.js`로 존재하고, `/hs-info/03-알고리즘과프로그래밍/lesson02.html`·`lesson03.html`에서 실제로 쓰인다.

```html
<div class="pyrun" data-pyrun data-caption="버블 정렬 — 직접 실행하고 고쳐 보세요">
  <textarea class="py-code">data = [5, 2, 4, 1, 3]
...</textarea>
</div>
```

구현 요점 (그대로 참고할 가치가 큼):

| 항목 | 구현 |
|---|---|
| 엔진 | **Pyodide 0.26.4** — `https://cdn.jsdelivr.net/pyodide/v0.26.4/full/` |
| 로딩 시점 | **최초 [▶ 실행] 클릭 시 지연 로드**. 페이지 로드 비용 0 |
| 상태 안내 | "⏳ 파이썬 엔진 내려받는 중… (최초 1회, 5~15초)" → "▶ 실행 중…" → "✅ 실행 완료" |
| 에디터 | 순수 `<textarea>`. Tab=공백 4칸, 높이 자동(최대 420px), `spellcheck=false`, `↺ 처음 코드로` |
| 출력 | `setStdout`을 줄 단위로 버퍼링, `setStderr`은 빨간색 |
| `input()` | `setStdin` → `window.prompt()`. 개행 없이 끝난 출력(=질문)을 프롬프트 문구로 재사용하는 세심한 처리 |
| 오류 | 트레이스백을 **그대로 노출** + "메시지를 읽고 코드를 고쳐 보세요" |
| 동시 실행 | 전역 `running` 플래그로 연타·타 블록 동시 실행 차단 |
| 오프라인 | 스크립트 로드 실패를 `OFFLINE`으로 구분 → "학교 컴퓨터실의 파이썬(IDLE)에 붙여 넣어 보세요" 안내, 본문 학습은 계속 가능 |

**C 언어 실행기는 없다.** 사이트 전체에서 확인되지 않았다.

### 3-2. 진도 체크 — 없음

| 기능 | 유무 |
|---|---|
| 차시 완료 체크 / 진도율 | ❌ 없음 |
| 로그인·계정 | ❌ 없음 |
| 퀴즈 점수 저장 | ❌ 없음 (새로고침하면 사라짐) |
| 성취기준 자가평가 | ✅ localStorage (유일) |
| 읽기 진행률 | ✅ 스크롤 바 (세션 한정) |

### 3-3. 페이지 고유 인터랙션 (인라인 스크립트)

공통 엔진으로 안 되는 것은 **해당 차시 파일 안에 IIFE로 직접 작성**한다. 재사용 안 할 코드를 공통 파일에 넣지 않는다는 원칙.

| 위치 | 인터랙션 | 태그 |
|---|---|---|
| 단원 열기 | 히어로 탐색 트리 canvas 애니메이션 / 등굣길 숨은 AI 6곳 찾기 | — |
| 1차시 | 사람 vs AI 판별 게임(6문항, 점수·재도전) | `GAME` |
| 1차시 | 분야별 AI 탐험(6분야 버튼 → 상세) | `INTERACTIVE` |
| 2차시 | 미로 탐색 시뮬레이터(BFS·DFS·휴리스틱 대결) | `INTERACTIVE` |
| 3차시 | A* 길찾기 시뮬레이터(장애물 편집·g/h/f 표시) | `INTERACTIVE` |
| 4차시 | 규칙 기반 추론 엔진(동물 알아맞히기) + 사실/규칙 분류 게임 | `INTERACTIVE` |

시뮬레이터는 전부 `.sim-panel` 껍데기를 쓴다 — **맥OS 창 흉내(●●● 점 3개) + 제목 + 태그 배지 + 설명 + 스테이지 + 컨트롤 + 로그창(`.sim-log`)**. 로그창이 "지금 무슨 일이 일어났는지"를 문장으로 알려 주는 게 핵심 장치다.

---

## 4. 레이아웃 · 타이포 · 색상

### 4-1. 레이아웃

| 항목 | 값 |
|---|---|
| 기본 골격 | **1단(단일 컬럼) 중앙 정렬**. 사이드바·우측 목차 없음 |
| 본문 폭 | `--maxw: 1000px`, `.wrap { padding: 0 24px }` |
| 헤더 | `position: sticky; top: 0`, `rgba(255,255,255,.92)` + `backdrop-filter: blur(12px)` |
| 섹션 간격 | `.section { margin-bottom: 72px }`, `main { padding: 56px 0 30px }` — **여백이 매우 큼** |
| 그리드 | `.card-grid { repeat(auto-fit, minmax(230px,1fr)) }`, 카드가 정확히 4개면 `:has()`로 2×2 강제 |
| 반응형 | 브레이크포인트 **하나뿐 (`max-width: 760px`)**. 본문 16px, 히어로 패딩 축소, 모든 2열 그리드 1열화 |
| 인쇄 | `@media print`로 헤더·버튼·`.nav-foot`·**`.sim-panel` 숨김**, 배경 흰색 |

### 4-2. 타이포그래피

| 항목 | 값 |
|---|---|
| 본문 폰트 | **Pretendard Variable** (jsDelivr CDN, dynamic-subset) → 시스템 폰트 폴백 |
| 코드 폰트 | `JetBrains Mono, D2Coding, Cascadia Code, Consolas` |
| 본문 | `17px / line-height 1.75` (모바일 16px) |
| 한글 처리 | **`word-break: keep-all`** + `overflow-wrap: break-word` — 어절 단위 줄바꿈 |
| 제목 | `h1~h4 { font-weight: 800; line-height: 1.35 }`, 히어로 `h1`은 `clamp(1.9rem, 4.5vw, 3rem)` + `letter-spacing: -.02em` |
| 강조 | 굵기 800~900을 아낌없이 사용. 본문 중 핵심어는 `<strong>` |
| 성취기준 배지 | **모노스페이스** + 800 굵기 → 코드성 정보라는 신호 |
| 이모지 | 섹션 번호·박스 라벨·버튼에 상시 사용 (별도 아이콘 세트 없음) |

### 4-3. 색상 — CSS 변수 + 과목별 테마

`:root`에 중립 토큰을 두고, **`body[data-subject]` 하나로 과목 색을 갈아 끼운다.**

```css
body[data-subject="info"] { --c-primary:#2563eb; --c-accent:#0891b2; }  /* 정보 — 파랑 */
body[data-subject="ai"]   { --c-primary:#7c3aed; --c-accent:#db2777; }  /* AI — 보라 */
body[data-subject="ds"]   { --c-primary:#0d9488; --c-accent:#2563eb; }  /* 데이터 과학 — 청록 */
body[data-subject="sw"]   { --c-primary:#ea580c; --c-accent:#0d9488; }  /* SW와 생활 — 주황 */
```

| 토큰 | 값 | 용도 |
|---|---|---|
| `--c-bg` / `--c-surface` | `#f6f8fb` / `#ffffff` | 살짝 푸른 회색 배경 + 흰 카드 |
| `--c-text` / `-soft` / `-faint` | `#1e293b` / `#51607a` / `#8b97ad` | 순검정 아님 (slate 계열) |
| `--c-border` | `#e3e9f2` | |
| `--ok` `--warn` `--bad` | `#16a34a` `#d97706` `#dc2626` (+ `-soft` 배경) | 채점·경고 |
| `--radius` | `16px` (작은 것 `10px`, 칩은 `99px`) | 전반적으로 둥글둥글 |
| 그림자 | 2단(`--c-shadow`, `--c-shadow-lg`), hover 시 `translateY(-4px)` |

핵심 시각 장치 세 가지:

1. **다크 히어로** — `radial-gradient` 2겹(accent/primary를 `color-mix`로 투명화) + `linear-gradient(135deg, #0b1730, #14224a, #0e1b3a)`. 흰 텍스트. 페이지마다 이 어두운 띠로 시작해 리듬을 만든다.
2. **섹션 번호 뱃지** — 46px 라운드 사각형에 `primary→accent` 대각 그라데이션 + 컬러 그림자. 숫자와 이모지를 섞어 씀.
3. **다크 시뮬레이터 패널** — `.sim-panel`, `.pyrun`은 본문(라이트)과 정반대인 `#0f1d3d`·`#0a1228` 계열. "여기는 만지는 곳"이라는 신호. `pre` 코드블록도 `#0f172a`.

정보 박스는 `.box` + 변형 4종(`box-think` 🤔 / `box-tip` 💡 / `box-info` 🔦 / `box-warn` ⚠️ / `box-story`)에 `.box-label`로 라벨을 붙인다.

모던 CSS를 전제한다 — `color-mix(in srgb, …)`, `:has()`, `aspect-ratio`, `backdrop-filter`. 최신 크롬 기준이며 다크 모드 대응은 없다.

---

## 5. 추정 기술 스택

### 5-1. 확인된 것

| 계층 | 실제 |
|---|---|
| 빌드 | **없음.** 순수 정적 HTML 수작업. `common.js` 주석에 *"빌드 없이 `file://`에서도 동작하도록 일반 스크립트로 작성"*이라고 의도가 박혀 있다 |
| 프레임워크 | **없음.** React/Vue/Svelte 흔적 0, 번들 파일 0, `<script type="module">` 0 |
| 정적 사이트 생성기 | **없음.** generator meta 태그 없음. 폴더/파일 구조가 곧 라우팅 |
| JS | ES5 스타일 바닐라 (`var`, IIFE, `"use strict"`). 프로미스·`IntersectionObserver`·`localStorage`·Canvas 2D 사용 |
| CSS | 공통 `assets/css/textbook.css`(약 34KB, 단일 파일) + 페이지별 `<style>`. **Tailwind·Bootstrap 등 프레임워크 없음.** CSS 변수 기반 자체 디자인 시스템 |
| 폰트 | Pretendard Variable @ jsDelivr |
| Python 실행 | **Pyodide 0.26.4** @ jsDelivr (지연 로드) |
| 호스팅/CDN | **Cloudflare** (`/cdn-cgi/scripts/.../email-decode.min.js`, 이메일 난독화 자동 삽입) |
| 부가 위젯 | 자체 `/chatbot-widget.js?v=1785412527` (`defer`) — 포털에서 "AI 튜터 챗봇"으로 소개 |
| 접근성 | `lang="ko"`, `aria-label`(홈 링크·맨위로), `<figure>/<figcaption>`, 시맨틱 `header/main/footer/nav/details` |

### 5-2. 파일 구조 추정

```
/
├─ index.html                    포털
├─ chatbot-widget.js
├─ assets/
│  ├─ css/textbook.css           디자인 시스템 (전 과목 공용)
│  └─ js/
│     ├─ common.js               인터랙션 엔진 11종
│     └─ pyrunner.js             Pyodide 실행기
├─ hs-ai/
│  ├─ index.html
│  └─ 01-인공지능의이해/
│     ├─ index.html  lesson01~04.html  closing.html
│     └─ img/*.jpg
├─ hs-info/ hs-ds/ hs-sw/        같은 규칙
└─ ms-*/                         중학교 과목
```

### 5-3. 이 스택의 함의

**장점** — 의존성 거의 0, 학교 전산실에서 깨질 게 없음, `file://`·USB 배포 가능, 차시 하나가 파일 하나여서 교사가 직접 고치기 쉽고, 인쇄가 자연스럽게 동작.

**대가** — 차시마다 헤더/푸터/브레드크럼이 **손으로 복제**된다(디자인 변경 시 전 파일 수정). 전체 검색·필터·목차 자동 생성 같은 **데이터 기반 기능이 불가능**하다. 성취기준 코드는 HTML 안에 흩어진 텍스트라 기계가 읽을 수 없다. 차시가 늘면 유지보수 비용이 선형으로 증가한다.

---

## 6. 우리 「프로그래밍」 사이트로 가져올 것 / 바꿀 것

### 가져올 것

1. **`data-` 속성 계약 + 자동 초기화 엔진** — 콘텐츠 작성자가 클래스만 쓰면 인터랙션이 붙는 구조. 매우 좋다.
2. **성취기준 코드를 히어로 배지로 상시 노출** + 단원 열기의 성취기준 원문 표. 우리 프로젝트의 1:1 매핑 원칙과 정확히 맞는다.
3. **Pyodide 지연 로드 + 오프라인 폴백 + 상태 문구** — pyrunner.js의 설계는 거의 그대로 채택할 만하다.
4. **다크 실행 패널 대비** — "읽는 곳"과 "만지는 곳"의 시각적 분리.
5. **차시 페이지의 8단 리듬** (도입 → 개념 → 활동 → 확인 문제 → 더 알아보기 → 이전/다음).
6. **한글 조판 디테일** — `word-break: keep-all`, 17px/1.75, Pretendard.
7. **인쇄 CSS** — 학교 현장에서 유인물로 쓰인다.
8. **`data-subject` 테마 토큰 패턴** — 우리는 Python/C 모드 색 구분에 응용할 수 있다.

### 바꿀 것

| 참고 사이트 | 우리 요구 |
|---|---|
| 1단 레이아웃, 사이드바 없음 | **3단 (좌 단원 트리 / 본문 / 우 목차)** — 레이아웃부터 다시 설계 |
| 성취기준이 HTML 안 텍스트 | **데이터화 필수** (검색·필터·매핑 검증) |
| 출판사 개념 없음 | **출판사 대조표 + 라벨 전환** 신규 |
| 차시 전면 수작업 복제 | **템플릿/생성 계층 도입** |
| 코드 블록 거의 없음, C 없음 | **Python/C 모드 전환 실행기가 핵심 기능** |
| 진도 체크 없음 | 요구사항에는 없지만 자가평가 수준의 localStorage는 검토 |

---

## 참고 링크

- [wonedu.org 포털](https://wonedu.org/)
- [인공지능 기초 과목 홈](https://wonedu.org/hs-ai/)
- [1단원 열기](https://wonedu.org/hs-ai/01-%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%EC%9D%98%EC%9D%B4%ED%95%B4/index.html)
- [1차시](https://wonedu.org/hs-ai/01-%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%EC%9D%98%EC%9D%B4%ED%95%B4/lesson01.html)
- [공통 디자인 시스템 CSS](https://wonedu.org/assets/css/textbook.css)
- [인터랙션 엔진 JS](https://wonedu.org/assets/js/common.js)
- [Pyodide 실행기 JS](https://wonedu.org/assets/js/pyrunner.js)
- [Python 실행기 사용 예 (고등 정보 3단원 2차시)](https://wonedu.org/hs-info/03-%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98%EA%B3%BC%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D/lesson02.html)
