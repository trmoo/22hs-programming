/**
 * 목차 강조 판정
 *
 * 브라우저 밖에서도 검증할 수 있도록 순수 함수로 분리했다.
 * tools/test-toc.mjs 가 이 함수를 직접 테스트한다.
 */

export interface 제목위치 {
  id: string;
  /** 문서 최상단 기준 제목의 y 좌표 (px) */
  top: number;
}

/**
 * 현재 스크롤 위치에서 강조할 제목의 id를 고른다.
 *
 * 규칙
 *   1. 기준선(scrollY + offset)을 지난 제목 중 가장 마지막 것을 고른다.
 *   2. 아직 첫 제목에 닿지 않았으면 첫 제목을 고른다 —
 *      페이지 맨 위에서 목차가 비어 보이지 않게 한다.
 *   3. 문서 맨 아래에 닿았으면 마지막 제목을 고른다 —
 *      짧은 마지막 섹션이 기준선을 넘지 못해 건너뛰어지는 것을 막는다.
 *   4. 제목이 없으면 null.
 *
 * @param 제목들 문서 순서대로 정렬된 제목 목록
 * @param scrollY 현재 스크롤 위치
 * @param offset 기준선을 화면 상단에서 얼마나 내릴지 (sticky 헤더 높이 + 여유)
 * @param 바닥여유 문서 끝에서 이 픽셀 안쪽이면 맨 아래로 본다
 */
export function 강조할제목(
  제목들: 제목위치[],
  scrollY: number,
  offset = 120,
  문서높이?: number,
  화면높이?: number,
  바닥여유 = 4
): string | null {
  if (제목들.length === 0) return null;

  /* 3. 문서 맨 아래 */
  if (
    문서높이 !== undefined &&
    화면높이 !== undefined &&
    문서높이 > 화면높이 &&
    scrollY + 화면높이 >= 문서높이 - 바닥여유
  ) {
    return 제목들[제목들.length - 1]!.id;
  }

  const 기준선 = scrollY + offset;

  let 선택: string | null = null;
  for (const h of 제목들) {
    if (h.top <= 기준선) 선택 = h.id;
    else break;
  }

  /* 2. 첫 제목보다 위 */
  return 선택 ?? 제목들[0]!.id;
}
