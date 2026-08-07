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
}

/* ---------- 출력 ---------- */
console.log(`검사한 페이지: ${files.length}개`);
for (const e of 오류) console.log(`  오류  ${e}`);
for (const w of 경고) console.log(`  경고  ${w}`);
console.log(
  `\n${오류.length === 0 ? '통과' : '실패'} — 오류 ${오류.length}건, 경고 ${경고.length}건`
);
process.exit(오류.length === 0 ? 0 : 1);
