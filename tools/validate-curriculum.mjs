#!/usr/bin/env node
/* ============================================================
   교육과정 데이터 검증 — content/curriculum.json
   의존성 없음. Node 18 이상.

   사용법
     node tools/validate-curriculum.mjs [파일...] [옵션]
     node tools/validate-curriculum.mjs content/curriculum.json
     node tools/validate-curriculum.mjs content/*.json --todo-only

   옵션
     --todo-only   [확인필요] 잔여 목록만 출력한다
     --quiet       오류·경고 요약만 출력한다
     --no-color    ANSI 색을 쓰지 않는다

   종료 코드
     0  오류 없음
     1  오류 있음 (경고만 있으면 0)
     2  파일을 읽을 수 없거나 JSON이 깨졌다
   ============================================================ */

import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";

const TODO = "[확인필요]";
/* 과목 약칭은 1~3자다. 예: 정(정보), 인기(인공지능 기초), 데과, 소생 */
/* 보통 교과는 학년군 접두가 붙는다(12인기01-01). 전문 교과는 붙지 않는 경우가 있어
   「프로그래밍」은 프그01-01 형태다 — 평가계획서 원문 확인(2026-08-07). 둘 다 받는다. */
const CODE_RE = /^(9|12)?[가-힣]{1,4}\d{2}-\d{2}$/;
const PREFIX_RE = /^(9|12)?[가-힣]{1,4}$/;
/* 고시 코드를 확보하지 못한 과목의 잠정 코드. 예: 잠정01-01 */
const PROV_RE = /^잠정\d{2}-\d{2}$/;
const PUB_KEY_RE = /^[a-z][a-z0-9-]{1,31}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_RE = /^(\d+(~\d+)?|\[확인필요\])$/;

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const opts = {
  todoOnly: argv.includes("--todo-only"),
  quiet: argv.includes("--quiet"),
  color: !argv.includes("--no-color") && process.stdout.isTTY !== false,
};
const files = argv.filter((a) => !a.startsWith("--"));
if (files.length === 0) files.push("content/curriculum.json");

const c = (code, s) => (opts.color ? `[${code}m${s}[0m` : s);
const red = (s) => c(31, s);
const yellow = (s) => c(33, s);
const green = (s) => c(32, s);
const dim = (s) => c(90, s);
const bold = (s) => c(1, s);

/* ---------- 결과 수집 ---------- */
class Report {
  constructor(file) {
    this.file = file;
    this.errors = [];
    this.warnings = [];
    this.todos = [];
  }
  err(path, msg) {
    this.errors.push({ path, msg });
  }
  warn(path, msg) {
    this.warnings.push({ path, msg });
  }
  todo(path) {
    this.todos.push(path);
  }
}

/* ---------- 작은 스키마 검사기 ----------
   schemas/curriculum.schema.json 의 규칙 중 이 프로젝트가 실제로 쓰는 부분을
   손으로 구현한다. 외부 의존성을 두지 않기 위한 선택이다.
   (IDE 자동완성·정밀 검증은 파일 상단 $schema 로 에디터가 처리한다) */

function isStr(v) {
  return typeof v === "string" && v.length > 0;
}
function isTodo(v) {
  return v === TODO;
}
function isInt(v, min = 1) {
  return Number.isInteger(v) && v >= min;
}

function checkStr(r, path, v, { allowTodo = true } = {}) {
  if (!isStr(v)) return r.err(path, `문자열이어야 한다 (받은 값: ${JSON.stringify(v)})`);
  if (isTodo(v)) {
    if (!allowTodo) return r.err(path, `이 필드에는 ${TODO}를 쓸 수 없다`);
    r.todo(path);
  }
  if (!isTodo(v) && /^(TODO|todo|\?\?\?|미정|확인필요)$/.test(v.trim()))
    r.err(path, `미확인 값은 정확히 "${TODO}"로 적는다 (받은 값: "${v}")`);
}

function checkNullableStr(r, path, v) {
  if (v === null || v === undefined) return;
  checkStr(r, path, v);
}

/* 파일 전체에서 쓰인 잠정 코드를 모아 마지막에 한 번만 경고한다 */
const provisionalUsed = new Set();

function checkCode(r, path, v) {
  if (!isStr(v)) return r.err(path, "성취기준 코드가 문자열이어야 한다");
  if (isTodo(v)) return r.todo(path);
  if (PROV_RE.test(v)) return provisionalUsed.add(v);
  if (!CODE_RE.test(v))
    r.err(path, `성취기준 코드 형식이 아니다: "${v}" (예: 프그01-01, 12인기01-01 / 잠정 코드 예: 잠정01-01)`);
}
function isProvisional(v) {
  return isStr(v) && PROV_RE.test(v);
}

