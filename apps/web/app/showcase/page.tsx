import { loadDevNotes, loadTranscript, screenshotPath } from '@/features/showcase/model/load';
import { ShowcaseScreen } from '@/features/showcase/ui/ShowcaseScreen';

/**
 * /showcase — 로그인 없이 보는 공개 쇼케이스(ADR-0029). 인증 가드에 넣지 않고 서버 호출을 두지 않는다.
 * 자료는 빌드·dev 때 public/showcase/ 로 복사된 정적 파일을 파일로 읽는다(서버 컴포넌트에서만).
 * 화면은 클라이언트 컴포넌트라 node:fs 를 품은 읽기 모듈을 가져오지 않으므로, 스크린샷 경로도 여기서 만든다.
 */
export default function ShowcasePage() {
  const transcript = loadTranscript();
  const screenshots = Object.fromEntries(
    transcript.steps.map((step) => [step.id, screenshotPath(step.screenshot)]),
  );
  return (
    <ShowcaseScreen transcript={transcript} screenshots={screenshots} notes={loadDevNotes()} />
  );
}
