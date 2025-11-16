## 1. 환경설정

- **Node.js**: LTS 버전 권장 (예: 18.x 이상)
- **패키지 매니저**: `npm` 사용

1. 의존성 설치

```bash
npm install
```

2. 환경변수 파일 생성

```bash
cp env.example .env
```

3. `.env` 최소 설정 값

- **필수**
  - `API_URL`: 대상 API 베이스 URL
  - `ACCESS_TOKEN`: 테스트용 액세스 토큰
- **옵션**
  - `AUTH_AUTOWRAP`: Authorization 헤더 자동 주입 여부 (`true`/`false`)
  - `LOG_AUTOWRAP`: 로깅 자동 래핑 여부 (`true`/`false`)
  - `LOG_MODE`, `LOG_FORMAT`, `LOG_MAX_BODY`: 로깅 상세 설정

테스트용 기본 예시는 아래처럼 설정할 수 있습니다.

```bash
API_URL=https://api.example.com
ACCESS_TOKEN=sample-token-123
AUTH_AUTOWRAP=false
LOG_AUTOWRAP=false
LOG_MODE=info
LOG_FORMAT=json
LOG_MAX_BODY=0
```

---

## 2. 실행 명령어

가장 많이 사용하는 명령어는 아래와 같습니다.

```bash
# 테스트 전체 실행
npm test

# 테스트 워치 모드
npm run test:watch

# 타입 체크 (선택)
npm run lint

# 빌드 (선택)
npm run build
```

특정 테스트 파일만 실행하고 싶다면:

```bash
npx vitest run src/tests/menu-select.test.ts
```

특정 테스트 케이스만 실행하고 싶다면:

```bash
npx vitest run -t "테스트 케이스 이름"
```

---

## 3. 추가 문서

- **테스트 케이스 목록 및 설계 의도**: [API Test Case Specification](./docs/Api%20Test%20Case%20Specification.md)
- **테스트 아키텍처 설명 및 다이어그램**: [Test Architecture Overview](./docs/Test%20Architecture%20Overview.md)