function checkPage(r, path, v) {
  if (v === null || v === undefined) return;
  if (!isStr(v)) return r.err(path, "쪽수는 문자열이거나 null이어야 한다");
  if (isTodo(v)) return r.todo(path);
  if (!PAGE_RE.test(v)) r.err(path, `쪽수 형식이 아니다: "${v}" (예: "12~31", "45")`);
}

function checkDate(r, path, v) {
  if (v === null || v === undefined) return;
  if (!isStr(v) || !DATE_RE.test(v)) r.err(path, `날짜는 YYYY-MM-DD 또는 null이어야 한다 (받은 값: ${JSON.stringify(v)})`);
}

function checkKeys(r, path, obj, allowed) {
  for (const k of Object.keys(obj))
    if (!allowed.includes(k)) r.err(`${path}.${k}`, `스키마에 없는 필드다 (허용: ${allowed.join(", ")})`);
}

/* 출판사별매핑 — 성취기준·차시 양쪽에서 같은 규칙을 쓴다 */
function checkPubMapping(r, path, map, pubCodes) {
  if (!map || typeof map !== "object" || Array.isArray(map))
    return r.err(path, "객체여야 한다 (없으면 {})");
  for (const [key, m] of Object.entries(map)) {
    const mb = `${path}.${key}`;
    if (!pubCodes.has(key))
      r.err(mb, `출판사 목록에 없는 코드다: ${key} (등록된 코드: ${[...pubCodes].join(", ") || "없음"})`);
    if (!m || typeof m !== "object") {
      r.err(mb, "객체여야 한다");
      continue;
    }
    checkKeys(r, mb, m, ["단원명", "절제목", "쪽수"]);
    checkStr(r, `${mb}.단원명`, m.단원명);
    checkNullableStr(r, `${mb}.절제목`, m.절제목);
    checkPage(r, `${mb}.쪽수`, m.쪽수);
  }
}

function checkSource(r, path, src) {
  if (src === undefined) return;
  if (!src || typeof src !== "object") return r.err(path, "출처 객체여야 한다");
  checkKeys(r, path, src, ["문서", "구간", "확인일", "url"]);
  checkStr(r, `${path}.문서`, src.문서);
  checkNullableStr(r, `${path}.구간`, src.구간);
  checkDate(r, `${path}.확인일`, src.확인일);
}

