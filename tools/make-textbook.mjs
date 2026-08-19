/**
 * 웹 교과서 → 인쇄용 학습 교재(.docx)
 *
 *   npm run textbook
 *
 * 웹에서 읽는 것과 같은 본문을 종이에 옮긴 것이다. 세 가지만 다르다.
 *   · 예제는 **Python 만** 싣는다. C 예제 자리에는 「웹에서 언어를 바꿔 보라」는 한 줄을 둔다
 *     (본문이 「두 코드」처럼 C 를 가리키는 곳이 있어 그냥 지우면 흐름이 끊긴다)
 *   · 「교과서에서 찾기」는 **씨마스커뮤니케이션(Python)** 하나만 싣는다
 *   · 핵심 용어를 **빈칸**으로 두고 정답은 뒤쪽 부록에 모은다
 *
 * 산출물은 textbook/ 로 나가고 저장소에 올리지 않는다(.gitignore).
 * 빌드 게이트(npm run build)에는 넣지 않는다 — 교재는 필요할 때만 뽑는다.
 *
 * ⚠️ 그림(자체 제작 SVG 도식)을 넣으려면 LibreOffice(soffice)가 있어야 한다.
 *    없으면 그림 자리에 설명만 남기고 계속 진행한다.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  ImageRun, TableOfContents, VerticalAlign, Footer, PageNumber, NumberFormat,
} from 'docx';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { 차시읽기, 블록파싱, 속성파싱 } from './mdx-blocks.mjs';

/* tools/ 의 부모가 저장소 루트다 — 어디서 실행해도 경로가 맞는다 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const 산출폴더 = join(REPO, 'textbook');
const 그림폴더 = join(산출폴더, 'figures');
const 교과서열쇠 = 'cmasscom-py';                    /* 씨마스커뮤니케이션(Python) */
const 차시당빈칸 = 6;

/* ---------- 치수·색 ---------- */
const 본문폭 = 9638;                                  /* A4 - 좌우 2cm */
const 색 = {
  잉크: '1F2933', 흐림: '5B6B7B', 제목: '16324F', 포인트: '2E6FA7',
  선: 'C8D3DF', 코드배경: 'F4F6F8', 코드글: '1B2733',
  머리배경: 'E8EFF6', 출력배경: 'F0F4F0', 빈칸: '11324D',
};
const 박스색 = {
  info: { 배경: 'EFF4FA', 선: 'B9CDE2', 라벨: '1B4F82' },
  tip: { 배경: 'EFF6F0', 선: 'BCD8C0', 라벨: '1F6B37' },
  think: { 배경: 'F4F1FA', 선: 'CFC6E6', 라벨: '4B3A86' },
  warn: { 배경: 'FDF3E7', 선: 'EBCFA6', 라벨: '92551A' },
  story: { 배경: 'F7F4EE', 선: 'DDD3C0', 라벨: '6B5730' },
  더: { 배경: 'F6F7F9', 선: 'D3DAE2', 라벨: '44546A' },
  활동: { 배경: 'FBF7EC', 선: 'E2D2AC', 라벨: '7A5A18' },
};
const 글꼴 = { 본문: 'Malgun Gothic', 코드: 'Consolas' };

/* ---------- 자료 ---------- */
const 교육과정 = JSON.parse(readFileSync(`${REPO}/content/curriculum.json`, 'utf8'));
const 성취기준찾기 = (코드) =>
  교육과정.단원.flatMap((u) => u.성취기준).find((s) => s.코드 === 코드);
const 차시찾기 = (u, l) =>
  교육과정.단원.find((x) => x.단원번호 === u)?.차시.find((c) => c.차시번호 === l);

/* ---------- 빈칸 고르기 ---------- */

/**
 * 이 차시에서 빈칸으로 만들 용어를 고른다.
 *
 * 아무 굵은 글씨나 뽑으면 「몇 달 뒤의 자기 자신」처럼 답할 수 없는 빈칸이 나온다
 * (첫 판에서 실제로 그랬다). 그래서 출처를 둘로 못 박는다 —
 *   ① 본문의 <Term ko="…"> (집필자가 전문용어로 표시한 것)
 *   ② curriculum.json 의 핵심개념 (교육과정 쪽에서 정한 용어)
 * 마무리·종합 차시는 자기 핵심개념이 본문에 안 나오므로 같은 단원 앞 차시의
 * 핵심개념까지 끌어와 쓴다 — 복습 차시에서는 그게 오히려 알맞다.
 */
