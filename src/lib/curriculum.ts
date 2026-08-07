/**
 * 교육과정 데이터 접근 계층
 *
 * content/curriculum.json 이 단일 진실 공급원이다. 좌측 트리, 우측 목차, 성취기준
 * 배지, 출판사 대조표, 이전/다음 내비게이션이 모두 이 파일 하나에서 파생된다.
 * 성취기준 코드를 화면 어디에도 하드코딩하지 않는다 (CLAUDE.md 2장).
 */
import raw from '../../content/curriculum.json';

/* ---------- 타입 ---------- */

export const TODO = '[확인필요]';

export interface 출처 {
  문서: string;
  구간?: string | null;
  확인일: string | null;
  url?: string | null;
}

export interface 출판사매핑항목 {
  단원명: string;
  절제목?: string | null;
  쪽수: string | null;
}

export interface 성취기준 {
  코드: string;
  본문: string;
  해설?: string | null;
  고려사항?: string | null;
  출처?: 출처;
  출판사별매핑?: Record<string, 출판사매핑항목>;
}

export interface 선수학습 {
  내용: string;
  과목?: string | null;
  성취기준코드?: string | null;
}

export interface 활동 {
  종류: '실습' | '시뮬레이터' | '토의' | '프로젝트' | '조사';
  제목: string;
}

export type 언어 = 'python' | 'c';

export interface 차시 {
  차시번호: number;
  차시명: string;
  담당성취기준: string[];
  학습목표: string[];
  핵심개념: string[];
  선수학습: 선수학습[];
  출판사별매핑: Record<string, 출판사매핑항목>;
  언어?: 언어[];
  예상시간?: number | null;
  활동?: 활동[];
  상태: 'draft' | 'review' | 'published';
}

export interface 단원 {
  단원번호: number;
  영역: string;
  단원명: string;
  단원개요?: string | null;
  핵심아이디어?: string[];
  성취기준: 성취기준[];
  차시: 차시[];
}

export interface 출판사 {
  코드: string;
  표시명: string;
  언어: 언어 | '기타' | '[확인필요]';
  확인: boolean;
  근거?: string;
  단원목록?: { 단원번호: number; 단원명: string; 쪽수: string | null }[];
}

export interface 메타 {
  과목명: string;
  학교급: string;
  과목구분: string;
  성취기준코드접두어: string;
  학점: number | null;
  총차시: number | null;
  출처: 출처;
  확인: boolean;
  작성일: string;
  비고?: string;
}

interface 교육과정 {
  메타: 메타;
  출판사: 출판사[];
  단원: 단원[];
}

const data = raw as unknown as 교육과정;

export const 메타: 메타 = data.메타;
export const 출판사목록: 출판사[] = data.출판사;
export const 단원목록: 단원[] = data.단원;

/* ---------- 파생 데이터 ---------- */

/** 2자리 문자열 슬러그. 단원번호 1 → "01" */
export const slug = (n: number): string => String(n).padStart(2, '0');

/** 잠정 코드인가 — 화면에 고시 코드처럼 표시하지 않기 위한 판별 (CLAUDE.md 3-3) */
export const 잠정코드인가 = (코드: string): boolean => /^잠정\d{2}-\d{2}$/.test(코드);

/** 코드 → 성취기준 (소속 단원 포함) */
const 성취기준색인 = new Map<string, { 성취기준: 성취기준; 단원: 단원 }>();
for (const u of 단원목록) {
  for (const s of u.성취기준) 성취기준색인.set(s.코드, { 성취기준: s, 단원: u });
}

export function 성취기준찾기(코드: string): 성취기준 | undefined {
  return 성취기준색인.get(코드)?.성취기준;
}

export function 성취기준의단원(코드: string): 단원 | undefined {
  return 성취기준색인.get(코드)?.단원;
}

export const 전체성취기준: 성취기준[] = 단원목록.flatMap((u) => u.성취기준);

/** 성취기준 코드 → 담당 차시 목록 (커버리지·역방향 링크에 쓴다) */
export const 성취기준별차시 = new Map<string, { 단원: 단원; 차시: 차시 }[]>();
for (const u of 단원목록) {
  for (const l of u.차시) {
    for (const 코드 of l.담당성취기준) {
      const arr = 성취기준별차시.get(코드) ?? [];
      arr.push({ 단원: u, 차시: l });
      성취기준별차시.set(코드, arr);
    }
  }
}

/* ---------- 선형 순서 (이전/다음 내비게이션) ---------- */

export interface 차시위치 {
  단원: 단원;
  차시: 차시;
  단원슬러그: string;
  차시슬러그: string;
  경로: string;
  제목: string;
  라벨: string;
}

export const 차시순서: 차시위치[] = 단원목록.flatMap((u) =>
  [...u.차시]
    .sort((a, b) => a.차시번호 - b.차시번호)
    .map((l) => ({
      단원: u,
      차시: l,
      단원슬러그: slug(u.단원번호),
      차시슬러그: slug(l.차시번호),
      경로: `/units/${slug(u.단원번호)}/${slug(l.차시번호)}/`,
      제목: l.차시명,
      라벨: `${u.단원번호}단원 ${l.차시번호}차시`,
    }))
);

const 순서색인 = new Map(차시순서.map((p, i) => [p.경로, i]));

export function 이전다음(경로: string): { 이전?: 차시위치; 다음?: 차시위치 } {
  const i = 순서색인.get(경로);
  if (i === undefined) return {};
  return { 이전: 차시순서[i - 1], 다음: 차시순서[i + 1] };
}

/** 이 차시가 제공하는 언어 (비어 있으면 코드 예제가 없는 차시) */
export function 차시언어(l: 차시): 언어[] {
  return l.언어 && l.언어.length ? l.언어 : [];
}

/** 전체 차시 수 */
export const 총차시수 = 차시순서.length;

/** 출판사 코드 → 표시명 */
export const 출판사이름 = new Map(출판사목록.map((p) => [p.코드, p.표시명]));

/** 언어별 출판사 (언어 모드 전환 시 관련 교과서만 보이게 할 때 쓴다) */
export function 출판사by언어(lang: 언어): 출판사[] {
  return 출판사목록.filter((p) => p.언어 === lang);
}
