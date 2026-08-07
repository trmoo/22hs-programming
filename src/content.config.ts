import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 차시 본문 컬렉션
 *
 * 파일 위치: content/units/{단원2자리}/{차시2자리}.mdx
 *   예) content/units/01/03.mdx  →  id "01/03"
 *
 * 프런트매터는 content/curriculum.json 과 이중으로 적는다. 두 곳이 어긋나면
 * tools/check-content.mjs 가 잡는다 — 매핑이 조용히 깨지는 것을 막기 위한 장치다.
 */
const lessons = defineCollection({
  loader: glob({ base: './content/units', pattern: '**/[0-9][0-9].{md,mdx}' }),
  schema: z.object({
    /** curriculum.json 의 단원번호 */
    unit: z.number().int().min(1),
    /** curriculum.json 의 차시번호 */
    lesson: z.number().int().min(1),
    /** curriculum.json 의 차시명과 같아야 한다 */
    title: z.string().min(1),
    /** 이 차시가 담당하는 성취기준 코드. curriculum.json 과 같아야 한다. */
    standards: z.array(z.string().min(1)).min(1),
    /** 히어로 도입 문장 — 차시를 한 문단으로 소개한다 */
    lead: z.string().min(1),
    status: z.enum(['draft', 'review', 'published']).default('draft'),
    /** 본문에 코드 예제를 제공하는 언어 */
    langs: z.array(z.enum(['python', 'c'])).default([]),
    /** 집필 중 남은 확인 사항 */
    todo: z.array(z.string()).default([]),
  }),
});

export const collections = { lessons };