function 빈칸용어고르기(본문, 핵심개념, 단원핵심 = [], 이미쓴것 = new Set()) {
  const 깨끗 = 본문
    .replace(/<CodeSample[\s\S]*?<\/CodeSample>|<CheckQuiz[\s\S]*?<\/CheckQuiz>|<svg[\s\S]*?<\/svg>/g, '')
    .replace(/^```[\s\S]*?^```/gm, '');

  /** 「자료형(data type)」처럼 괄호가 붙은 것은 앞부분도 함께 후보로 본다 */
  const 넓히기 = (t) => {
    const 벗김 = t.replace(/\(.*?\)/g, '').trim();
    return 벗김 && 벗김 !== t ? [t, 벗김] : [t];
  };

  const terms = [...new Set([...깨끗.matchAll(/<Term\s+ko="([^"]+)"/g)].map((m) => m[1]))];
  const 이차시 = [...new Set(핵심개념.flatMap(넓히기))];
  const 단원것 = [...new Set(단원핵심.flatMap(넓히기))];

  /* 같은 용어를 여러 차시에서 되풀이해 비우면 값이 떨어진다(첫 판에서 「프로그램」이
     일곱 차시에 나왔다). 아직 안 쓴 용어를 앞세우고, 이미 쓴 것은 자리가 남을 때만 쓴다. */
  const 쓴횟수 = (t) => 이미쓴것.get(t) ?? 0;
  const 순서 = [
    ...terms.filter((t) => 쓴횟수(t) === 0),
    ...이차시.filter((t) => 쓴횟수(t) === 0),
    ...단원것.filter((t) => 쓴횟수(t) === 0),
    /* 자리가 남으면 한 번 나온 용어를 다시 쓴다 — 복습이 되므로 나쁘지 않다.
       다만 두 번을 넘기지 않는다(「프로그램」이 일곱 차시에 나왔던 첫 판의 문제). */
    ...terms.filter((t) => 쓴횟수(t) === 1),
    ...이차시.filter((t) => 쓴횟수(t) === 1),
    ...단원것.filter((t) => 쓴횟수(t) === 1),
  ];

  const 뽑기 = [];
  for (const t of 순서) {
    if (뽑기.length >= 차시당빈칸) break;
    if (!t || t.length < 2) continue;
    if (!깨끗.includes(t)) continue;                       /* 본문에 없으면 빈칸을 만들 수 없다 */
    if (뽑기.some((x) => x.includes(t) || t.includes(x))) continue;   /* 겹치는 빈칸 방지 */
    뽑기.push(t);
  }
  return new Set(뽑기);
}

/* ---------- 인라인 ---------- */
const 공백 = String.fromCharCode(160);
const 줄바꿈 = String.fromCharCode(10);
const 동그라미 = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const 번호글 = (n) => (n <= 20 ? 동그라미[n - 1] : `(${n})`);
/* 본문에 손으로 넣은 <Cloze> 의 빈칸 표시.
   자동으로 고른 핵심 용어 빈칸이 ①②③ 을 쓰므로 여기서는 (가)(나)(다) 를 쓴다 —
   한 차시에 두 가지가 함께 나오는데 번호가 같으면 어느 정답인지 알 수 없다. */
const 가나다 = '가나다라마바사아자차카타파하';
const 글자표 = (n) => (n <= 가나다.length ? `(${가나다[n - 1]})` : `(${n})`);

/** 차시 하나를 그리는 동안 유지되는 상태 */
class 차시상태 {
  constructor(빈칸집합, 굵은것만 = true) {
    this.굵은것만 = 굵은것만;
    this.남은 = new Set(빈칸집합);
    this.정답 = [];
    this.문항 = [];
  }
  빈칸쓰기(용어) {
    this.남은.delete(용어);
    this.정답.push(용어);
    return this.정답.length;                      /* 이 차시에서의 빈칸 번호 */
  }
}

/**
 * 문서에 들어가는 글자를 검사한다. 두 번 실제로 겪은 사고를 매번 막는다.
 *
 *   ① XML 이 금지하는 제어문자가 섞이면 **워드가 파일을 아예 열지 못한다.**
 *      처음에 빈칸 표시로 제어문자를 썼다가 그렇게 됐다.
 *   ② 내부 표시(@@…@@)가 새어 나가면 학생이 그 글자를 그대로 본다.
 *      빈칸이 용어 안에 들어갈 때 중괄호가 겹쳐 그렇게 됐다.
 *
 * 조용히 잘못된 파일을 내놓는 것보다 여기서 멈추는 편이 낫다.
 */
const 허용제어 = [9, 10, 13];                    /* 탭·줄바꿈·복귀는 XML 에서 허용된다 */
function 글자검사(글) {
  const 제어 = [...글].find((ch) => ch.charCodeAt(0) < 0x20 && !허용제어.includes(ch.charCodeAt(0)));
  if (제어) {
    throw new Error(
      `문서에 XML 이 금지하는 제어문자(0x${제어.charCodeAt(0).toString(16)})가 들어갔다.` +
      ` 이대로 저장하면 워드가 열지 못한다 → ${JSON.stringify(글.slice(0, 60))}`
    );
  }
  if (글.includes('@@')) {
    throw new Error(`내부 표시(@@)가 본문으로 새어 나갔다 → ${JSON.stringify(글.slice(0, 60))}`);
  }
}

const 실체 = (s) =>
  String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00A0').replace(/&amp;/g, '&');

/**
 * 마크다운·인라인 컴포넌트 → TextRun 목록
 *
 * 글자 표시(@@…@@) 대신 «조각 목록»을 만든다. 표시를 쓰면 빈칸이 용어 안에
 * 들어갈 때 중괄호가 겹쳐 파싱이 깨졌고(2026-08-08), 제어문자를 썼을 때는
 * XML 이 깨져 문서가 아예 열리지 않았다. 구조로 다루면 두 문제가 함께 없어진다.
 */
function 인라인(글, opt = {}) {
  const { 상태 = null, 빈칸허용 = false, 코드체 = false, 크기 = 20, 색상 = 색.잉크, 굵게 = false } = opt;

  /* 1) HTML·인라인 컴포넌트를 마크다운으로 낮춘다 (Term 만 조각으로 따로 뽑는다) */
  let s = String(글)
    .replace(/<LessonLink\b([^>]*?)\/>/g, (_, attr) => {
      const a = 속성파싱(attr);
      const c = 차시찾기(Number(a.unit), Number(a.lesson));
      if (!c) return '';
      return a.번호만 !== undefined ? `${c.차시번호}차시` : `${c.차시번호}차시 「${c.차시명}」`;
    })
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<\/?(strong|b)>/g, '**')
    .replace(/<\/?(em|i)>/g, '*')
    .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');
  s = 실체(s.replace(/<(?!Term)[^>]+>/g, ''));

  /* 2) 조각으로 나눈다 — {글, 굵게, 기울임, 코드, 용어} */
  const 조각 = [];
  const 밀기 = (글, 꾸밈) => { if (글) 조각.push({ 글, ...꾸밈 }); };

  const 나누기 = (글, 꾸밈) => {
    const 토큰 = String(글).split(/(<Term\b[^>]*?\/>|\*\*[^*]*?\*\*|`[^`]*?`|\*[^*\n]+?\*)/g);
    for (const t of 토큰) {
      if (!t) continue;
      let m;
      if ((m = /^<Term\b([^>]*?)\/>$/.exec(t))) {
        const a = 속성파싱(m[1]);
        밀기(a.ko, { ...꾸밈, 굵게: true, 용어: true });
        if (a.en) 밀기(`(${a.en})`, { ...꾸밈, 굵게: true, 용어: true });
        continue;
      }
      if ((m = /^\*\*([\s\S]*)\*\*$/.exec(t))) { 나누기(m[1], { ...꾸밈, 굵게: true }); continue; }
      if ((m = /^`([\s\S]*)`$/.exec(t))) { 밀기(m[1], { ...꾸밈, 코드: true }); continue; }
      if ((m = /^\*([^*]+)\*$/.exec(t))) { 밀기(m[1], { ...꾸밈, 기울임: true }); continue; }
      밀기(t, 꾸밈);
    }
  };
  나누기(s, { 굵게 });

  /* 3) 빈칸 — 코드가 아닌 조각에서 남은 용어의 첫 등장을 잘라 낸다 */
  const 결과조각 = [];
  for (const p of 조각) {
    const 놓을수있나 = 빈칸허용 && 상태 && 상태.남은.size && !p.코드
      && (!상태.굵은것만 || p.굵게 || p.용어);
    if (!놓을수있나) { 결과조각.push(p); continue; }
    let 남은글 = p.글;
    let 안전장치 = 0;
    while (상태.남은.size && 안전장치++ < 8) {
      let 최소 = -1, 뽑힌 = null;
      for (const t of 상태.남은) {
        const i = 남은글.indexOf(t);
        if (i >= 0 && (최소 < 0 || i < 최소)) { 최소 = i; 뽑힌 = t; }
      }
      if (!뽑힌) break;
      if (최소 > 0) 결과조각.push({ ...p, 글: 남은글.slice(0, 최소) });
      결과조각.push({ 빈칸: 상태.빈칸쓰기(뽑힌), 길이: 뽑힌.length });
      남은글 = 남은글.slice(최소 + 뽑힌.length);
    }
    if (남은글) 결과조각.push({ ...p, 글: 남은글 });
  }

  /* 4) TextRun 으로 */
  const runs = [];
  for (const p of 결과조각) {
    if (p.글) 글자검사(p.글);
    if (p.빈칸) {
      runs.push(new TextRun({
        text: 번호글(p.빈칸), font: 글꼴.본문, size: 크기, color: 색.빈칸, bold: true,
      }));
      runs.push(new TextRun({
        text: 공백.repeat(Math.max(12, Math.min(26, p.길이 * 3 + 4))),
        font: 글꼴.본문, size: 크기, underline: { type: 'single', color: 색.빈칸 },
      }));
      continue;
    }
    if (p.코드) {
      runs.push(new TextRun({
        text: p.글, font: 글꼴.코드, size: 크기 - 2, color: 색.코드글,
        shading: { type: ShadingType.CLEAR, fill: 색.코드배경 },
      }));
      continue;
    }
    runs.push(new TextRun({
      text: p.글,
      font: 코드체 ? 글꼴.코드 : 글꼴.본문,
      size: 크기,
      color: p.용어 ? 색.제목 : 색상,
      bold: p.굵게 || false,
      italics: p.기울임 || false,
    }));
  }
  return runs.length ? runs : [new TextRun({ text: '', font: 글꼴.본문, size: 크기 })];
}

/* ---------- 조각 만들기 도우미 ---------- */
const 문단 = (글, opt = {}) =>
  new Paragraph({
    children: 인라인(글, opt),
    spacing: { before: opt.위 ?? 60, after: opt.아래 ?? 100, line: opt.줄 ?? 300 },
    alignment: opt.정렬,
    indent: opt.들여,
  });

const 빈줄 = (h = 120) => new Paragraph({ text: '', spacing: { before: 0, after: h } });

const 테두리없음 = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};
const 테두리 = (색상, 굵기 = 4) => ({
  top: { style: BorderStyle.SINGLE, size: 굵기, color: 색상 },
  bottom: { style: BorderStyle.SINGLE, size: 굵기, color: 색상 },
  left: { style: BorderStyle.SINGLE, size: 굵기, color: 색상 },
  right: { style: BorderStyle.SINGLE, size: 굵기, color: 색상 },
});

/** 한 칸짜리 상자 */
function 상자(자식들, { 배경, 선, 왼쪽강조 = null }) {
  return new Table({
    width: { size: 본문폭, type: WidthType.DXA },
    columnWidths: [본문폭],
    borders: 왼쪽강조
      ? {
          top: { style: BorderStyle.SINGLE, size: 2, color: 선 },
          bottom: { style: BorderStyle.SINGLE, size: 2, color: 선 },
          right: { style: BorderStyle.SINGLE, size: 2, color: 선 },
          left: { style: BorderStyle.SINGLE, size: 18, color: 왼쪽강조 },
        }
      : 테두리(선, 2),
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: 본문폭, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 배경 },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            children: 자식들.length ? 자식들 : [빈줄(0)],
          }),
        ],
      }),
    ],
  });
}

/** 라벨 줄 */
const 라벨줄 = (글, 색상) =>
  new Paragraph({
    children: [new TextRun({ text: 글, bold: true, size: 18, color: 색상, font: 글꼴.본문 })],
    spacing: { before: 0, after: 80 },
  });

/** 표 */
function 표만들기(머리, 행들, opt = {}) {
  const 열수 = Math.max(머리?.length ?? 0, ...행들.map((r) => r.length));
  if (!열수) return 빈줄(0);
  const 비율 = opt.비율 ?? Array(열수).fill(1);
  const 합 = 비율.reduce((a, b) => a + b, 0);
  const 폭들 = 비율.map((w) => Math.round((본문폭 * w) / 합));
  폭들[폭들.length - 1] = 본문폭 - 폭들.slice(0, -1).reduce((a, b) => a + b, 0);

  const 칸 = (글, i, 머리인가) =>
    new TableCell({
      width: { size: 폭들[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: 머리인가 ? 색.머리배경 : 'FFFFFF' },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      /* 칸 안의 줄바꿈은 문단으로 나눈다 — 한 문단에 몰아넣으면 줄바꿈이 사라져
         학습 목표 ①②가 한 줄에 붙어 버린다(첫 판에서 그랬다). */
      children: String(글 ?? '').split(줄바꿈).map((줄, k) =>
        new Paragraph({
          children: 인라인(줄, { ...opt.인라인, 크기: 18, 굵게: 머리인가, 색상: 머리인가 ? 색.제목 : 색.잉크 }),
          spacing: { before: k === 0 ? 20 : 60, after: 20, line: 260 },
        })
      ),
    });

  const rows = [];
  if (머리?.length) {
    rows.push(new TableRow({
      tableHeader: true,
      children: 머리.map((h, i) => 칸(h, i, true)),
    }));
  }
  for (const r of 행들) {
    const 채운행 = [...r];
    while (채운행.length < 열수) 채운행.push('');
    rows.push(new TableRow({ children: 채운행.map((c, i) => 칸(c, i, false)) }));
  }
  return new Table({
    width: { size: 본문폭, type: WidthType.DXA },
    columnWidths: 폭들,
    borders: 테두리(색.선, 2),
    rows,
  });
}

/**
 * 손으로 적는 줄 칸.
 *
 * 문단 아래 테두리를 여러 개 잇대면 워드가 하나로 합쳐 버려 줄이 한 개만 보인다
 * (첫 판에서 실제로 그랬다). 표의 행마다 아래 테두리를 주면 줄이 제대로 나온다.
 */
function 줄노트(줄수, 폭 = 본문폭 - 460) {
  return new Table({
    width: { size: 폭, type: WidthType.DXA },
    columnWidths: [폭],
    borders: 테두리없음,
    rows: Array.from({ length: 줄수 }, () =>
      new TableRow({
        height: { value: 420, rule: 'atLeast' },
        children: [
          new TableCell({
            width: { size: 폭, type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.DOTTED, size: 6, color: 'A9B7C6' },
            },
            children: [new Paragraph({ text: '', spacing: { before: 0, after: 0 } })],
          }),
        ],
      })
    ),
  });
}

/** 코드 상자 */
function 코드상자(코드, { 배경 = 색.코드배경, 선색 = 색.선 } = {}) {
  const 줄들 = 코드.replace(/\t/g, '    ').split('\n');
  return new Table({
    width: { size: 본문폭, type: WidthType.DXA },
    columnWidths: [본문폭],
    borders: 테두리(선색, 2),
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: 본문폭, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: 배경 },
            margins: { top: 120, bottom: 120, left: 180, right: 140 },
            children: 줄들.map((l) =>
              new Paragraph({
                children: [new TextRun({
                  text: l.replace(/ /g, '\u00A0') || '\u00A0',
                  font: 글꼴.코드, size: 17, color: 색.코드글,
                })],
                spacing: { before: 0, after: 0, line: 250 },
              })
            ),
          }),
        ],
      }),
    ],
  });
}

/* ---------- 블록 → docx ---------- */
function 블록그리기(블록들, 상태, 그림들, 깊이 = 0) {
  const out = [];
  for (const b of 블록들) {
    switch (b.종류) {
      case '제목': {
        const 크기 = b.깊이 === 2 ? 24 : b.깊이 === 3 ? 21 : 20;
        out.push(new Paragraph({
          children: 인라인(b.글, { 크기, 색상: 색.제목, 굵게: true }),
          spacing: { before: b.깊이 === 2 ? 320 : 240, after: 120 },
          border: b.깊이 === 2
            ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: 색.선, space: 6 } }
            : undefined,
          keepNext: true,
        }));
        break;
      }
      case '문단':
        out.push(문단(b.글, { 상태, 빈칸허용: true }));
        break;
      case '인용':
        out.push(new Paragraph({
          children: 인라인(b.글, { 상태, 빈칸허용: true, 색상: 색.흐림 }),
          spacing: { before: 100, after: 140, line: 300 },
          indent: { left: 280 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 10 } },
        }));
        break;
      case '목록':
        b.항목.forEach((it, i) => {
          const 표시 = b.순서 ? `${i + 1}.` : '·';
          out.push(new Paragraph({
            children: [
              new TextRun({ text: `${표시}\u00A0\u00A0`, font: 글꼴.본문, size: 20, color: 색.포인트, bold: !b.순서 }),
              ...인라인(it.글, { 상태, 빈칸허용: true }),
            ],
            spacing: { before: 30, after: 60, line: 290 },
            indent: { left: 260 + it.깊이 * 240, hanging: 260 },
          }));
        });
        break;
      case '표':
        out.push(표만들기(b.머리, b.행, { 인라인: { 상태, 빈칸허용: true } }));
        out.push(빈줄(140));
        break;
      case '코드':
        out.push(코드상자(b.코드));
        out.push(빈줄(140));
        break;
      case '컴포넌트':
        out.push(...컴포넌트그리기(b, 상태, 그림들, 깊이));
        break;
    }
  }
  return out;
}

function 컴포넌트그리기(b, 상태, 그림들, 깊이) {
  const out = [];
  switch (b.이름) {
    case 'InfoBox': {
      const v = b.속성.variant ?? 'info';
      const c = 박스색[v] ?? 박스색.info;
      const 안 = 블록그리기(블록파싱(b.안), 상태, 그림들, 깊이 + 1);
      const 자식 = b.속성.label ? [라벨줄(b.속성.label, c.라벨), ...안] : 안;
      out.push(상자(자식, { 배경: c.배경, 선: c.선 }));
      out.push(빈줄(150));
      break;
    }
    case 'MoreBox': {
      const c = 박스색.더;
      const 머리 = `더 알아보기${b.속성.tag ? ` · ${b.속성.tag}` : ''}`;
      const 안 = 블록그리기(블록파싱(b.안), 상태, 그림들, 깊이 + 1);
      out.push(상자([
        라벨줄(머리, c.라벨),
        new Paragraph({
          children: 인라인(b.속성.title ?? '', { 크기: 20, 굵게: true, 색상: 색.제목 }),
          spacing: { before: 0, after: 100 },
        }),
        ...안,
      ], { 배경: c.배경, 선: c.선 }));
      out.push(빈줄(150));
      break;
    }
    case 'Activity': {
      const c = 박스색.활동;
      const 머리 = `${b.속성.kind ?? '활동'}${b.속성.time ? ` · ${b.속성.time}분` : ''}`;
      const 안 = 블록그리기(블록파싱(b.안), 상태, 그림들, 깊이 + 1);
      out.push(상자([
        라벨줄(머리, c.라벨),
        new Paragraph({
          children: 인라인(b.속성.title ?? '', { 크기: 21, 굵게: true, 색상: 색.제목 }),
          spacing: { before: 0, after: 120 },
        }),
        ...안,
      ], { 배경: c.배경, 선: c.선, 왼쪽강조: c.라벨 }));
      out.push(빈줄(150));
      break;
    }
    case 'CompareTable': {
      if (b.속성.caption) {
        out.push(new Paragraph({
          children: [new TextRun({ text: `▸ ${b.속성.caption}`, size: 18, bold: true, color: 색.흐림, font: 글꼴.본문 })],
          spacing: { before: 140, after: 70 }, keepNext: true,
        }));
      }
      const 행 = (b.속성.rows ?? []).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]));
      out.push(표만들기(b.속성.headers ?? [], 행, { 인라인: { 상태, 빈칸허용: true } }));
      out.push(빈줄(150));
      break;
    }
    case 'MiniCards': {
      const items = b.속성.items ?? [];
      const 행 = items.map((it) => [
        `**${it.tag ?? ''}**`,
        `**${it.title ?? ''}**`,
        it.body ?? '',
      ]);
      out.push(표만들기(['구분', '이름', '내용'], 행, { 비율: [1, 2, 5], 인라인: { 상태, 빈칸허용: true } }));
      out.push(빈줄(150));
      break;
    }
    case 'CodeSample': {
      if (b.속성.lang !== 'python') {
        /* 이 교재는 Python 기준이다. 다만 본문이 「두 코드」처럼 C 예제를 가리키는
           곳이 있어, 빠진 자리를 알려 주어야 읽는 흐름이 끊기지 않는다. */
        out.push(new Paragraph({
          children: [new TextRun({
            text: `［C 예제 「${b.속성.caption ?? ''}」는 이 교재에 싣지 않았다 — 웹 교과서에서 언어를 C 로 바꾸면 볼 수 있다］`,
            size: 17, color: 색.흐림, italics: true, font: 글꼴.본문,
          })],
          spacing: { before: 100, after: 160 },
        }));
        break;
      }
      const m = /\{`([\s\S]*)`\}/.exec(b.안);
      if (!m) break;
      const 코드 = m[1].replace(/\\\\/g, '\\').replace(/\\`/g, '`').trim();
      out.push(new Paragraph({
        children: [
          new TextRun({ text: 'Python  ', bold: true, size: 17, color: 색.포인트, font: 글꼴.본문 }),
          new TextRun({ text: b.속성.caption ?? '', size: 18, bold: true, color: 색.제목, font: 글꼴.본문 }),
        ],
        spacing: { before: 160, after: 70 }, keepNext: true,
      }));
      out.push(코드상자(코드));
      if (typeof b.속성.stdin === 'string' && b.속성.stdin.length) {
        out.push(빈줄(60));
        out.push(라벨줄('넣어 줄 입력', 색.흐림));
        out.push(코드상자(b.속성.stdin.replace(/\n$/, ''), { 배경: 'FFFDF3', 선색: 'E6D9B0' }));
      }
      out.push(빈줄(60));
      out.push(라벨줄(b.속성.norun ? '실행 결과 (아래 설명 참고)' : '실행 결과', 색.흐림));
      const 출력 = String(b.속성.expect ?? '').replace(/\n$/, '');
      out.push(코드상자(출력 || '(출력 없음)', { 배경: 색.출력배경, 선색: 'C3D6C3' }));
      out.push(빈줄(160));
      break;
    }
    /* ── 웹의 상호작용 요소들. 종이에서는 「직접 적는 칸」으로 바꿔 싣는다.
          여기를 빠뜨리면 교재에서 그 내용이 통째로 사라지므로 반드시 다룬다. ── */
    case 'Cloze': {
      const 조각 = [];
      let 남음 = String(b.속성.text ?? '');
      let 번 = 0;
      const 정답 = [];
      const re = /\[\[(.+?)\]\]/g;
      let mm, 끝 = 0;
      while ((mm = re.exec(남음)) !== null) {
        if (mm.index > 끝) 조각.push({ 글: 남음.slice(끝, mm.index) });
        const [앞] = mm[1].split('::');
        const 답 = 앞.split('|')[0].trim();
        번 += 1;
        정답.push(답);
        조각.push({ 빈칸: 번, 길이: 답.length });
        끝 = mm.index + mm[0].length;
      }
      if (끝 < 남음.length) 조각.push({ 글: 남음.slice(끝) });

      const 줄 = [];
      for (const p of 조각) {
        if (p.빈칸) {
          줄.push(new TextRun({ text: 글자표(p.빈칸), font: 글꼴.본문, size: 20, color: 색.빈칸, bold: true }));
          줄.push(new TextRun({
            text: 공백.repeat(Math.max(12, Math.min(26, p.길이 * 3 + 4))),
            font: 글꼴.본문, size: 20, underline: { type: 'single', color: 색.빈칸 },
          }));
        } else {
          줄.push(...인라인(p.글, { 크기: 20 }));
        }
      }
      out.push(상자([
        라벨줄(`빈칸 채우기${b.속성.title ? ` · ${b.속성.title}` : ''}`, 박스색.tip.라벨),
        new Paragraph({ children: 줄, spacing: { before: 40, after: 60, line: 340 } }),
        new Paragraph({
          children: [new TextRun({
            text: `정답 — ${정답.map((t, i) => `${글자표(i + 1)} ${t}`).join('   ')}`,
            size: 16, color: 색.흐림, font: 글꼴.본문,
          })],
          spacing: { before: 60, after: 0 },
        }),
      ], { 배경: 박스색.tip.배경, 선: 박스색.tip.선 }));
      out.push(빈줄(150));
      break;
    }
    case 'Predict': {
      out.push(상자([
        라벨줄('예상해 보기', 박스색.활동.라벨),
        new Paragraph({ children: 인라인(b.속성.question ?? '', { 크기: 20, 굵게: true }), spacing: { before: 0, after: 100 } }),
        줄노트(2),
        new Paragraph({
          children: [new TextRun({ text: `실제 결과 — ${String(b.속성.answer ?? '').replace(/\n/g, ' / ')}`, size: 16, color: 색.흐림, font: 글꼴.본문 })],
          spacing: { before: 80, after: 0 },
        }),
      ], { 배경: 박스색.활동.배경, 선: 박스색.활동.선 }));
      out.push(빈줄(150));
      break;
    }
    case 'Sorter': {
      const 것들 = b.속성.items ?? [];
      out.push(상자([
        라벨줄(`순서 맞추기${b.속성.title ? ` · ${b.속성.title}` : ''}`, 박스색.info.라벨),
        new Paragraph({
          children: [new TextRun({ text: '아래를 순서대로 다시 늘어놓아 보자 (가나다 순으로 섞어 두었다).', size: 17, color: 색.흐림, font: 글꼴.본문 })],
          spacing: { before: 0, after: 100 },
        }),
        /* 종이에서는 정답 순서를 그대로 보이면 안 되므로 가나다 순으로 섞는다 */
        new Paragraph({
          children: 인라인([...것들].sort((a, b2) => String(a).localeCompare(String(b2), 'ko')).join('  ·  '), { 크기: 19 }),
          spacing: { before: 0, after: 120 },
        }),
        줄노트(것들.length),
        ...(b.속성.explain
          ? [new Paragraph({ children: [new TextRun({ text: b.속성.explain, size: 16, color: 색.흐림, font: 글꼴.본문 })], spacing: { before: 80 } })]
          : []),
      ], { 배경: 박스색.info.배경, 선: 박스색.info.선 }));
      out.push(빈줄(150));
      break;
    }
    case 'Bucket': {
      const 통 = b.속성.buckets ?? [];
      const 것들 = b.속성.items ?? [];
      out.push(new Paragraph({
        children: [new TextRun({ text: `분류하기${b.속성.title ? ` — ${b.속성.title}` : ''}`, size: 18, bold: true, color: 박스색.info.라벨, font: 글꼴.본문 })],
        spacing: { before: 200, after: 70 }, keepNext: true,
      }));
      out.push(new Paragraph({
        children: [new TextRun({ text: `보기를 알맞은 갈래에 적어 보자 — ${통.join(' · ')}`, size: 17, color: 색.흐림, font: 글꼴.본문 })],
        spacing: { before: 0, after: 90 }, keepNext: true,
      }));
      out.push(표만들기(
        ['보기', '어느 갈래인가'],
        것들.map((it) => [String(it.글 ?? ''), '']),
        { 비율: [3, 2], 인라인: {} }
      ));
      out.push(new Paragraph({
        children: [new TextRun({
          text: `정답 — ${것들.map((it) => `${String(it.글 ?? '').replace(/<[^>]+>/g, '')}: ${it.통}`).join(' / ')}`,
          size: 16, color: 색.흐림, font: 글꼴.본문,
        })],
        spacing: { before: 70, after: 160 },
      }));
      break;
    }
    case 'CodeTask': {
      const 자식 = [
        라벨줄(`코드 작성 실습 · ${b.속성.lang === 'c' ? 'C' : 'Python'}`, 박스색.활동.라벨),
        new Paragraph({
          children: 인라인(b.속성.title ?? '', { 크기: 21, 굵게: true, 색상: 색.제목 }),
          spacing: { before: 0, after: 120 },
        }),
        ...블록그리기(블록파싱(b.안), 상태, 그림들, 깊이 + 1),
        빈줄(60),
        라벨줄('여기에 직접 적어 보자', 색.흐림),
      ];
      자식.push(줄노트(10));
      out.push(상자(자식, { 배경: 'FFFFFF', 선: 박스색.활동.선, 왼쪽강조: 박스색.활동.라벨 }));
      out.push(빈줄(150));
      break;
    }
    case 'Figure': {
      const 그림 = 그림들.shift();
      if (그림 && existsSync(그림.경로)) {
        out.push(new Paragraph({
          children: [new ImageRun({
            data: readFileSync(그림.경로), type: 'png',
            transformation: { width: 격자맞춤(그림).폭, height: 격자맞춤(그림).높 },
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 60 },
        }));
      }
      if (b.속성.caption) {
        out.push(new Paragraph({
          children: [new TextRun({ text: `[그림] ${b.속성.caption}`, size: 17, color: 색.흐림, font: 글꼴.본문 })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 180 },
        }));
      }
      break;
    }
    case 'CheckQuiz': {
      const 문항들 = [...b.안.matchAll(/<QuizItem\b([\s\S]*?)\/>/g)].map((m) => 속성파싱(m[1]));
      out.push(new Paragraph({
        children: 인라인(b.속성.title ?? '개념 확인 문제', { 크기: 23, 굵게: true, 색상: 색.제목 }),
        spacing: { before: 340, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 색.선, space: 6 } },
        keepNext: true,
      }));
      out.push(new Paragraph({
        children: [new TextRun({ text: '정답은 책 뒤 「부록 2 — 확인 문제 정답」에 있다.', size: 17, color: 색.흐림, italics: true, font: 글꼴.본문 })],
        spacing: { before: 0, after: 140 },
      }));
      문항들.forEach((q, i) => {
        상태.문항.push({ 번호: i + 1, 정답: Number(q.answer) + 1, 해설: q.explain ?? '', 성취기준: q.std ?? '' });
        out.push(new Paragraph({
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, size: 20, color: 색.포인트, font: 글꼴.본문 }),
            ...인라인(q.stem ?? '', { 크기: 20 }),
          ],
          spacing: { before: 170, after: 80, line: 290 },
          keepNext: true,
        }));
        (q.choices ?? []).forEach((ch, k) => {
          out.push(new Paragraph({
            children: [
              new TextRun({ text: `${번호글(k + 1)}\u00A0`, size: 19, color: 색.흐림, font: 글꼴.본문 }),
              ...인라인(String(ch), { 크기: 19 }),
            ],
            spacing: { before: 20, after: 20, line: 270 },
            indent: { left: 420, hanging: 240 },
          }));
        });
        out.push(new Paragraph({
          children: [
            new TextRun({ text: '내가 고른 답 ', size: 18, color: 색.흐림, font: 글꼴.본문 }),
            new TextRun({ text: '(\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0)', size: 20, color: 색.빈칸, font: 글꼴.본문 }),
          ],
          spacing: { before: 60, after: 60 },
          indent: { left: 420 },
        }));
      });
      out.push(빈줄(120));
      break;
    }
    default:
      /* 웹에 새 컴포넌트를 넣고 여기를 잊으면 그 내용이 교재에서 조용히 사라진다.
         그래서 모르는 것은 소리 내어 알린다. */
      console.log(`  경고 교재 생성기가 모르는 컴포넌트다 — <${b.이름}> (이 자리는 비워 둔다)`);
      break;
  }
  return out;
}

