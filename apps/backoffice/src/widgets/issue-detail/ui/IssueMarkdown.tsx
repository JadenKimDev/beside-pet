import Markdown, { type Components } from 'react-markdown';
import { htmlImagesToMarkdown, MARKDOWN_OPTIONS } from '../lib/markdown';

// 이미지는 외부(GitHub) 주소라 next/image 대신 img 를 쓰고 너비를 칸에 맞춘다. 링크는 새 탭으로 연다.
const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  // biome-ignore lint/performance/noImgElement: 외부 주소의 스크린샷이라 next/image 의 원격 허용 목록을 두지 않는다.
  img: ({ node: _node, alt, ...props }) => <img {...props} alt={alt ?? ''} loading="lazy" />,
};

const PROSE = [
  'min-w-0 text-sm leading-relaxed break-words text-fg',
  '[&>*+*]:mt-3',
  '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:font-semibold [&_h4]:font-semibold',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1',
  '[&_li:has(>input)]:list-none [&_li>input]:mr-1.5',
  '[&_a]:text-accent [&_a]:underline',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted',
  '[&_code]:rounded [&_code]:bg-bg-sunk [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-bg-sunk [&_pre]:p-3 [&_pre_code]:p-0',
  '[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:bg-bg-sunk [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-border',
  '[&_hr]:border-border',
].join(' ');

/** 이슈 본문과 댓글의 마크다운. raw HTML 은 렌더하지 않는다(lib/markdown). */
export function IssueMarkdown({ text }: { text: string }) {
  return (
    <div className={PROSE}>
      <Markdown {...MARKDOWN_OPTIONS} components={COMPONENTS}>
        {htmlImagesToMarkdown(text)}
      </Markdown>
    </div>
  );
}
