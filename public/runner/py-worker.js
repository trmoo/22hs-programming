/* ============================================================
   Python 실행 일꾼 (Web Worker)

   왜 워커에서 돌리는가
     무한 루프를 만난 코드를 멈출 방법이 필요하다. 메인 스레드에서
     돌리면 탭 전체가 얼어붙어 강제 종료 말고는 손쓸 수 없다.
     워커는 terminate() 로 바깥에서 죽일 수 있다.
     → PLAN.md Phase 4 완료 조건 "무한 루프가 브라우저를 얼리지 않음"

   왜 input() 을 미리 받아 두는가
     워커에서 input() 을 진짜로 "멈춰 세워" 기다리게 하려면
     SharedArrayBuffer + Atomics.wait 이 필요하고, 그러려면 COOP/COEP
     응답 헤더를 서버가 보내 줘야 한다. GitHub Pages 는 헤더를 못 바꾼다.
     그래서 입력을 미리 칸에 적어 두고 한 줄씩 꺼내 주는 방식을 쓴다.
     tools/check-examples.mjs 가 stdin 을 미리 주는 것과 같은 방식이고,
     <CodeSample stdin="…"> 속성과도 그대로 맞물린다.

   이 파일은 빌드하지 않는다 (public/). 번들러를 거치지 않으므로
   문법은 브라우저가 바로 읽을 수 있는 수준으로 유지한다.
   ============================================================ */

/** 한 번 실행에서 받아들일 출력 상한. 넘으면 잘라내고 알린다. */
const 출력상한 = 60000;

let pyodide = null;
let 로딩중 = null;

/* 실행 한 번 동안의 상태 */
let 남은입력 = [];
let 보낸양 = 0;
let 잘렸나 = false;

function 보내기(type, text) {
  if (type === 'out' || type === 'err') {
    if (잘렸나) return;
    if (보낸양 + text.length > 출력상한) {
      const 남은칸 = Math.max(0, 출력상한 - 보낸양);
      if (남은칸 > 0) self.postMessage({ type, text: text.slice(0, 남은칸) });
      잘렸나 = true;
      self.postMessage({
        type: 'err',
        text: `\n[출력이 ${출력상한}자를 넘어 여기서 잘랐다. 출력하는 양을 줄여 보자.]\n`,
      });
      return;
    }
    보낸양 += text.length;
  }
  self.postMessage({ type, text });
}

async function 준비(version) {
  if (pyodide) return pyodide;
  if (로딩중) return 로딩중;

  로딩중 = (async () => {
    const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
    const 시작 = performance.now();
    const mod = await import(base + 'pyodide.mjs');
    const py = await mod.loadPyodide({ indexURL: base });

    /* batched 는 줄 단위로 부르면서 끝의 개행을 떼고 준다.
       기대 출력과 글자 단위로 대조하려면 다시 붙여야 한다. */
    py.setStdout({ batched: (s) => 보내기('out', s + '\n') });
    py.setStderr({ batched: (s) => 보내기('err', s + '\n') });
    /* 미리 받아 둔 입력을 한 줄씩 돌려준다. 다 떨어지면 null → EOF */
    py.setStdin({
      stdin: () => (남은입력.length ? 남은입력.shift() : null),
      isatty: false,
    });

    pyodide = py;

    /* 얼마나 받았는지 잰다. 내려받기는 이 워커 안에서 일어나므로
       메인 스레드의 performance 에는 잡히지 않는다 — 여기서 재서 넘겨야 한다. */
    let 받은바이트 = 0;
    let 파일수 = 0;
    try {
      for (const x of performance.getEntriesByType('resource')) {
        if (!x.name.includes('pyodide')) continue;
        받은바이트 += x.transferSize || x.encodedBodySize || 0;
        파일수++;
      }
    } catch (_) {
      /* 성능 항목을 못 읽는 브라우저면 용량만 못 알려 준다 */
    }

    self.postMessage({
      type: 'ready',
      version: py.version,
      걸린밀리초: Math.round(performance.now() - 시작),
      받은바이트,
      파일수,
    });
    return py;
  })();

  try {
    return await 로딩중;
  } catch (e) {
    로딩중 = null;
    throw e;
  }
}

/**
 * 트레이스백에서 Pyodide 속살을 걷어 낸다.
 *
 * 그대로 두면 학생 코드에 닿기 전에 _pyodide/_base.py 프레임이 열 줄쯤 먼저 나온다.
 * 1단원 2차시에서 "오류 메시지를 읽는 것도 학습"이라고 했는데, 읽을 것이
 * 남의 파일 경로부터라면 읽지 않게 된다. 학생이 쓴 코드의 프레임부터 보여 준다.
 */
function 트레이스백정리(글) {
  const 줄 = String(글).split('\n');
  const i = 줄.findIndex((l) => l.includes('File "<exec>"'));
  if (i < 0) return 글;
  return ['Traceback (most recent call last):', ...줄.slice(i)].join('\n');
}

/** 입력 문자열을 줄 단위로 쪼갠다. input() 은 줄 끝의 개행을 뺀 값을 받는다. */
function 입력쪼개기(stdin) {
  if (!stdin) return [];
  const 줄 = stdin.split('\n');
  if (줄.length && 줄[줄.length - 1] === '') 줄.pop();
  return 줄;
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  const version = msg.version || '314.0.3';

  if (msg.type === 'init') {
    try {
      await 준비(version);
    } catch (err) {
      self.postMessage({ type: 'fail', message: String(err && err.message ? err.message : err) });
    }
    return;
  }

  if (msg.type !== 'run') return;

  남은입력 = 입력쪼개기(msg.stdin);
  보낸양 = 0;
  잘렸나 = false;

  let py;
  try {
    py = await 준비(version);
  } catch (err) {
    self.postMessage({
      type: 'fail',
      message: String(err && err.message ? err.message : err),
    });
    return;
  }

  try {
    /* 앞 실행에서 만든 이름이 남아 다음 실행 결과를 바꾸지 않게 한다.
       학생이 변수를 지웠는데도 계속 돌아가면 "왜 되는지" 헷갈린다. */
    await py.runPythonAsync('globals().clear()\n__name__ = "__main__"\n');
    await py.runPythonAsync(msg.code);
    self.postMessage({ type: 'done' });
  } catch (err) {
    /* 파이썬 오류는 트레이스백을 보여 준다. 오류 메시지를 읽는 것도 학습이다.
       다만 Pyodide 내부 프레임은 학생과 무관하므로 걷어 낸다. */
    보내기('err', 트레이스백정리(err && err.message ? err.message : err));
    self.postMessage({ type: 'done', 오류: true });
  }
};