/* ---------- 본 검증 ---------- */
function validate(r, data) {
  provisionalUsed.clear(); /* 파일마다 초기화 — 여러 파일을 이어 검증할 때 섞이지 않게 */
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return r.err("$", "최상위는 객체여야 한다");

  checkKeys(r, "$", data, ["$schema", "메타", "출판사", "단원"]);

  /* --- 메타 --- */
  const meta = data.메타;
  if (!meta || typeof meta !== "object") {
    r.err("$.메타", "메타 객체가 없다");
  } else {
    checkKeys(r, "$.메타", meta, [
      "과목명", "학교급", "과목구분", "성취기준코드접두어",
      "학점", "총차시", "출처", "확인", "작성일", "비고",
    ]);
    checkStr(r, "$.메타.과목명", meta.과목명, { allowTodo: false });
    if (!["초등학교", "중학교", "고등학교"].includes(meta.학교급))
      r.err("$.메타.학교급", '"초등학교" | "중학교" | "고등학교" 중 하나여야 한다');
    checkStr(r, "$.메타.과목구분", meta.과목구분);

    const prefix = meta.성취기준코드접두어;
    if (!isStr(prefix)) r.err("$.메타.성취기준코드접두어", "문자열이어야 한다");
    else if (isTodo(prefix)) r.todo("$.메타.성취기준코드접두어");
    else if (!PREFIX_RE.test(prefix))
      r.err("$.메타.성취기준코드접두어", `접두어 형식이 아니다: "${prefix}" (예: 프그, 12인기)`);

    if (typeof meta.확인 !== "boolean") r.err("$.메타.확인", "true 또는 false여야 한다");
    checkDate(r, "$.메타.작성일", meta.작성일);
    if (!meta.작성일) r.err("$.메타.작성일", "작성일은 비울 수 없다");

    const src = meta.출처;
    if (!src || typeof src !== "object") r.err("$.메타.출처", "출처 객체가 없다");
    else {
      checkKeys(r, "$.메타.출처", src, ["문서", "구간", "확인일", "url"]);
      checkStr(r, "$.메타.출처.문서", src.문서);
      checkDate(r, "$.메타.출처.확인일", src.확인일);
      if (meta.확인 === true && !src.확인일)
        r.err("$.메타.출처.확인일", "메타.확인이 true면 확인일을 남겨야 한다");
      if (meta.확인 === true && isTodo(src.문서))
        r.err("$.메타.출처.문서", "메타.확인이 true면 출처 문서를 밝혀야 한다");
    }
  }

  /* --- 출판사 --- */
  const pubCodes = new Set();
  if (!Array.isArray(data.출판사) || data.출판사.length === 0) {
    r.err("$.출판사", "출판사 배열이 비어 있다");
  } else {
    data.출판사.forEach((p, i) => {
      const base = `$.출판사[${i}]`;
      if (!p || typeof p !== "object") return r.err(base, "객체여야 한다");
      checkKeys(r, base, p, ["코드", "표시명", "언어", "확인", "근거", "단원목록"]);

      if (!isStr(p.코드) || !PUB_KEY_RE.test(p.코드))
        r.err(`${base}.코드`, `영문 소문자·숫자·하이픈 2~32자여야 한다 (받은 값: ${JSON.stringify(p.코드)})`);
      else if (pubCodes.has(p.코드)) r.err(`${base}.코드`, `출판사 코드가 중복된다: ${p.코드}`);
      else pubCodes.add(p.코드);

      checkStr(r, `${base}.표시명`, p.표시명, { allowTodo: false });
      if (!["python", "c", "기타", TODO].includes(p.언어))
        r.err(`${base}.언어`, '"python" | "c" | "기타" | "[확인필요]" 중 하나여야 한다');
      if (p.언어 === TODO) r.todo(`${base}.언어`);
      if (typeof p.확인 !== "boolean") r.err(`${base}.확인`, "true 또는 false여야 한다");
      if (p.확인 === true && !isStr(p.근거))
        r.err(`${base}.근거`, "확인이 true면 근거(출처)를 반드시 적는다");
      checkNullableStr(r, `${base}.근거`, p.근거);

      if (p.단원목록 !== undefined) {
        if (!Array.isArray(p.단원목록)) r.err(`${base}.단원목록`, "배열이어야 한다");
        else {
          const seen = new Set();
          p.단원목록.forEach((u, j) => {
            const ub = `${base}.단원목록[${j}]`;
            checkKeys(r, ub, u, ["단원번호", "단원명", "쪽수"]);
            if (!isInt(u.단원번호)) r.err(`${ub}.단원번호`, "1 이상의 정수여야 한다");
            else if (seen.has(u.단원번호)) r.err(`${ub}.단원번호`, `단원번호가 중복된다: ${u.단원번호}`);
            else seen.add(u.단원번호);
            checkStr(r, `${ub}.단원명`, u.단원명);
            checkPage(r, `${ub}.쪽수`, u.쪽수);
          });
        }
      }
    });
  }

  /* --- 단원 · 차시 --- */
  const declared = new Map(); // 코드 → 선언 위치
  const assigned = new Map(); // 코드 → 담당 차시 목록
  const prefix = isStr(meta?.성취기준코드접두어) && !isTodo(meta.성취기준코드접두어)
    ? meta.성취기준코드접두어
    : null;

  if (!Array.isArray(data.단원) || data.단원.length === 0) {
    r.err("$.단원", "단원 배열이 비어 있다");
    return;
  }

  const unitNos = new Set();

  data.단원.forEach((u, i) => {
    const base = `$.단원[${i}]`;
    if (!u || typeof u !== "object") return r.err(base, "객체여야 한다");
    checkKeys(r, base, u, ["단원번호", "영역", "단원명", "단원개요", "핵심아이디어", "성취기준", "차시"]);

    if (!isInt(u.단원번호)) r.err(`${base}.단원번호`, "1 이상의 정수여야 한다");
    else if (unitNos.has(u.단원번호)) r.err(`${base}.단원번호`, `단원번호가 중복된다: ${u.단원번호}`);
    else unitNos.add(u.단원번호);

    checkStr(r, `${base}.영역`, u.영역);
    checkStr(r, `${base}.단원명`, u.단원명);
    checkNullableStr(r, `${base}.단원개요`, u.단원개요);
    if (u.핵심아이디어 !== undefined) {
      if (!Array.isArray(u.핵심아이디어)) r.err(`${base}.핵심아이디어`, "배열이어야 한다");
      else u.핵심아이디어.forEach((s, j) => checkStr(r, `${base}.핵심아이디어[${j}]`, s));
    }

    /* 단원의 성취기준 */
    const unitCodes = new Set();
    if (!Array.isArray(u.성취기준) || u.성취기준.length === 0) {
      r.err(`${base}.성취기준`, "단원은 성취기준을 최소 1개 가져야 한다");
    } else {
      u.성취기준.forEach((s, j) => {
        const sb = `${base}.성취기준[${j}]`;
        if (!s || typeof s !== "object") return r.err(sb, "객체여야 한다");
        checkKeys(r, sb, s, ["코드", "본문", "해설", "고려사항", "출처", "출판사별매핑"]);
        checkCode(r, `${sb}.코드`, s.코드);
        checkStr(r, `${sb}.본문`, s.본문);
        checkNullableStr(r, `${sb}.해설`, s.해설);
        checkNullableStr(r, `${sb}.고려사항`, s.고려사항);
        checkSource(r, `${sb}.출처`, s.출처);
        if (s.출판사별매핑 !== undefined)
          checkPubMapping(r, `${sb}.출판사별매핑`, s.출판사별매핑, pubCodes);

        if (isStr(s.코드) && !isTodo(s.코드)) {
          if (declared.has(s.코드))
            r.err(`${sb}.코드`, `성취기준 코드가 중복 선언되었다: ${s.코드} (앞선 위치: ${declared.get(s.코드)})`);
          else declared.set(s.코드, sb);
          /* 잠정 코드는 고시 접두어 검사 대상이 아니다 */
          if (prefix && !isProvisional(s.코드) && !s.코드.startsWith(prefix))
            r.err(`${sb}.코드`, `메타.성취기준코드접두어(${prefix})와 다르다: ${s.코드}`);
          unitCodes.add(s.코드);
        }
      });
    }

    /* 차시 */
    if (!Array.isArray(u.차시) || u.차시.length === 0) {
      r.err(`${base}.차시`, "단원은 차시를 최소 1개 가져야 한다");
      return;
    }

    const lessonNos = new Set();
    u.차시.forEach((l, j) => {
      const lb = `${base}.차시[${j}]`;
      if (!l || typeof l !== "object") return r.err(lb, "객체여야 한다");
      checkKeys(r, lb, l, [
        "차시번호", "차시명", "담당성취기준", "학습목표", "핵심개념",
        "선수학습", "출판사별매핑", "언어", "예상시간", "활동", "상태",
      ]);

      if (!isInt(l.차시번호)) r.err(`${lb}.차시번호`, "1 이상의 정수여야 한다");
      else if (lessonNos.has(l.차시번호)) r.err(`${lb}.차시번호`, `차시번호가 중복된다: ${l.차시번호}`);
      else lessonNos.add(l.차시번호);

      checkStr(r, `${lb}.차시명`, l.차시명);

      /* ★ 핵심 규칙 — 성취기준 매핑 */
      if (!Array.isArray(l.담당성취기준) || l.담당성취기준.length === 0) {
        r.err(`${lb}.담당성취기준`, "모든 차시는 성취기준을 최소 1개 담당해야 한다 (CLAUDE.md 3-1)");
      } else {
        const seen = new Set();
        l.담당성취기준.forEach((code, k) => {
          const cb = `${lb}.담당성취기준[${k}]`;
          checkCode(r, cb, code);
          if (seen.has(code)) r.err(cb, `같은 코드를 두 번 적었다: ${code}`);
          seen.add(code);
          if (isStr(code) && !isTodo(code)) {
            if (!unitCodes.has(code))
              r.err(cb, `이 단원의 성취기준 목록에 없는 코드다: ${code} (단원[${i}]에 선언하거나 소속 단원을 바꾼다)`);
            if (!assigned.has(code)) assigned.set(code, []);
            assigned.get(code).push(`${u.단원번호}단원 ${l.차시번호}차시`);
          }
        });
      }

      /* 학습목표 2~3개 */
      if (!Array.isArray(l.학습목표)) r.err(`${lb}.학습목표`, "배열이어야 한다");
      else {
        if (l.학습목표.length < 2 || l.학습목표.length > 3)
          r.err(`${lb}.학습목표`, `2~3개여야 한다 (현재 ${l.학습목표.length}개)`);
        l.학습목표.forEach((s, k) => {
          const ob = `${lb}.학습목표[${k}]`;
          checkStr(r, ob, s);
          /* 평서문 종결(-다) 확인. 해요체·명령형·의문형을 걸러낸다 */
          if (isStr(s) && !isTodo(s) && !/[가-힣]다\.?$/.test(s.trim()))
            r.warn(ob, `학습목표는 "…다"로 끝나는 평서문으로 쓴다 (CLAUDE.md 4-1): "${s}"`);
        });
      }

      /* 핵심개념 */
      if (!Array.isArray(l.핵심개념) || l.핵심개념.length === 0)
        r.err(`${lb}.핵심개념`, "최소 1개여야 한다");
      else l.핵심개념.forEach((s, k) => checkStr(r, `${lb}.핵심개념[${k}]`, s));

      /* 선수학습 */
      if (!Array.isArray(l.선수학습)) r.err(`${lb}.선수학습`, "배열이어야 한다 (없으면 [])");
      else
        l.선수학습.forEach((p, k) => {
          const pb = `${lb}.선수학습[${k}]`;
          if (!p || typeof p !== "object") return r.err(pb, "객체여야 한다");
          checkKeys(r, pb, p, ["내용", "과목", "성취기준코드"]);
          checkStr(r, `${pb}.내용`, p.내용);
          checkNullableStr(r, `${pb}.과목`, p.과목);
          if (p.성취기준코드 !== null && p.성취기준코드 !== undefined)
            checkCode(r, `${pb}.성취기준코드`, p.성취기준코드);
        });

      /* 출판사별매핑 */
      checkPubMapping(r, `${lb}.출판사별매핑`, l.출판사별매핑, pubCodes);

      /* 언어 */
      if (l.언어 !== undefined) {
        if (!Array.isArray(l.언어)) r.err(`${lb}.언어`, "배열이어야 한다");
        else
          l.언어.forEach((v, k) => {
            if (!["python", "c"].includes(v))
              r.err(`${lb}.언어[${k}]`, '"python" 또는 "c"여야 한다');
          });
      }

      /* 예상시간 */
      if (l.예상시간 !== null && l.예상시간 !== undefined) {
        if (!Number.isInteger(l.예상시간) || l.예상시간 < 10 || l.예상시간 > 200)
          r.err(`${lb}.예상시간`, "10~200 사이의 정수 또는 null이어야 한다");
      }

      /* 활동 */
      if (l.활동 !== undefined) {
        if (!Array.isArray(l.활동)) r.err(`${lb}.활동`, "배열이어야 한다");
        else
          l.활동.forEach((a, k) => {
            const ab = `${lb}.활동[${k}]`;
            if (!a || typeof a !== "object") return r.err(ab, "객체여야 한다");
            checkKeys(r, ab, a, ["종류", "제목"]);
            if (!["실습", "시뮬레이터", "토의", "프로젝트", "조사"].includes(a.종류))
              r.err(`${ab}.종류`, '"실습" | "시뮬레이터" | "토의" | "프로젝트" | "조사" 중 하나여야 한다');
            checkStr(r, `${ab}.제목`, a.제목);
          });
      }

      /* 상태 */
      if (!["draft", "review", "published"].includes(l.상태))
        r.err(`${lb}.상태`, '"draft" | "review" | "published" 중 하나여야 한다');
    });

    /* 차시번호 연속성 */
    const nos = [...lessonNos].sort((a, b) => a - b);
    if (nos.length && (nos[0] !== 1 || nos[nos.length - 1] !== nos.length))
      r.warn(`${base}.차시`, `차시번호가 1부터 연속되지 않는다: [${nos.join(", ")}]`);
  });

  /* 단원번호 연속성 */
  const uns = [...unitNos].sort((a, b) => a - b);
  if (uns.length && (uns[0] !== 1 || uns[uns.length - 1] !== uns.length))
    r.warn("$.단원", `단원번호가 1부터 연속되지 않는다: [${uns.join(", ")}]`);

  /* 메타.총차시가 실제 차시 수와 맞는가 */
  const actualLessons = data.단원.reduce(
    (n, u) => n + (Array.isArray(u?.차시) ? u.차시.length : 0),
    0
  );
  if (Number.isInteger(meta?.총차시) && meta.총차시 !== actualLessons)
    r.err(
      "$.메타.총차시",
      `실제 차시 수와 다르다: 메타에는 ${meta.총차시}, 실제는 ${actualLessons}개다`
    );

  /* --- 커버리지: 담당 차시가 없는 성취기준 --- */
  for (const [code, where] of declared)
    if (!assigned.has(code))
      r.warn(where, `이 성취기준을 담당하는 차시가 없다: ${code} (커버리지 구멍)`);

  /* --- 잠정 코드 사용 안내 (파일당 1회) --- */
  if (provisionalUsed.size)
    r.warn(
      "$.단원[].성취기준[].코드",
      `잠정 코드 ${provisionalUsed.size}개를 쓰고 있다 (${[...provisionalUsed].slice(0, 3).join(", ")}${provisionalUsed.size > 3 ? " …" : ""}). ` +
        `고시 원문 코드를 확보하면 전부 교체한다. 잠정 코드를 고시 코드처럼 화면에 표시하지 않는다.`
    );

  return { declared, assigned };
}

