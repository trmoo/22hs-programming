#!/usr/bin/env node
/**
 * 빌드 산출물 정적 점검
 *
 *   node tools/check-html.mjs [dist경로]
 *
 * 확인하는 것
 *   1. 중복 id — HTML 유효성과 aria-labelledby·앵커 링크를 깨뜨린다
 *   2. 깨진 내부 앵커 — href="#foo" 인데 id="foo" 가 없는 경우
 *   3. 깨진 내부 링크 — 산출물에 해당 페이지가 없는 경우
 *   4. lang 속성·title·h1 누락
 *   5. alt 없는 img
 *   6. JS 없이 읽히는가 — 좌측 트리/본문이 정적 HTML에 들어 있는가
 *   7. 화면에 실은 예제 코드가 MDX 원문과 글자 단위로 같은가
 *      — check:examples 는 MDX 원문을 실행한다. 화면 쪽이 조금이라도 다르면
 *        「실행해 확인한 코드」를 실은 것이 아니다 (CLAUDE.md 6장 10번)
 *   8. 태그가 글자로 보이지 않는가 — 본문에 &lt;code&gt; 나 &amp;lt; 가 있으면
 *      학생 화면에 <code> · &lt; 가 그대로 찍힌다. 문항 글 변환기(inline-html.ts)도 여기서 시험한다
 *   9. hidden 이 실제로 숨기는가 — [hidden]{display:none!important} 가 페이지 CSS 에 있고,
 *      [고치기] 편집 칸이 hidden 을 달고 나오는가. 둘 중 하나가 빠지면 예제 아래에
 *      같은 코드가 흰 입력창으로 한 번 더 보인다 (2026-10-23 배포본에서 겪음)
 *
 * 브라우저를 띄우지 않고 검사하므로 CI·학교 PC에서도 돌아간다.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
/* Node 22.6+ 의 타입 스트리핑으로 .ts 를 직접 읽는다 (test-toc.mjs 와 같다) */
import { 인라인HTML } from '../src/lib/inline-html.ts';

const DIST = process.argv[2] ?? 'dist';

/**
 * 하위 경로 배포(예: GitHub Pages /22hs-programming/)에서는 산출물의 링크가
 * base 접두어를 달고 나온다. 산출물 안의 경로는 그대로이므로, 링크를 대조하기
 * 전에 접두어를 떼야 한다. 떼지 않으면 전부 "대상이 없다"로 잡힌다.
 * astro.config.mjs 와 같은 환경 변수를 본다.
 */
const BASE = (() => {
  let b = process.env.BASE_PATH ?? '/';
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
})();

/** '/22hs-programming/units/01/' → '/units/01/' */
function base떼기(p) {
  if (BASE === '/') return p;
  const 접두 = BASE.slice(0, -1); // 끝 '/' 제외
  if (p === 접두) return '/';
  return p.startsWith(BASE) ? p.slice(접두.length) : p;
}

if (!existsSync(DIST)) {
  console.error(`산출물이 없다: ${DIST}\n먼저 npm run build 를 실행한다.`);
  process.exit(2);
}