/** 그림을 본문 폭에 맞춘다 (PNG 를 2배 해상도로 만들었으므로 절반으로 넣는다) */
function 격자맞춤(그림) {
  const 최대폭 = 600;                                  /* px 기준 — 본문 폭에 가깝게 */
  const 폭 = Math.min(최대폭, 그림.폭 / 2);
  return { 폭: Math.round(폭), 높: Math.round((폭 * 그림.높이) / 그림.폭) };
}

/* ---------- 그림: 본문 안 SVG → PNG ---------- */

/** LibreOffice 를 찾는다. 없으면 null — 그림 없이도 교재는 나온다. */
function soffice찾기() {
  const 후보 = [
    process.env.SOFFICE,
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
  ].filter(Boolean);
  for (const p of 후보) if (existsSync(p)) return p;
  const r = spawnSync('soffice', ['--version'], { encoding: 'utf8' });
  return r.error ? null : 'soffice';
}

/** PNG 머리(IHDR)에서 크기를 읽는다 — 폭·높이만 알면 되므로 라이브러리가 필요 없다 */
function png크기(경로) {
  const b = readFileSync(경로);
  return { 폭: b.readUInt32BE(16), 높이: b.readUInt32BE(20) };
}

/**
 * 차시 본문의 <svg>…</svg> 를 뽑아 PNG 로 바꿔 둔다.
 * 이미 만들어 둔 PNG 가 MDX 보다 새것이면 다시 만들지 않는다(캐시).
 */
