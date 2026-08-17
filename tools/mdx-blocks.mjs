/**
 * MDX 차시 본문 → 블록 트리
 *
 * `tools/make-textbook.mjs`(교재 docx 생성기)가 쓰는 파서다.
 * 웹 화면은 Astro 가 MDX 를 직접 처리하므로 이 파일을 쓰지 않는다.
 *
 * 컴포넌트 속성은 우리가 직접 쓴 JS 리터럴이므로 new Function 으로 평가한다.
 * 저장소 안의 우리 콘텐츠만 읽으므로 안전하고, 손으로 만든 파서보다 정확하다
 * (choices={[…]} · rows={[[…]]} · items={[{…}]} 를 모두 그대로 얻는다).
 */
import { readFileSync } from 'node:fs';

/* ---------- 속성 스캔 ---------- */
/** <Name ...> 의 속성 문자열을 {이름: 값} 으로. 값은 평가된 JS 값. */
export function 속성파싱(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const m = /^([A-Za-z가-힣_][\w가-힣-]*)/.exec(s.slice(i));
    if (!m) { i++; continue; }
    const 이름 = m[1];
    i += m[1].length;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== '=') { out[이름] = true; continue; }   /* 불 속성 */
    i++;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i];
      let j = i + 1;
      while (j < s.length && s[j] !== q) j++;
      out[이름] = s.slice(i + 1, j);
      i = j + 1;
    } else if (s[i] === '{') {
      /* 중괄호 균형을 맞춰 표현식을 떠낸다 (문자열 안의 괄호는 무시) */
      let depth = 0, j = i, q = null;
      for (; j < s.length; j++) {
        const ch = s[j];
        if (q) {
          if (ch === '\\') { j++; continue; }
          if (ch === q) q = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) break; }
      }
      const 식 = s.slice(i + 1, j);
      try {
        out[이름] = new Function(`return (${식})`)();
      } catch {
        out[이름] = 식;   /* 평가 실패는 원문 그대로 — 나중에 눈에 띈다 */
      }
      i = j + 1;
    } else {
      const m2 = /^\S+/.exec(s.slice(i));
      out[이름] = m2 ? m2[0] : true;
      i += m2 ? m2[0].length : 1;
    }
  }
  return out;
}

/** 여는 태그의 끝 위치와 자기닫힘 여부 */
function 여는태그끝(s, start) {
  let i = start, q = null, depth = 0;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '\\') { i++; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      const 자기닫힘 = s[i - 1] === '/';
      return { 끝: i, 자기닫힘 };
    }
  }
  return null;
}

/** <Name> … </Name> 의 짝을 찾는다 (같은 이름 중첩 대응) */
function 닫는태그찾기(s, 이름, from) {
  const re = new RegExp(`<(/?)${이름}(?=[\\s/>])`, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] === '/') { depth--; if (depth === 0) return { 시작: m.index, 끝: s.indexOf('>', m.index) + 1 }; }
    else {
      const t = 여는태그끝(s, m.index);
      if (t && !t.자기닫힘) depth++;
    }
  }
  return null;
}

const 컨테이너 = new Set(['InfoBox', 'Activity', 'MoreBox', 'CheckQuiz', 'CodeSample', 'Figure', 'CodeTask']);
const 인라인 = new Set(['Term', 'LessonLink']);

