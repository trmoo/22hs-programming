/**
 * 확인 문제 글(stem·choices·explain)을 화면에 넣을 HTML 로 바꾼다.
 *
 * 문항 글은 MDX 속성 문자열이고, 코드 표기를 <code>…</code> 로 적는다.
 * 들어오는 글은 두 가지다.
 *   stem="0 &lt; 점수"          MDX 가 문자 참조를 미리 풀어 「0 < 점수」 로 들어온다
 *   choices={['점수 &gt; 90']}  JS 문자열이라 참조가 풀리지 않고 「&gt;」 그대로 들어온다
 *
 * - 속성 없는 <code> <strong> <em> 세 가지만 태그로 살린다.
 * - 그 밖의 < > " ' 는 모두 글자로 바꾼다. 다른 태그·속성·스크립트가 들어갈 틈이 없다.
 * - & 는 올바른 문자 참조(&gt; &#39; …)의 첫 글자일 때만 그대로 둔다. 참조는 브라우저가
 *   글자 하나로 풀 뿐 태그가 되지 않으므로 안전하다. 그 밖의 & 는 &amp; 로 바꾼다.
 *   (모든 & 를 바꾸면 위 둘째 갈래의 &gt; 가 화면에 「&gt;」 로 보인다 — 실제로 겪었다)
 * - 짝이 맞지 않으면 예외를 던져 빌드를 세운다. 조용히 깨진 화면을 내지 않는다.
 *
 * 예전에는 stem 을 {stem} 으로 넣어 <code> 가 글자 그대로 보였고(19개 차시 89곳),
 * choices·explain 은 set:html 로 아무 HTML 이나 통과시켰다 (2026-10-23 함께 바꿈).
 */
const 허용태그 = /<(\/?)(code|strong|em)>/g;

/** HTML 특수 문자를 글자로 바꾼다. 이미 적힌 올바른 문자 참조는 그대로 둔다 */
export function 글자로(s: string): string {
  return s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function 인라인HTML(s: string): string {
  let 결과 = '';
  let 앞 = 0;
  const 열린것: string[] = [];

  for (const m of s.matchAll(허용태그)) {
    const [통째, 닫음, 이름] = m;
    const 자리 = m.index ?? 0;
    결과 += 글자로(s.slice(앞, 자리));

    if (닫음) {
      const 마지막 = 열린것.pop();
      if (마지막 !== 이름) {
        throw new Error(`문항 글의 </${이름}> 와 짝이 맞는 여는 태그가 없다 — "${s}"`);
      }
    } else {
      if (열린것.includes(이름)) {
        throw new Error(`문항 글에서 <${이름}> 안에 <${이름}> 를 또 열었다 — "${s}"`);
      }
      열린것.push(이름);
    }

    결과 += 통째;
    앞 = 자리 + 통째.length;
  }

  if (열린것.length > 0) {
    throw new Error(`문항 글의 <${열린것[열린것.length - 1]}> 가 닫히지 않았다 — "${s}"`);
  }
  return 결과 + 글자로(s.slice(앞));
}