function 그림준비(교육과정) {
  mkdirSync(그림폴더, { recursive: true });
  const 목록 = new Map();                             /* 차시열쇠 → [{경로, 폭, 높이}] */
  const 새로만들SVG = [];

  for (const u of 교육과정.단원) {
    for (const c of u.차시) {
      const rel = `${String(u.단원번호).padStart(2, '0')}-${String(c.차시번호).padStart(2, '0')}`;
      const mdx = join(REPO, 'content', 'units', rel.replace('-', '/') + '.mdx');
      const { 본문 } = 차시읽기(mdx);
      const svgs = [...본문.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);
      if (!svgs.length) continue;

      const 이것 = [];
      svgs.forEach((svg, i) => {
        const 열쇠 = `fig-${rel}-${i + 1}`;
        const svg경로 = join(그림폴더, `${열쇠}.svg`);
        const png경로 = join(그림폴더, `${열쇠}.png`);

        /* 루트 <svg> 에 크기가 없으면(반응형) viewBox 로 2배 크기를 박아 준다.
           그러지 않으면 LibreOffice 가 아주 작게 래스터화한다. */
        let s = svg;
        if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s);
        if (vb && !/^<svg[^>]*\swidth=/.test(s)) {
          s = s.replace('<svg', `<svg width="${Math.round(vb[1] * 2)}" height="${Math.round(vb[2] * 2)}"`);
        }
        writeFileSync(svg경로, s, 'utf8');

        const 새것인가 = existsSync(png경로) && statSync(png경로).mtimeMs >= statSync(mdx).mtimeMs;
        if (!새것인가) 새로만들SVG.push(svg경로);
        이것.push({ 경로: png경로 });
      });
      목록.set(rel, 이것);
    }
  }

  if (새로만들SVG.length) {
    const soffice = soffice찾기();
    if (!soffice) {
      console.log(`  경고 LibreOffice(soffice)를 못 찾아 그림 ${새로만들SVG.length}개를 건너뛴다.`);
      console.log('       그림 자리에는 설명만 남는다. SOFFICE 환경 변수로 경로를 줄 수 있다.');
    } else {
      const r = spawnSync(soffice, [
        '--headless', '--norestore', '--convert-to', 'png', '--outdir', 그림폴더, ...새로만들SVG,
      ], { encoding: 'utf8', timeout: 300000 });
      if (r.status !== 0) console.log('  경고 그림 변환이 실패했다:', (r.stderr || '').trim().slice(0, 200));
    }
  }

  /* 만들어진 PNG 의 실제 크기를 읽어 채운다. 없는 것은 목록에서 뺀다. */
  for (const [rel, 것들] of 목록) {
    목록.set(rel, 것들.filter((g) => {
      if (!existsSync(g.경로)) return false;
      Object.assign(g, png크기(g.경로));
      return true;
    }));
  }
  const 만든수 = [...목록.values()].reduce((a, x) => a + x.length, 0);
  console.log(`그림 ${만든수}개 준비 (${그림폴더})`);
  return 목록;
}