/* ---------- 블록 파서 ---------- */
export function 블록파싱(본문) {
  const 블록 = [];
  const 줄들 = 본문.split('\n');
  let i = 0;

  /* 문단 버퍼 */
  let buf = [];
  const 문단비우기 = () => {
    const t = buf.join('\n').trim();
    if (t) 블록.push({ 종류: '문단', 글: t });
    buf = [];
  };

  while (i < 줄들.length) {
    const 줄 = 줄들[i];

    /* 컴포넌트 — 줄 맨앞에서 시작하는 것만 블록으로 본다 */
    const c = /^<([A-Z][A-Za-z]*)/.exec(줄);
    if (c && !인라인.has(c[1])) {
      const 이름 = c[1];
      const 전체 = 줄들.slice(i).join('\n');
      const t = 여는태그끝(전체, 0);
      if (t) {
        문단비우기();
        const 속성 = 속성파싱(전체.slice(이름.length + 1, t.자기닫힘 ? t.끝 - 1 : t.끝));
        let 안 = '', 소비끝;
        if (t.자기닫힘 || !컨테이너.has(이름)) {
          소비끝 = t.끝 + 1;
        } else {
          const 닫 = 닫는태그찾기(전체, 이름, t.끝);
          안 = 닫 ? 전체.slice(t.끝 + 1, 닫.시작) : '';
          소비끝 = 닫 ? 닫.끝 : 전체.length;
        }
        블록.push({ 종류: '컴포넌트', 이름, 속성, 안 });
        /* 소비한 줄 수만큼 건너뛴다 */
        const 소비한줄 = 전체.slice(0, 소비끝).split('\n').length;
        i += 소비한줄;
        continue;
      }
    }

    /* 코드 펜스 */
    if (/^```/.test(줄)) {
      문단비우기();
      const lang = 줄.slice(3).trim();
      const 코드 = [];
      i++;
      while (i < 줄들.length && !/^```/.test(줄들[i])) { 코드.push(줄들[i]); i++; }
      i++;
      블록.push({ 종류: '코드', 언어: lang || 'text', 코드: 코드.join('\n') });
      continue;
    }

    /* 제목 */
    const h = /^(#{2,4})\s+(.*)$/.exec(줄);
    if (h) {
      문단비우기();
      블록.push({ 종류: '제목', 깊이: h[1].length, 글: h[2].trim() });
      i++;
      continue;
    }

    /* 표 */
    if (/^\s*\|/.test(줄) && i + 1 < 줄들.length && /^\s*\|[\s:|-]+\|?\s*$/.test(줄들[i + 1])) {
      문단비우기();
      const 셀나누기 = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
      const 머리 = 셀나누기(줄);
      i += 2;
      const 행 = [];
      while (i < 줄들.length && /^\s*\|/.test(줄들[i])) { 행.push(셀나누기(줄들[i])); i++; }
      블록.push({ 종류: '표', 머리, 행 });
      continue;
    }

    /* 인용 */
    if (/^>\s?/.test(줄)) {
      문단비우기();
      const 줄모음 = [];
      while (i < 줄들.length && /^>/.test(줄들[i])) { 줄모음.push(줄들[i].replace(/^>\s?/, '')); i++; }
      블록.push({ 종류: '인용', 글: 줄모음.join('\n').trim() });
      continue;
    }

    /* 목록 */
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(줄);
    if (li) {
      문단비우기();
      const 순서 = !/^[-*]$/.test(li[2]);
      const 항목 = [];
      while (i < 줄들.length) {
        const m2 = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(줄들[i]);
        if (m2) {
          항목.push({ 깊이: Math.floor(m2[1].length / 2), 글: m2[3].trim() });
          i++;
        } else if (/^\s+\S/.test(줄들[i]) && 항목.length) {
          항목[항목.length - 1].글 += ' ' + 줄들[i].trim();   /* 이어지는 줄 */
          i++;
        } else break;
      }
      블록.push({ 종류: '목록', 순서, 항목 });
      continue;
    }

    if (줄.trim() === '') { 문단비우기(); i++; continue; }
    buf.push(줄);
    i++;
  }
  문단비우기();
  return 블록;
}

export function 차시읽기(경로) {
  const 원문 = readFileSync(경로, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(원문);
  if (!m) throw new Error(`프런트매터가 없다: ${경로}`);
  const fm = {};
  for (const 줄 of m[1].split('\n')) {
    const k = /^(\w+):\s*(.*)$/.exec(줄);
    if (!k) continue;
    let v = k[2].trim();
    if (/^\[/.test(v)) { try { v = new Function(`return (${v})`)(); } catch { /* 그대로 */ } }
    else if (/^\d+$/.test(v)) v = Number(v);
    fm[k[1]] = v;
  }
  return { fm, 본문: m[2], 블록: 블록파싱(m[2]) };
}
