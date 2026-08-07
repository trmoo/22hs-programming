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
 *
 * 브라우저를 띄우지 않고 검사하므로 CI·학교 PC에서도 돌아간다.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, posix } from 'node:path';

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
}

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
