/**
 * Python 실행기 — 브라우저 쪽 조종 계층
 *
 * 워커(public/runner/py-worker.js)를 하나만 만들어 페이지 안의 모든 예제가
 * 나눠 쓴다. 예제마다 워커를 띄우면 Pyodide 를 예제 수만큼 내려받게 된다.
 *
 * 지키는 것 (PLAN.md Phase 4)
 *   - 지연 로드: 첫 [실행] 을 누르기 전에는 아무것도 내려받지 않는다
 *   - 시간 제한: 무한 루프는 워커를 죽여 끊는다
 *   - 동시 실행 차단: 한 번에 하나만 돈다
 *   - 실패해도 본문 학습을 막지 않는다 (CLAUDE.md 6장 9번)
 */

/** 이 판으로 고정한다. 학교에서 어제 되던 것이 오늘 안 되는 일을 막는다. */
export const PYODIDE_VERSION = '314.0.3';

/** 한 번 실행에 허용하는 시간. 넘으면 무한 루프로 보고 끊는다. */
export const 실행제한밀리초 = 15000;

type 이벤트 =
  | { type: 'ready'; version: string; 걸린밀리초: number; 받은바이트?: number; 파일수?: number }
  | { type: 'out'; text: string }
  | { type: 'err'; text: string }
  | { type: 'done'; 오류?: boolean }
  | { type: 'fail'; message: string };

export interface 실행결과 {
  출력: { 갈래: 'out' | 'err'; 글: string }[];
  오류: boolean;
  /** 시간 제한이나 [중단] 으로 끊겼다 */
  끊김: boolean;
  /** 끊긴 이유가 사용자의 [중단] 이다 */
  멈춤?: boolean;
  실패?: string;
  걸린밀리초: number;
}

let worker: Worker | null = null;
let 워커주소 = '';
let 돌고있나 = false;
let 엔진준비됨 = false;
let 최초로딩밀리초: number | null = null;
let 받은바이트: number | null = null;
let 받은파일수: number | null = null;
/** 지금 도는 실행을 끝내는 손잡이. [중단] 이 이것을 당긴다. */
let 현재마무리: ((r: Omit<실행결과, '걸린밀리초' | '출력'>) => void) | null = null;

/** 진단 페이지가 읽는 값 */
export function 엔진상태() {
  return { 준비됨: 엔진준비됨, 최초로딩밀리초, 받은바이트, 받은파일수, 버전: PYODIDE_VERSION };
}

export function 실행중인가() {
  return 돌고있나;
}

function 워커만들기(): Worker {
  if (worker) return worker;
  /* 워커 안에서 Pyodide 를 동적 import 하므로 모듈 워커여야 한다.
     클래식 워커로 만들면 "Classic web workers are not supported" 로 막힌다.
     크롬 80·사파리 15 이상이면 모듈 워커를 지원한다 — 학교 전산실 크롬은 해당된다. */
  worker = new Worker(워커주소, { type: 'module' });
  return worker;
}

function 워커버리기() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  엔진준비됨 = false;
}

/** 워커 파일 주소를 알려 준다. base 경로 때문에 컴포넌트에서 넘겨받는다. */
export function 주소설정(url: string) {
  워커주소 = url;
}

/**
 * 코드를 돌린다.
 * @param 진행 출력이 올 때마다 부른다. 다 끝나기 전에도 화면에 찍기 위해서다.
 */