/* ---------- published + [확인필요] 교차 검사 ---------- */
function checkPublishedTodos(r, data) {
  if (!Array.isArray(data?.단원)) return;
  data.단원.forEach((u, i) => {
    if (!Array.isArray(u?.차시)) return;
    u.차시.forEach((l, j) => {
      if (l?.상태 !== "published") return;
      const found = [];
      const walk = (node, path) => {
        if (typeof node === "string") {
          if (node === TODO) found.push(path);
        } else if (Array.isArray(node)) node.forEach((v, k) => walk(v, `${path}[${k}]`));
        else if (node && typeof node === "object")
          for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      };
      walk(l, `$.단원[${i}].차시[${j}]`);
      for (const p of found)
        r.err(p, `상태가 published인 차시에 ${TODO}가 남아 있다 (CLAUDE.md 3-3)`);
    });
  });
}

/* ---------- 출력 ---------- */
function printReport(r, stats) {
  const rel = relative(process.cwd(), r.file) || r.file;

  if (opts.todoOnly) {
    console.log(bold(`\n${rel}`));
    if (r.todos.length === 0) console.log(green(`  ${TODO} 없음`));
    else {
      console.log(yellow(`  ${TODO} ${r.todos.length}건`));
      for (const p of r.todos) console.log(`    ${dim(p)}`);
    }
    return;
  }

  console.log(bold(`\n${rel}`));

  if (!opts.quiet) {
    for (const e of r.errors) console.log(`  ${red("오류")}  ${e.path}\n        ${e.msg}`);
    for (const w of r.warnings) console.log(`  ${yellow("경고")}  ${w.path}\n        ${w.msg}`);
  }

  if (stats) {
    const total = stats.declared.size;
    const covered = [...stats.declared.keys()].filter((k) => stats.assigned.has(k)).length;
    const pct = total ? Math.round((covered / total) * 100) : 0;
    console.log(
      dim(`  성취기준 ${total}개 · 담당 차시 있음 ${covered}개 (커버리지 ${pct}%)`)
    );
  }

  const t = r.todos.length;
  console.log(
    `  ${r.errors.length ? red(`오류 ${r.errors.length}`) : green("오류 0")}` +
      ` · ${r.warnings.length ? yellow(`경고 ${r.warnings.length}`) : "경고 0"}` +
      ` · ${t ? yellow(`${TODO} ${t}`) : green(`${TODO} 0`)}`
  );
}

/* ---------- 실행 ---------- */
let exitCode = 0;
let totalErrors = 0;

for (const f of files) {
  const abs = resolve(process.cwd(), f);
  let raw, data;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (e) {
    console.log(`\n${bold(f)}\n  ${red("오류")}  파일을 읽을 수 없다: ${e.message}`);
    exitCode = 2;
    continue;
  }
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`\n${bold(f)}\n  ${red("오류")}  JSON 파싱 실패: ${e.message}`);
    exitCode = 2;
    continue;
  }

  const r = new Report(abs);
  const stats = validate(r, data);
  checkPublishedTodos(r, data);
  printReport(r, stats);
  totalErrors += r.errors.length;
}

if (totalErrors > 0 && exitCode === 0) exitCode = 1;

if (!opts.todoOnly) {
  console.log(
    totalErrors === 0
      ? green(`\n검증 통과 — 오류 0건`)
      : red(`\n검증 실패 — 오류 ${totalErrors}건`)
  );
  if (totalErrors === 0)
    console.log(dim(`경고와 ${TODO}는 배포 전까지 해소한다. 자세한 규칙은 CLAUDE.md 참고.`));
}

process.exit(exitCode);
