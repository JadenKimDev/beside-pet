import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Journey } from './Journey';

describe('Journey', () => {
  it('바깥은 0..4 범위의 progressbar 이고 지금 값과 읽을 글을 단다', () => {
    const html = renderToStaticMarkup(
      <Journey
        task={3}
        label="보리와의 대화"
        valueText="네 걸음 중 세 번째, 없는 일상에 적응하기"
      />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuetext="네 걸음 중 세 번째, 없는 일상에 적응하기"');
  });

  it('칸 네 개를 단계대로 그리고 오른쪽에 "3 / 4" 를 둔다', () => {
    const html = renderToStaticMarkup(<Journey task={3} label="보리와의 대화" valueText="-" />);
    expect(html.match(/data-stone="done"/g)?.length).toBe(2);
    expect(html.match(/data-stone="now"/g)?.length).toBe(1);
    expect(html.match(/data-stone="todo"/g)?.length).toBe(1);
    expect(html).toContain('3 / 4');
  });
});
