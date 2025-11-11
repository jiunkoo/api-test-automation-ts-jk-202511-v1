# API Test Automation (TypeScript)

간단한 API 테스트 자동화를 위한 TypeScript 템플릿입니다.  
`axios`로 HTTP 요청을 보내고 `vitest`로 테스트를 실행합니다.

## 빠른 시작

```bash
npm install
npm run test
```

## 주요 스크립트

- `npm run test`: 테스트 한 번 실행
- `npm run test:watch`: 테스트 워치 모드
- `npm run lint`: 타입 검사
- `npm run build`: `dist` 빌드

## 디렉터리

- `src/httpClient.ts`: 기본 axios 클라이언트
- `src/tests/healthcheck.test.ts`: 예제 테스트
