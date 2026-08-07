/**
 * 내부 링크 생성기
 *
 * 배포 위치가 확정되지 않았다(루트 vs /hs-prog/ 하위). 모든 내부 링크를 여기로
 * 통과시켜 두면 astro.config.mjs 의 base 한 값만 바꿔 전체가 따라온다.
 * 절대 경로를 직접 쓰지 않는다.
 */

const BASE = import.meta.env.BASE_URL; // 항상 '/'로 시작하고 '/'로 끝난다

/** href('/units/01/') → '/hs-prog/units/01/' (base가 /hs-prog/ 일 때) */
export function href(path: string): string {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return BASE.endsWith('/') ? BASE + clean : `${BASE}/${clean}`;
}

/** 현재 경로가 대상 경로와 같은가 (트리 현재 위치 강조용) */
export function 현재경로인가(현재: string, 대상: string): boolean {
  const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  return norm(현재) === norm(href(대상));
}

/** 현재 경로가 대상 경로 아래에 있는가 (단원 펼침 판단용) */
export function 하위경로인가(현재: string, 대상: string): boolean {
  const norm = (p: string) => (p.endsWith('/') ? p : `${p}/`);
  return norm(현재).startsWith(norm(href(대상)));
}