/* ---------- 파일 수집 ---------- */
function 모든HTML(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...모든HTML(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = 모든HTML(DIST).sort();

/* ---------- 태그 파싱 (정규식 — 산출물이 우리가 만든 것이라 충분하다) ---------- */
const 오류 = [];
const 경고 = [];
/** 페이지마다 같은 CSS 파일을 다시 읽지 않게 (9번 검사) */
const CSS캐시 = new Map();

/** <style>/<script> 안의 내용을 지운 사본 — CSS·JS 문자열이 오검출되지 않게 */
function 마크업만(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '<style></style>')
    .replace(/<script[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const 페이지경로 = new Set(
  files.map((f) => {
    const rel = relative(DIST, f).split('\\').join('/');
    return '/' + rel.replace(/index\.html$/, '');
  })
);

for (const file of files) {
  const rel = relative(DIST, file).split('\\').join('/');
  const raw = readFileSync(file, 'utf8');
  const html = 마크업만(raw);

  /* 1. 중복 id */
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const 본 = new Set();
  const 중복 = new Set();
  for (const id of ids) {
    if (본.has(id)) 중복.add(id);
    본.add(id);
  }
  for (const id of 중복) 오류.push(`${rel}: 중복 id "${id}"`);

  /* 2. 깨진 내부 앵커 */
  const 앵커 = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  for (const a of 앵커) {
    if (a && !본.has(a)) 오류.push(`${rel}: href="#${a}" 인데 그 id가 없다`);
  }

  /* 3. 깨진 내부 링크 */
  const 링크 = [...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
  for (const 원본 of 링크) {
    /* base 를 떼기 전에, 하위 경로 배포인데 접두어가 안 붙은 링크를 잡는다.
       href() 를 거치지 않고 절대 경로를 손으로 적으면 여기서 걸린다. */
    if (BASE !== '/' && !원본.startsWith(BASE)) {
      오류.push(`${rel}: base(${BASE}) 가 안 붙은 절대 링크다 ${원본} — href() 를 거쳐야 한다`);
      continue;
    }
    const l = base떼기(원본);
    if (/\.(svg|css|js|png|jpg|jpeg|webp|woff2?|ico)$/i.test(l)) {
      const asset = join(DIST, l);
      if (!existsSync(asset)) 경고.push(`${rel}: 자산 링크가 없다 ${원본}`);
      continue;
    }
    const norm = l.endsWith('/') ? l : `${l}/`;
    if (!페이지경로.has(norm)) 오류.push(`${rel}: 내부 링크 대상이 없다 ${원본}`);
  }

  /* 4. 문서 기본 */
  if (!/<html[^>]+lang="ko"/.test(html)) 오류.push(`${rel}: <html lang="ko"> 가 없다`);
  if (!/<title>[^<]+<\/title>/.test(html)) 오류.push(`${rel}: <title> 이 비었다`);
  const h1수 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1수 === 0) 오류.push(`${rel}: <h1> 이 없다`);
  if (h1수 > 1) 경고.push(`${rel}: <h1> 이 ${h1수}개다 (하나가 좋다)`);

  /* 5. alt 없는 img */
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(m[0])) 오류.push(`${rel}: alt 없는 <img>`);
  }

  /* 6. JS 없이 읽히는가 */
  if (!/class="tree__lessons"/.test(html)) 오류.push(`${rel}: 정적 HTML에 좌측 트리 차시 목록이 없다`);
  if (!/class="skip-link"/.test(html)) 경고.push(`${rel}: 건너뛰기 링크가 없다`);

  /* 7. 화면 코드 ↔ MDX 원문 */
  예제코드대조(rel, html);

  /* 8. 태그가 글자로 보이지 않는가 */
  글자로보이는태그(rel, html);

  /* 9. hidden 이 실제로 숨기는가 */
  숨김확인(rel, raw, html);
}

/* ---------- 8. 태그가 글자로 보이지 않는가 ---------- */
/**
 * 확인 문제의 문항 글을 {stem} 으로 넣었더니 MDX 에 적은 <code> 가 이스케이프되어
 * 「&lt;code&gt;0 &lt; 점수&lt;/code&gt;」 처럼 글자로 보였다(19개 차시 89곳, 2026-10-23).
 * 코드 상자·입력 칸·<code> 안은 태그 이야기를 일부러 적을 수 있으니 걷어 내고 본다.
 */
function 글자로보이는태그(rel, html) {
  const 상자뺌 = html
    .replace(/<pre\b[\s\S]*?<\/pre>/g, '')
    .replace(/<textarea\b[\s\S]*?<\/textarea>/g, '');
  const 본문 = 상자뺌.replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '');

  const 태그 = 본문.match(/&lt;\/?(code|strong|em|b|i|br|span|sub|sup|kbd)\b[^&<]*?&gt;/g) ?? [];
  if (태그.length) {
    오류.push(
      `${rel}: 태그가 글자로 보인다 ${태그.length}곳 (예: ${태그[0]}) — ` +
        '문항 글이면 QuizItem 이 inline-html.ts 를 거치는지 확인한다'
    );
  }

  /* <code> 안까지 본다 — 보기를 choices={['<code>점수 &gt; 90</code>']} 처럼 JS 문자열로 적으면
     참조가 안 풀린 채 들어오고, 그것을 한 번 더 이스케이프하면 <code> 안에 &gt; 가 글자로 보인다 */
  const 두번 = 상자뺌.match(/&amp;(lt|gt|amp|quot|#\d+);/g) ?? [];
  if (두번.length) {
    오류.push(
      `${rel}: 문자 참조가 두 번 이스케이프되어 글자로 보인다 ${두번.length}곳 (예: ${두번[0]})`
    );
  }
}

/* ---------- 9. hidden 이 실제로 숨기는가 ---------- */
function 페이지CSS(raw) {
  let css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const m of raw.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
    const 경로 = join(DIST, base떼기(m[1]));
    if (!CSS캐시.has(경로)) CSS캐시.set(경로, existsSync(경로) ? readFileSync(경로, 'utf8') : '');
    css += '\n' + CSS캐시.get(경로);
  }
  return css;
}

function 숨김확인(rel, raw, html) {
  /* 브라우저 기본값 [hidden]{display:none} 은 컴포넌트가 display 를 정하면 진다 */
  if (!/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/.test(페이지CSS(raw))) {
    오류.push(`${rel}: 페이지 CSS 에 [hidden]{display:none!important} 가 없다 — global.css 를 확인한다`);
  }

  /* [고치기] 편집 칸은 닫힌 채로 나와야 한다. 열려 나오면 같은 코드가 두 번 보인다 */
  const 열린칸 = [...html.matchAll(/<textarea\b[^>]*data-code-edit[^>]*>/g)].filter(
    (m) => !/\shidden(?=[\s>=])/.test(m[0])
  );
  if (열린칸.length) {
    오류.push(`${rel}: [고치기] 편집 칸 ${열린칸.length}개가 hidden 없이 나온다`);
  }
}

/* ---------- 8-1. 문항 글 변환기 시험 ---------- */
/**
 * 허용 태그만 살리고 나머지는 글자로 넣는지, 짝이 틀리면 멈추는지 본다.
 * 빌드가 성공했다는 것만으로는 「스크립트가 통과하지 않는다」를 알 수 없어 따로 시험한다.
 */
function 변환기시험() {
  const 사례 = [
    ['<code>0 < 점수 < 100</code> 이면?', '<code>0 &lt; 점수 &lt; 100</code> 이면?'],
    ['<code>scanf(「%lf」, &cm)</code>', '<code>scanf(「%lf」, &amp;cm)</code>'],
    ['<code>a && b</code>', '<code>a &amp;&amp; b</code>'],
    /* JS 문자열로 적은 보기 — 참조가 안 풀린 채 온다. 두 번 바꾸면 &gt; 가 글자로 보인다 */
    ['<code>점수 &gt;= 90</code> &#39;a&#39; &#x41;', '<code>점수 &gt;= 90</code> &#39;a&#39; &#x41;'],
    ['&lt;script&gt;', '&lt;script&gt;'],
    ['쓰이지 <strong>않은</strong> 것은?', '쓰이지 <strong>않은</strong> 것은?'],
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ["<b>굵게</b> 'a'", '&lt;b&gt;굵게&lt;/b&gt; &#39;a&#39;'],
    ['태그 없음', '태그 없음'],
  ];
  for (const [넣음, 기대] of 사례) {
    const 실제 = 인라인HTML(넣음);
    if (실제 !== 기대) {
      오류.push(`inline-html.ts: ${JSON.stringify(넣음)}\n          기대 ${JSON.stringify(기대)}\n          실제 ${JSON.stringify(실제)}`);
    }
  }
  /* 속성 달린 <code onclick> 는 태그로 보지 않으므로 뒤의 </code> 가 짝 없이 남아 멈춘다 */
  const 깨진것들 = ['<code>열고 안 닫음', '안 열고</code>', '<code><strong>엇갈림</code></strong>', '<code onclick="x()">a</code>'];
  for (const 깨진것 of 깨진것들) {
    let 멈춤 = false;
    try {
      인라인HTML(깨진것);
    } catch {
      멈춤 = true;
    }
    if (!멈춤) 오류.push(`inline-html.ts: 짝이 틀린 ${JSON.stringify(깨진것)} 에서 멈추지 않았다`);
  }
}
변환기시험();

/* ---------- 7. 화면에 실은 예제 코드가 MDX 원문과 같은가 ---------- */
/**
 * MDX 는 여러 줄 표현식의 둘째 줄부터 들여쓰기를 2칸 지운다. 그래서 4칸으로 적은
 * 파이썬 블록이 화면에서는 2칸이 되어 **검증한 코드와 실은 코드가 달라졌던 적이 있다**
 * (2026-08-07). CodeSample.astro 가 되돌리고 있고, 되돌리기가 어긋나면 여기서 잡는다.
 */
function 실체되돌리기(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&');
}

/** dist 경로('units/02/18/index.html')에서 MDX 경로를 얻는다 */
function MDX경로(rel) {
  const m = /units[\\/](\d\d)[\\/](\d\d)[\\/]index\.html$/.exec(rel);
  return m ? join('content', 'units', m[1], `${m[2]}.mdx`) : null;
}

function 예제코드대조(rel, html) {
  const mdx = MDX경로(rel);
  if (!mdx || !existsSync(mdx)) return;

  const 원문들 = [
    ...readFileSync(mdx, 'utf8').matchAll(
      /<CodeSample\b[\s\S]*?>\s*\{`([\s\S]*?)`\}\s*<\/CodeSample>/g
    ),
    /* MDX 파일은 CRLF 다. 산출물은 LF 이므로 줄 끝을 맞춘 뒤 대조한다. */
  ].map((m) => m[1].replace(/\r\n/g, '\n').replace(/\\\\/g, '\\').replace(/\\`/g, '`').trim());

  const 화면들 = [
    ...html.matchAll(/<pre class="code-sample__code[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g),
  ].map((m) => 실체되돌리기(m[1]).trim());

  if (원문들.length !== 화면들.length) {
    오류.push(
      `${rel}: 예제 개수가 다르다 — MDX ${원문들.length}개, 화면 ${화면들.length}개`
    );
    return;
  }

  for (let i = 0; i < 원문들.length; i++) {
    if (원문들[i] === 화면들[i]) continue;
    const 원 = 원문들[i].split('\n');
    const 화 = 화면들[i].split('\n');
    const j = 원.findIndex((l, k) => l !== 화[k]);
    오류.push(
      `${rel}: ${i + 1}번째 예제가 MDX 원문과 다르다 (${j + 1}번째 줄)\n` +
        `          MDX  ${JSON.stringify(원[j])}\n` +
        `          화면 ${JSON.stringify(화[j])}`
    );
  }
}

/* ---------- 출력 ---------- */
console.log(`검사한 페이지: ${files.length}개`);
for (const e of 오류) console.log(`  오류  ${e}`);
for (const w of 경고) console.log(`  경고  ${w}`);
console.log(
  `\n${오류.length === 0 ? '통과' : '실패'} — 오류 ${오류.length}건, 경고 ${경고.length}건`
);
process.exit(오류.length === 0 ? 0 : 1);
