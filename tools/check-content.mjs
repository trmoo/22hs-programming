#!/usr/bin/env node
/* ============================================================
   차시 본문 검증 — content/units/{NN}/{NN}.mdx
   의존성 없음. Node 18 이상.

   src/content.config.ts 가 약속한 "프런트매터와 curriculum.json 의 이중 확인"을
   실제로 수행하는 스크립트다. 두 곳이 어긋나면 매핑이 조용히 깨지므로
   빌드를 세워 막는다 (CLAUDE.md 3-1, 3-5).

   검사 내용
     1. 파일 경로와 프런트매터의 unit·lesson 이 일치하는가
     2. unit·lesson 이 curriculum.json 에 실제로 있는가
     3. title 이 curriculum.json 의 차시명과 같은가
     4. standards 가 담당성취기준과 같은가 (순서까지)
     5. langs 가 curriculum.json 의 언어와 같은가
     6. 본문의 <QuizItem std="…"> 가 그 차시의 담당 성취기준 안에 있는가
     7. status: published 인데 todo 나 [확인필요] 가 남아 있지 않은가
     8. 본문에 [확인필요] 가 몇 건 남았는가
     9. 문체 규칙(해요체 금지)에 어긋난 표현이 있는가 — 경고

   사용법
     node tools/check-content.mjs
     node tools/check-content.mjs --todo-only
     node tools/check-content.mjs --no-color

   종료 코드
     0  오류 없음 (경고만 있으면 0)
     1  오류 있음
     2  curriculum.json 을 읽을 수 없다
   ============================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';

const TODO = '[확인필요]';
const 본문루트 = 'content/units';
const 교육과정 = 'content/curriculum.json';

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const opts = {
  todoOnly: argv.includes('--todo-only'),
  color: !argv.includes('--no-color') && process.stdout.isTTY !== false,
};
const c = (code, s) => (opts.color ? `[${code}m${s}[0m` : s);
const red = (s) => c(31, s);
const yellow = (s) => c(33, s);
const green = (s) => c(32, s);
const dim = (s) => c(90, s);
const bold = (s) => c(1, s);

/* ---------- 교육과정 데이터 ---------- */
let data;
try {
  data = JSON.parse(readFileSync(교육과정, 'utf8'));
} catch (e) {
  console.error(red(`${교육과정} 을 읽을 수 없다: ${e.message}`));
  process.exit(2);
}

/** "1-3" → 차시 객체. 프런트매터와 맞춰 보기 위한 색인이다. */
const 차시색인 = new Map();
for (const u of data.단원 ?? []) {
  for (const l of u.차시 ?? []) {
    차시색인.set(`${u.단원번호}-${l.차시번호}`, { 단원: u, 차시: l });
  }
}
const 성취기준코드 = new Set(
  (data.단원 ?? []).flatMap((u) => (u.성취기준 ?? []).map((s) => s.코드))
);

/* ---------- 본문 파일 모으기 ---------- */
function mdx모으기(dir) {
  let out = [];
  let 목록;
  try {
    목록 = readdirSync(dir);
  } catch {
    return out;
  }
  for (const 이름 of 목록) {
    const p = join(dir, 이름);
    if (statSync(p).isDirectory()) out = out.concat(mdx모으기(p));
    else if (/^\d{2}\.mdx?$/.test(이름)) out.push(p);
  }
  return out.sort();
}

/**
 * 프런트매터를 뽑는다. YAML 파서를 두지 않고 이 프로젝트가 실제로 쓰는
 * 형태(스칼라와 한 줄 배열)만 읽는다. content.config.ts 의 스키마가
 * 이미 Astro 빌드에서 정밀 검증을 하므로, 여기서는 대조가 목적이다.
 */