/* ---------- 문서 조립 ---------- */
mkdirSync(산출폴더, { recursive: true });
const 그림표 = 그림준비(교육과정);

const 자식들 = [];

/* 표지 */
자식들.push(
  빈줄(2100),
  new Paragraph({
    children: [new TextRun({ text: 교육과정.메타.과목구분, size: 20, color: 색.흐림, font: 글꼴.본문, characterSpacing: 40 })],
    alignment: AlignmentType.CENTER, spacing: { after: 160 },
  }),
  new Paragraph({
    children: [new TextRun({ text: `고등학교  ${교육과정.메타.과목명}`, size: 60, bold: true, color: 색.제목, font: 글꼴.본문 })],
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
  }),
  new Paragraph({
    children: [new TextRun({ text: '학습 교재 · Python 기준', size: 26, color: 색.포인트, font: 글꼴.본문 })],
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
  }),
  new Paragraph({
    children: [new TextRun({ text: '2022 개정 교육과정', size: 20, color: 색.흐림, font: 글꼴.본문 })],
    alignment: AlignmentType.CENTER, spacing: { after: 900 },
  }),
  new Paragraph({
    children: [new TextRun({
      text: `${교육과정.단원.length}단원 ${교육과정.메타.총차시}차시  ·  성취기준 ${교육과정.단원.flatMap((u) => u.성취기준).length}개`,
      size: 20, color: 색.잉크, font: 글꼴.본문,
    })],
    alignment: AlignmentType.CENTER, spacing: { after: 1100 },
  })
);
자식들.push(표만들기(null, [
  ['**학년 · 반 · 번호**', ''],
  ['**이름**', ''],
], { 비율: [1, 3] }));
자식들.push(
  빈줄(1500),
  new Paragraph({
    children: [new TextRun({ text: '웹 교과서  https://trmoo.github.io/22hs-programming/', size: 19, color: 색.포인트, font: 글꼴.본문 })],
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
  }),
  new Paragraph({
    children: [new TextRun({ text: '© 2026 티쳐무 · 모든 권리 보유 · 학교 수업 목적으로만 이용', size: 17, color: 색.흐림, font: 글꼴.본문 })],
    alignment: AlignmentType.CENTER,
  }),
  new Paragraph({ children: [new PageBreak()] })
);

