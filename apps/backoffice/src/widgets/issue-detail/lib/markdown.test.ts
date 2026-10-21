import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { htmlImagesToMarkdown, MARKDOWN_OPTIONS } from './markdown';

const render = (text: string) =>
  renderToStaticMarkup(createElement(Markdown, MARKDOWN_OPTIONS, htmlImagesToMarkdown(text)));

describe('MARKDOWN_OPTIONS', () => {
  it('drops raw HTML instead of rendering it', () => {
    expect(MARKDOWN_OPTIONS.skipHtml).toBe(true);
    const html = render(
      '앞 <b>굵게</b> 뒤\n\n<script>alert(1)</script>\n\n<details><summary>열기</summary></details>',
    );
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('&lt;script');
    expect(html).not.toContain('<details');
    expect(html).toContain('굵게');
  });

  it('renders GitHub flavoured tables and task lists', () => {
    const html = render('| 칸 | 값 |\n|---|---|\n| 가 | 나 |\n\n- [x] 끝남');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
  });

  it('does not keep javascript: links', () => {
    expect(render('[눌러](javascript:alert(1))')).not.toContain('javascript:');
  });
});

describe('htmlImagesToMarkdown', () => {
  it('turns pasted GitHub image tags into markdown images so screenshots still show', () => {
    const text =
      '스크린샷\n\n<img width="640" alt="로그인 화면" src="https://github.com/user-attachments/assets/0000-example" />';
    expect(htmlImagesToMarkdown(text)).toBe(
      '스크린샷\n\n![로그인 화면](https://github.com/user-attachments/assets/0000-example)',
    );
    expect(render(text)).toContain(
      '<img src="https://github.com/user-attachments/assets/0000-example" alt="로그인 화면"',
    );
  });

  it('accepts single quotes, a missing alt and no closing slash', () => {
    expect(htmlImagesToMarkdown("<img src='https://example.com/a.png'>")).toBe(
      '![](https://example.com/a.png)',
    );
  });

  it('leaves image tags inside fenced code alone', () => {
    const text = '```html\n<img src="https://example.com/a.png">\n```';
    expect(htmlImagesToMarkdown(text)).toBe(text);
  });

  it('leaves a tag without src for skipHtml to drop', () => {
    expect(htmlImagesToMarkdown('<img alt="빈">')).toBe('<img alt="빈">');
  });

  it('escapes brackets in alt and spaces in the address', () => {
    expect(htmlImagesToMarkdown('<img alt="a]b" src="https://example.com/a b.png">')).toBe(
      '![a\\]b](<https://example.com/a b.png>)',
    );
  });
});