function 프런트매터(src, rel, 오류) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) {
    오류.push(`${rel}: 프런트매터(--- 로 감싼 머리말)가 없다`);
    return null;
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    const v = raw.trim();
    if (/^\[.*\]$/.test(v)) {
      const 안 = v.slice(1, -1).trim();
      fm[key] = 안
        ? 안.split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
        : [];
    } else if (/^-?\d+$/.test(v)) {
      fm[key] = Number(v);
    } else {
      fm[key] = v.replace(/^['"]|['"]$/g, '');
    }
  }
  return { fm, 본문: src.slice(m[0].length) };
}

const 같은배열 = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/* ---------- 문체 규칙 (CLAUDE.md 4-1) ---------- */
const 문체금지 = [
  { re: /(해요|아요|어요|예요|이에요|에요)([.!?"”』\s]|$)/g, 이름: '해요체 종결' },
  { re: /(랍니다|답니다|군요|네요|죠)([.!?"”』\s]|$)/g, 이름: '구어체 종결' },
];

/* ---------- 검사 ---------- */
const 파일들 = mdx모으기(본문루트);
const 오류 = [];
const 경고 = [];
const 확인필요 = [];
let 통과 = 0;

for (const p of 파일들) {
  const rel = relative(process.cwd(), p);
  const src = readFileSync(p, 'utf8');
  const 앞 = 오류.length;

  const 결과 = 프런트매터(src, rel, 오류);
  if (!결과) continue;
  const { fm, 본문 } = 결과;

  /* 1. 경로와 프런트매터 대조 — 파일을 옮겨 놓고 머리말을 안 고친 경우를 잡는다 */
  const 경로단원 = Number(basename(dirname(p)));
  const 경로차시 = Number(basename(p).replace(/\.mdx?$/, ''));
  if (fm.unit !== 경로단원 || fm.lesson !== 경로차시) {
    오류.push(
      `${rel}: 파일 경로는 ${경로단원}단원 ${경로차시}차시인데 프런트매터는 ${fm.unit}단원 ${fm.lesson}차시다`
    );
  }

  /* 2. curriculum.json 에 있는 차시인가 */
  const 짝 = 차시색인.get(`${fm.unit}-${fm.lesson}`);
  if (!짝) {
    오류.push(
      `${rel}: curriculum.json 에 ${fm.unit}단원 ${fm.lesson}차시가 없다 — 데이터를 먼저 추가한다`
    );
    continue;
  }
  const { 차시 } = 짝;

  /* 3~5. 이중으로 적은 값들이 어긋나지 않았는가 */
  if (fm.title !== 차시.차시명) {
    오류.push(
      `${rel}: title 이 curriculum.json 과 다르다\n        본문: ${fm.title}\n        데이터: ${차시.차시명}`
    );
  }
  if (!같은배열(fm.standards, 차시.담당성취기준)) {
    오류.push(
      `${rel}: standards 가 담당성취기준과 다르다\n        본문: ${JSON.stringify(fm.standards)}\n        데이터: ${JSON.stringify(차시.담당성취기준)}`
    );
  }
  const 데이터언어 = 차시.언어 ?? [];
  if (!같은배열(fm.langs ?? [], 데이터언어)) {
    오류.push(
      `${rel}: langs 가 curriculum.json 의 언어와 다르다\n        본문: ${JSON.stringify(fm.langs ?? [])}\n        데이터: ${JSON.stringify(데이터언어)}`
    );
  }

  /* 5-2. 집필 상태도 두 곳에 적힌다. 어긋나면 단원 목록과 본문이 서로 다른 말을 한다 */
  if (fm.status !== 차시.상태) {
    오류.push(
      `${rel}: status 가 curriculum.json 의 상태와 다르다 — 본문: ${fm.status} / 데이터: ${차시.상태}`
    );
  }

  /* 6. 문항의 성취기준 매핑 — 배지만 붙고 담당하지 않는 코드를 쓰는 것을 막는다 */
  const 담당 = new Set(차시.담당성취기준);
  for (const m of 본문.matchAll(/<QuizItem\b[^>]*?\bstd=["']([^"']+)["']/g)) {
    const 코드 = m[1];
    if (!성취기준코드.has(코드)) {
      오류.push(`${rel}: 문항의 std="${코드}" 가 curriculum.json 에 없는 코드다`);
    } else if (!담당.has(코드)) {
      오류.push(
        `${rel}: 문항의 std="${코드}" 가 이 차시의 담당 성취기준(${차시.담당성취기준.join(', ')})이 아니다`
      );
    }
  }
  /* std 없는 문항은 커버리지 근거로 쓸 수 없다 */
  const 문항수 = [...본문.matchAll(/<QuizItem\b/g)].length;
  const std있는문항 = [...본문.matchAll(/<QuizItem\b[^>]*?\bstd=/g)].length;
  if (문항수 > std있는문항) {
    경고.push(`${rel}: 확인 문제 ${문항수 - std있는문항}개에 std 가 없다 — 문항도 성취기준에 매핑한다`);
  }

  /* 7~8. [확인필요] 와 published 게이트 */
  const todo개수 = 본문.split(TODO).length - 1;
  if (todo개수 > 0) 확인필요.push(`${rel}: 본문에 ${TODO} ${todo개수}건`);
  const 남은todo = Array.isArray(fm.todo) ? fm.todo.length : 0;
  if (남은todo > 0) 확인필요.push(`${rel}: 프런트매터 todo ${남은todo}건`);

  if (fm.status === 'published') {
    if (todo개수 > 0) {
      오류.push(`${rel}: status 가 published 인데 본문에 ${TODO} 가 ${todo개수}건 남았다`);
    }
    if (남은todo > 0) {
      오류.push(`${rel}: status 가 published 인데 프런트매터 todo 가 ${남은todo}건 남았다`);
    }
  }

  /* 9. 문체 — 오류가 아니라 경고다. 인용문에서 걸릴 수 있어 사람이 판단한다 */
  for (const { re, 이름 } of 문체금지) {
    const 걸린것 = [...본문.matchAll(re)].map((m) => m[0].trim());
    if (걸린것.length > 0) {
      const 보기 = [...new Set(걸린것)].slice(0, 4).join(', ');
      경고.push(`${rel}: ${이름} 표현 ${걸린것.length}건 — ${보기}`);
    }
  }

  if (오류.length === 앞) 통과++;
}

/* ---------- 집필 진행률 ---------- */
const 집필된차시 = new Set();
for (const p of 파일들) {
  const u = Number(basename(dirname(p)));
  const l = Number(basename(p).replace(/\.mdx?$/, ''));
  집필된차시.add(`${u}-${l}`);
}
const 단원별 = (data.단원 ?? []).map((u) => {
  const 전체 = (u.차시 ?? []).length;
  const 있음 = (u.차시 ?? []).filter((l) => 집필된차시.has(`${u.단원번호}-${l.차시번호}`)).length;
  return { no: u.단원번호, 이름: u.단원명, 전체, 있음 };
});

/* ---------- 출력 ---------- */
console.log(bold(`\n차시 본문 검사 — ${파일들.length}개 파일`));

if (opts.todoOnly) {
  if (확인필요.length === 0) console.log(green(`  본문에 ${TODO} 없음`));
  else {
    console.log(yellow(`  ${TODO} ${확인필요.length}건`));
    for (const t of 확인필요) console.log(dim(`    ${t}`));
  }
  process.exit(0);
}

for (const w of 경고) console.log(`  ${yellow('경고')}  ${w}`);
for (const e of 오류) console.log(`  ${red('오류')}  ${e}`);
for (const t of 확인필요) console.log(`  ${yellow(TODO)}  ${t}`);

console.log(dim('\n  집필 진행률'));
for (const u of 단원별) {
  const 표시 = `${u.있음}/${u.전체}`;
  const 색 = u.있음 === u.전체 ? green : u.있음 === 0 ? dim : yellow;
  console.log(dim(`    ${u.no}단원 ${u.이름} — `) + 색(표시));
}

console.log(
  `\n${오류.length === 0 ? green('통과') : red('실패')} — 파일 ${통과}개 통과, 오류 ${오류.length}건, 경고 ${경고.length}건, ${TODO} ${확인필요.length}건`
);
process.exit(오류.length === 0 ? 0 : 1);