export function 실행(
  code: string,
  stdin: string,
  진행?: (갈래: 'out' | 'err', 글: string) => void
): Promise<실행결과> {
  if (돌고있나) {
    return Promise.resolve({
      출력: [],
      오류: false,
      끊김: false,
      실패: '이미 다른 예제가 실행 중이다. 끝나면 다시 눌러 보자.',
      걸린밀리초: 0,
    });
  }

  돌고있나 = true;
  const 시작 = performance.now();
  const 모은출력: 실행결과['출력'] = [];

  return new Promise<실행결과>((resolve) => {
    let 끝났나 = false;
    let 타이머: number;

    const 마무리 = (r: Omit<실행결과, '걸린밀리초' | '출력'>) => {
      if (끝났나) return;
      끝났나 = true;
      window.clearTimeout(타이머);
      돌고있나 = false;
      현재마무리 = null;
      if (w) w.onmessage = null;
      resolve({ ...r, 출력: 모은출력, 걸린밀리초: Math.round(performance.now() - 시작) });
    };
    현재마무리 = 마무리;

    let w: Worker;
    try {
      w = 워커만들기();
    } catch (e) {
      마무리({ 오류: false, 끊김: false, 실패: `실행기를 띄우지 못했다: ${String(e)}` });
      return;
    }

    w.onmessage = (ev: MessageEvent<이벤트>) => {
      const m = ev.data;
      if (m.type === 'ready') {
        엔진준비됨 = true;
        if (최초로딩밀리초 === null) 최초로딩밀리초 = m.걸린밀리초;
        if (m.받은바이트) 받은바이트 = m.받은바이트;
        if (m.파일수) 받은파일수 = m.파일수;
        return;
      }
      if (m.type === 'out' || m.type === 'err') {
        모은출력.push({ 갈래: m.type, 글: m.text });
        진행?.(m.type, m.text);
        return;
      }
      if (m.type === 'done') {
        마무리({ 오류: Boolean(m.오류), 끊김: false });
        return;
      }
      if (m.type === 'fail') {
        /* 엔진을 못 받아 왔다 — 학교망 차단이 가장 흔한 원인이다.
           다음 시도에서 새 워커로 다시 해 보게 버린다. */
        워커버리기();
        마무리({ 오류: false, 끊김: false, 실패: m.message });
      }
    };

    w.onerror = (e) => {
      워커버리기();
      마무리({ 오류: false, 끊김: false, 실패: e.message || '실행기에서 오류가 났다' });
    };

    타이머 = window.setTimeout(() => {
      /* 워커를 죽이는 것이 유일하게 확실한 중단 방법이다.
         다음 실행은 엔진을 다시 받아야 하므로 느려지지만, 얼어붙는 것보다 낫다. */
      워커버리기();
      마무리({ 오류: false, 끊김: true });
    }, 실행제한밀리초);

    w.postMessage({ type: 'run', code, stdin, version: PYODIDE_VERSION });
  });
}

/**
 * 사용자가 [중단] 을 눌렀을 때.
 * 워커를 죽이는 것이 파이썬 코드를 멈추는 유일하게 확실한 방법이다.
 * 다음 실행은 엔진을 다시 받아야 해 느려지지만, 얼어붙는 것보다 낫다.
 */
export function 중단() {
  if (!돌고있나) return;
  const 마무리 = 현재마무리;
  워커버리기();
  마무리?.({ 오류: false, 끊김: true, 멈춤: true });
  돌고있나 = false;
}

/** 진단 페이지에서 엔진만 미리 받아 보게 한다 */
export function 미리받기(): Promise<{ 성공: boolean; 걸린밀리초: number; 메시지?: string }> {
  return new Promise((resolve) => {
    const 시작 = performance.now();
    let w: Worker;
    try {
      w = 워커만들기();
    } catch (e) {
      resolve({ 성공: false, 걸린밀리초: 0, 메시지: String(e) });
      return;
    }
    const 끝 = (r: { 성공: boolean; 걸린밀리초: number; 메시지?: string }) => {
      w.onmessage = null;
      resolve(r);
    };
    w.onmessage = (ev: MessageEvent<이벤트>) => {
      if (ev.data.type === 'ready') {
        엔진준비됨 = true;
        if (최초로딩밀리초 === null) 최초로딩밀리초 = ev.data.걸린밀리초;
        if (ev.data.받은바이트) 받은바이트 = ev.data.받은바이트;
        if (ev.data.파일수) 받은파일수 = ev.data.파일수;
        끝({ 성공: true, 걸린밀리초: Math.round(performance.now() - 시작) });
      } else if (ev.data.type === 'fail') {
        워커버리기();
        끝({ 성공: false, 걸린밀리초: Math.round(performance.now() - 시작), 메시지: ev.data.message });
      }
    };
    w.postMessage({ type: 'init', version: PYODIDE_VERSION });
  });
}