/* 쓰는 방법 */
자식들.push(
  new Paragraph({
    children: [new TextRun({ text: '이 교재를 쓰는 방법', size: 30, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 8 } },
  }),
  빈줄(200)
);
const 안내 = [
  ['빈칸 채우기', '차시마다 핵심 용어를 ①②③ 번호가 붙은 빈칸으로 두었다. 본문을 읽으며 직접 적어 보자. 정답은 책 뒤 「부록 1」에 차시별로 모아 두었다. 먼저 채우고 나중에 맞춰 보는 순서로 쓴다.'],
  ['예제는 Python', '이 교재의 예제는 모두 Python 이다. 같은 내용을 C 로 보려면 웹 교과서 상단에서 언어를 C 로 바꾼다.'],
  ['실행 결과', '예제마다 실행 결과를 함께 실었다. 모두 실제로 실행해 확인한 값이다. 먼저 결과를 예상해 적고 나서 아래를 확인하면 훨씬 남는다.'],
  ['직접 돌려 보기', '웹 교과서에서 같은 예제에 [▶ 실행] 단추가 있다. 설치 없이 브라우저에서 돌아간다. 값을 바꿔 가며 확인해 보자.'],
  ['확인 문제', '차시 끝의 확인 문제는 고른 답을 적는 칸만 두었다. 정답과 해설은 「부록 2」에 있다.'],
  ['교과서에서 찾기', '차시마다 씨마스커뮤니케이션 「프로그래밍(Python)」 교과서의 해당 위치를 적어 두었다.'],
];
자식들.push(표만들기(['무엇', '어떻게'], 안내, { 비율: [1, 4] }));
자식들.push(빈줄(300));
자식들.push(상자([
  라벨줄('빈칸은 이렇게 생겼다', 박스색.info.라벨),
  new Paragraph({
    children: [
      ...인라인('보기 — ', { 크기: 20 }),
      new TextRun({ text: '①', bold: true, size: 20, color: 색.빈칸, font: 글꼴.본문 }),
      new TextRun({ text: '\u00A0'.repeat(12), size: 20, underline: { type: 'single', color: 색.빈칸 }, font: 글꼴.본문 }),
      ...인라인('은 값을 담아 두는 이름이다.', { 크기: 20 }),
    ],
    spacing: { before: 40, after: 40, line: 300 },
  }),
], { 배경: 박스색.info.배경, 선: 박스색.info.선 }));
자식들.push(new Paragraph({ children: [new PageBreak()] }));

/* 목차 */
자식들.push(
  new Paragraph({
    children: [new TextRun({ text: '차례', size: 30, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 8 } },
  }),
  빈줄(160),
  new Paragraph({
    children: [new TextRun({ text: '（Word 에서 이 표를 눌러 [필드 업데이트] 하면 쪽 번호가 채워진다）', size: 17, color: 색.흐림, italics: true, font: 글꼴.본문 })],
    spacing: { after: 200 },
  }),
  new TableOfContents('차례', { hyperlink: true, headingStyleRange: '1-2' })
);

/* 여기까지가 앞부속(표지·쓰는 방법·차례)이다. 쪽 번호를 붙이지 않으려고
   구역을 나눈다 — 본문은 1쪽부터 다시 센다. */
const 앞부속 = 자식들.splice(0);

/* 단원·차시 */
const 정답모음 = [];
const 이미쓴용어 = new Map();       /* 용어 → 문서 전체에서 빈칸으로 쓴 횟수 (최대 2) */
for (const u of 교육과정.단원) {
  /* 단원 표지 */
  자식들.push(
    빈줄(500),
    new Paragraph({
      children: [new TextRun({ text: `${u.단원번호}단원`, size: 22, bold: true, color: 색.포인트, font: 글꼴.본문, characterSpacing: 60 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: u.단원명, size: 44, bold: true, color: 색.제목, font: 글꼴.본문 })],
      spacing: { after: 140 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `${u.영역} · ${u.차시.length}차시 · 성취기준 ${u.성취기준.length}개`, size: 19, color: 색.흐림, font: 글꼴.본문 })],
      spacing: { after: 300 },
    }),
    문단(u.단원개요, { 아래: 240 })
  );
  if (u.핵심아이디어?.length) {
    자식들.push(상자([
      라벨줄('핵심 아이디어', 박스색.tip.라벨),
      ...u.핵심아이디어.map((k) => new Paragraph({
        children: [
          new TextRun({ text: '·\u00A0\u00A0', size: 20, color: 색.포인트, bold: true, font: 글꼴.본문 }),
          ...인라인(k, { 크기: 20 }),
        ],
        spacing: { before: 30, after: 50, line: 290 },
        indent: { left: 240, hanging: 240 },
      })),
    ], { 배경: 박스색.tip.배경, 선: 박스색.tip.선 }));
    자식들.push(빈줄(240));
  }
  자식들.push(new Paragraph({
    children: [new TextRun({ text: '이 단원의 성취기준', size: 21, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 200, after: 100 }, keepNext: true,
  }));
  자식들.push(표만들기(['코드', '성취기준'], u.성취기준.map((s) => [`**${s.코드}**`, s.본문]), { 비율: [1, 5] }));
  자식들.push(new Paragraph({ children: [new PageBreak()] }));

  /* 차시 */
  for (const c of u.차시) {
    const rel = `${String(u.단원번호).padStart(2, '0')}/${String(c.차시번호).padStart(2, '0')}`;
    const { fm, 본문, 블록 } = 차시읽기(`${REPO}/content/units/${rel}.mdx`);
    /* 마무리·종합 차시는 자기 핵심개념이 본문에 안 나온다. 같은 단원 앞 차시의
       핵심개념까지 후보로 넘겨 복습 빈칸을 만든다. */
    const 단원핵심 = u.차시.filter((x) => x.차시번호 < c.차시번호).flatMap((x) => x.핵심개념);
    const 후보 = 빈칸용어고르기(본문, c.핵심개념, 단원핵심, 이미쓴용어);
    const 그림들 = 그림표.get(`${String(u.단원번호).padStart(2, '0')}-${String(c.차시번호).padStart(2, '0')}`) ?? [];

    /* 빈칸은 굵은 글씨·용어 자리에 놓는 편이 좋다(정의하는 문장이기 때문).
       그렇게 해서 3개도 못 채우면 평범한 본문까지 열어 다시 그린다.
       한 번 그려 보고 버리는 셈이지만 파싱이 빨라 값이 싸다. */
    let 상태 = new 차시상태(후보, true);
    let 본문조각 = 블록그리기(블록, 상태, [...그림들]);
    if (상태.정답.length < 3) {
      상태 = new 차시상태(후보, false);
      본문조각 = 블록그리기(블록, 상태, [...그림들]);
    }

    자식들.push(
      new Paragraph({
        children: [new TextRun({ text: `${u.단원번호}단원 · ${c.차시번호}차시`, size: 18, bold: true, color: 색.포인트, font: 글꼴.본문, characterSpacing: 30 })],
        spacing: { before: 120, after: 60 },
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: c.차시명, size: 34, bold: true, color: 색.제목, font: 글꼴.본문 })],
        spacing: { after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 8 } },
      }),
      문단(fm.lead ?? '', { 아래: 200, 색상: 색.흐림 })
    );

    /* 학습 목표 · 관련 성취기준 */
    자식들.push(표만들기(null, [
      ['**학습 목표**', c.학습목표.map((o, i) => `${번호글(i + 1)} ${o}`).join('\n')],
      ['**관련 성취기준**', c.담당성취기준.map((코드) => {
        const s = 성취기준찾기(코드);
        return `**[${코드}]** ${s ? s.본문 : ''}`;
      }).join('\n')],
    ], { 비율: [1, 4] }));
    자식들.push(빈줄(120));
    /* 빈칸이 없는 차시(용어가 제목·표에만 나오는 경우)에는 안내를 붙이지 않는다 */
    if (상태.정답.length > 0) {
      자식들.push(new Paragraph({
        children: [new TextRun({
          text: `이 차시의 빈칸 ${상태.정답.length}개 — 본문을 읽으며 채운다`,
          size: 17, color: 색.흐림, italics: true, font: 글꼴.본문,
        })],
        spacing: { before: 0, after: 220 },
      }));
    } else {
      자식들.push(빈줄(160));
    }

    /* 본문 */
    자식들.push(...본문조각);

    /* 교과서에서 찾기 — 씨마스커뮤니케이션(Python) 만 */
    const 매핑 = c.담당성취기준
      .map((코드) => 성취기준찾기(코드)?.출판사별매핑?.[교과서열쇠])
      .find((m) => m !== undefined);
    if (매핑) {
      자식들.push(new Paragraph({
        children: [new TextRun({ text: '교과서에서 찾기', size: 23, bold: true, color: 색.제목, font: 글꼴.본문 })],
        spacing: { before: 340, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 색.선, space: 6 } },
        keepNext: true,
      }));
      자식들.push(표만들기(
        ['교과서', '단원', '절', '쪽수'],
        [['씨마스커뮤니케이션\n프로그래밍(Python)', 매핑.단원명 ?? '', 매핑.절제목 ?? '', 매핑.쪽수 ?? '']],
        { 비율: [2, 2, 3, 1] }
      ));
      자식들.push(빈줄(120));
    }

    for (const t of 상태.정답) 이미쓴용어.set(t, (이미쓴용어.get(t) ?? 0) + 1);
    정답모음.push({
      단원: u.단원번호, 차시: c.차시번호, 차시명: c.차시명,
      빈칸: 상태.정답, 문항: 상태.문항,
    });
    자식들.push(new Paragraph({ children: [new PageBreak()] }));
  }
}

