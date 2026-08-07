// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

/**
 * 고등학교 「프로그래밍」 웹 교과서 — Astro 설정
 *
 * base 경로: 최종 배포 위치가 확정되지 않았다(PLAN.md 결정 항목 2번).
 *   - 독립 도메인 루트에 올릴 경우      → BASE_PATH 미설정 (기본값 '/')
 *   - wonedu.org/hs-prog/ 아래 올릴 경우 → BASE_PATH=/hs-prog/ 로 빌드
 * 모든 내부 링크는 src/lib/url.ts 의 href()를 거치므로 이 값만 바꾸면 전체가 따라온다.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.invalid',
  base,
  trailingSlash: 'always',
  integrations: [mdx()],
  markdown: {
    // 코드 블록 강조는 예제 컴포넌트(CodeSample)가 담당한다.
    // 본문 Markdown 안의 fenced code 는 밝은 테마로 최소 강조만 한다.
    shikiConfig: { theme: 'github-light', wrap: true },
  },
  build: {
    // /units/01/03/index.html 형태 — 학교망 프록시에서 확장자 없는 URL이 더 안전하다
    format: 'directory',
  },
  // 학교 전산실 크롬 기준. 최신 문법 트랜스파일은 Vite 기본값을 따른다.
  vite: {
    build: {
      // 소스맵은 배포물에서 제외 (용량·불필요한 노출 방지)
      sourcemap: false,
    },
  },
});
