/**
 * 본문(MDX) 렌더링 지원
 *
 * MDX 파일에서 컴포넌트를 import 하지 않아도 쓸 수 있게 컴포넌트 지도를 넘긴다.
 * 집필자(교사)가 import 문을 관리하지 않아도 되게 하려는 결정이다.
 * 쓸 수 있는 컴포넌트 목록은 CLAUDE.md 3-6 에 적어 둔다.
 */
import InfoBox from '@components/content/InfoBox.astro';
import CodeSample from '@components/content/CodeSample.astro';
import CheckQuiz from '@components/content/CheckQuiz.astro';
import QuizItem from '@components/content/QuizItem.astro';
import Term from '@components/content/Term.astro';
import MiniCards from '@components/content/MiniCards.astro';
import CompareTable from '@components/content/CompareTable.astro';
import MoreBox from '@components/content/MoreBox.astro';
import Figure from '@components/content/Figure.astro';
import Activity from '@components/content/Activity.astro';
import LessonLink from '@components/content/LessonLink.astro';
import CodeTask from '@components/content/CodeTask.astro';
import Cloze from '@components/content/Cloze.astro';
import Predict from '@components/content/Predict.astro';
import Sorter from '@components/content/Sorter.astro';
import Bucket from '@components/content/Bucket.astro';

export const 본문컴포넌트 = {
  InfoBox,
  CodeSample,
  CheckQuiz,
  QuizItem,
  Term,
  MiniCards,
  CompareTable,
  MoreBox,
  Figure,
  Activity,
  LessonLink,
  CodeTask,
  Cloze,
  Predict,
  Sorter,
  Bucket,
};

export interface 목차항목 {
  id: string;
  text: string;
  depth: 2 | 3;
}

/**
 * MDX 가 뽑아 준 제목 목록을 우측 목차 형식으로 바꾼다.
 * h2·h3 만 목차에 올린다 — 그 아래는 목차가 너무 잘게 쪼개진다.
 */
export function 본문목차(
  headings: { depth: number; slug: string; text: string }[]
): 목차항목[] {
  return headings
    .filter((h) => h.depth === 2 || h.depth === 3)
    .map((h) => ({ id: h.slug, text: h.text, depth: h.depth as 2 | 3 }));
}