/* 부록 1 — 빈칸 정답 */
자식들.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: '부록 1 — 빈칸 정답', size: 36, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 8 } },
  }),
  문단('먼저 스스로 채운 뒤에 맞춰 보자. 낱말이 조금 달라도 뜻이 같으면 맞은 것으로 본다.', { 아래: 240, 색상: 색.흐림 })
);
for (const u of 교육과정.단원) {
  자식들.push(new Paragraph({
    children: [new TextRun({ text: `${u.단원번호}단원 ${u.단원명}`, size: 24, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 260, after: 100 }, keepNext: true,
  }));
  const 행 = 정답모음.filter((x) => x.단원 === u.단원번호).map((x) => [
    `**${x.차시}차시**`,
    x.차시명,
    x.빈칸.length ? x.빈칸.map((t, i) => `${번호글(i + 1)} ${t}`).join('   ') : '(빈칸 없음)',
  ]);
  자식들.push(표만들기(['차시', '제목', '빈칸 정답'], 행, { 비율: [1, 3, 6] }));
}
자식들.push(new Paragraph({ children: [new PageBreak()] }));

/* 부록 2 — 확인 문제 정답 */
자식들.push(
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: '부록 2 — 확인 문제 정답과 해설', size: 36, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 200, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 색.포인트, space: 8 } },
  }),
  문단('틀린 문제는 해설을 읽고, 그 내용을 다루는 본문으로 돌아가 다시 본다.', { 아래: 240, 색상: 색.흐림 })
);
for (const x of 정답모음) {
  if (!x.문항.length) continue;
  자식들.push(new Paragraph({
    children: [new TextRun({ text: `${x.단원}단원 ${x.차시}차시 · ${x.차시명}`, size: 21, bold: true, color: 색.제목, font: 글꼴.본문 })],
    spacing: { before: 240, after: 80 }, keepNext: true,
  }));
  자식들.push(표만들기(
    ['번호', '정답', '해설', '성취기준'],
    x.문항.map((q) => [`${q.번호}`, `**${번호글(q.정답)}**`, q.해설, q.성취기준]),
    { 비율: [1, 1, 9, 2] }
  ));
}

