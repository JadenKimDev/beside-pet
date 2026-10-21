// 전역 글꼴. Pretendard Variable 을 npm 패키지의 동적 부분집합으로 싣는다(쓰는 글자 조각만 받는다).
// 색과 글자 토큰은 라우트 디렉터리의 app/globals.css 에 있다(Tailwind 의 진입 CSS).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';

/** <html> 에 붙이는 클래스. */
export const rootClassName = 'h-full antialiased';
/** <body> 에 붙이는 클래스. */
export const bodyClassName = 'min-h-full bg-bg font-sans text-fg';
