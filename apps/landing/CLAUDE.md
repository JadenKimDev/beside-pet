# Beside Pet Web

besidepet.com 정적 웹사이트 프로젝트.

## 기술 스택

- **프레임워크**: Next.js 16 (App Router, Static Export)
- **스타일링**: Tailwind CSS 4
- **블로그**: MDX (content/blog/ 디렉토리, gray-matter + next-mdx-remote)
- **호스팅**: Vercel (무료 플랜)
- **도메인**: besidepet.com

## 개발 명령어

```bash
pnpm dev        # 로컬 개발 서버 (Turbopack)
pnpm build      # 프로덕션 빌드 (Static Export → out/)
pnpm start      # 빌드 결과물 로컬 서빙
```

## 블로그 글 추가

1. `content/blog/` 에 `.mdx` 파일 생성
2. Frontmatter 필수 필드: title, date, category, excerpt
3. `git push` → Vercel 자동 빌드

## 주의사항

- **모든 텍스트 영어** (미국 시장 타겟)
- Static Export 모드 (`output: "export"`) — 서버 기능 사용 불가
- 이미지는 `public/images/` 에 저장
- 법적 문서 (Terms, Privacy) 수정 시 날짜 업데이트 필수