/* ---------- 저장 ---------- */
const 문서 = new Document({
  creator: '티쳐무',
  title: `고등학교 프로그래밍 학습 교재 (Python 기준)`,
  description: '2022 개정 교육과정 고등학교 「프로그래밍」 웹 교과서를 그대로 옮긴 학습 교재',
  styles: {
    default: {
      document: { run: { font: 글꼴.본문, size: 20, color: 색.잉크 } },
      heading1: { run: { font: 글꼴.본문, size: 40, bold: true, color: 색.제목 } },
      heading2: { run: { font: 글꼴.본문, size: 32, bold: true, color: 색.제목 } },
    },
  },
  sections: [
    /* 앞부속(표지·쓰는 방법·차례) — 쪽 번호를 붙이지 않는다 */
    {
      properties: {
        page: { margin: { top: 1250, right: 1134, bottom: 1250, left: 1134, header: 700, footer: 700 } },
      },
      children: 앞부속,
    },
    /* 본문·부록 — 여기서부터 1쪽 */
    {
      properties: {
        page: {
          margin: { top: 1250, right: 1134, bottom: 1400, left: 1134, header: 700, footer: 700 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200 },
              children: [
                new TextRun({ text: '고등학교 프로그래밍  ·  ', size: 16, color: 색.흐림, font: 글꼴.본문 }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: 색.잉크, bold: true, font: 글꼴.본문 }),
              ],
            }),
          ],
        }),
      },
      children: 자식들,
    },
  ],
});

const 이름 = join(산출폴더, '고등학교_프로그래밍_학습교재_Python.docx');
writeFileSync(이름, await Packer.toBuffer(문서));

const 빈칸수 = 정답모음.reduce((a, x) => a + x.빈칸.length, 0);
const 문항수 = 정답모음.reduce((a, x) => a + x.문항.length, 0);
console.log(`만들었다: ${이름}`);
console.log(`차시 ${정답모음.length} · 빈칸 ${빈칸수} · 확인 문제 ${문항수}`);
const 빈칸없는차시 = 정답모음.filter((x) => x.빈칸.length === 0);
if (빈칸없는차시.length) {
  console.log('빈칸이 없는 차시:', 빈칸없는차시.map((x) => `${x.단원}-${x.차시}`).join(', '),
    '(핵심 용어가 제목·표에만 나오는 차시다)');
}
