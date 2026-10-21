// 이슈 본문과 댓글의 마크다운 렌더 설정.
// - raw HTML 은 렌더하지 않고 지운다(skipHtml). 글로도 보이지 않게 해 PRD 의 주석과 <details> 가 화면을 어지럽히지 않는다.
// - 다만 GitHub 에 붙여 넣은 스크린샷은 `<img ... src="...">` 로 저장되므로, 그것만 마크다운 이미지로 바꿔 보인다.
//   주소는 react-markdown 의 기본 urlTransform 이 거른다(javascript: 등은 지운다).
import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const MARKDOWN_OPTIONS = {
  remarkPlugins: [remarkGfm],
  skipHtml: true,
} as const satisfies Options;

const IMG_TAG = /<img\b[^>]*>/gi;
const FENCE = /^\s*(```|~~~)/;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? '') : null;
}

function toMarkdownImage(tag: string): string {
  const src = attribute(tag, 'src');
  if (!src) return tag;
  const alt = (attribute(tag, 'alt') ?? '').replace(/[[\]\\]/g, (char) => `\\${char}`);
  const address = /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, '')}>` : src;
  return `![${alt}](${address})`;
}

/** 울타리 코드 블록 밖의 `<img>` 태그를 `![alt](src)` 로 바꾼다. src 가 없는 태그는 그대로 두어 skipHtml 이 지운다. */
export function htmlImagesToMarkdown(text: string): string {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      const opened = FENCE.exec(line)?.[1];
      if (opened) {
        if (fence === null) fence = opened;
        else if (fence === opened) fence = null;
        return line;
      }
      return fence === null ? line.replace(IMG_TAG, toMarkdownImage) : line;
    })
    .join('\n');
}
