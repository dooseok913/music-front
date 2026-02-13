# MusicSpace PPT 자료

---

## SLIDE 1 — 메뉴 구조도

```
MusicSpace
│
├── [인증]
│   ├── 로그인 (/login)
│   └── 회원가입 (/register)
│
└── [음악 공간] (/music/*)
    │
    ├── 음악 공간
    │   ├── HOME           /music/home           서비스 대시보드
    │   ├── My Lounge      /music/lounge         PMS - 내 플레이리스트
    │   ├── The Lab        /music/lab            GMS - AI 추천 플레이리스트
    │   └── The Cargo      /music/external-space EMS - 외부 음악 탐색
    │
    ├── 라이브러리
    │   ├── Favorites      /music/favorites      좋아요 한 트랙 모음
    │   ├── Recently Played /music/recent        최근 재생 기록
    │   ├── Kuka House     (모달)                L1 AI 음악 추천
    │   └── Deep Dive      /music/deep-dive      L2 자연어 음악 검색
    │
    └── 설정
        ├── Connections    /music/connections    외부 플랫폼 연동
        ├── Settings       /music/settings       AI 모델·계정 설정
        ├── Admin Portal   /admin                관리자 대시보드
        └── Theme Config   /music/theme-config   UI 테마 설정
```

---

## SLIDE 2 — 기능 정의서

### 인증 (Authentication)

| 기능 | 설명 |
|------|------|
| 회원가입 | 이메일·비밀번호·닉네임 입력, 이메일 중복 검사 |
| 로그인 | JWT Access Token + Refresh Token (Redis 저장) |
| 로그아웃 | Refresh Token 삭제, 클라이언트 토큰 파기 |
| 자동 로그인 | Access Token 만료 시 Refresh Token으로 자동 갱신 |
| 역할 | USER / ADMIN / MASTER |

---

### HOME — 서비스 대시보드

| 기능 | 설명 |
|------|------|
| 이번 주 히트 | Spotify Special Hot Tracks 표시 |
| PMS 추천 | 내 플레이리스트 중 최근 트랙 표시 |
| 장르별 탐색 | 장르 클릭 → EMS 검색 연결 |
| 빠른 재생 | 트랙 클릭 시 즉시 재생 |

---

### PMS (Personal Music Space) — My Lounge

| 기능 | 설명 |
|------|------|
| 플레이리스트 목록 | 사용자가 확정한 플레이리스트 전체 표시 |
| 플레이리스트 생성 | 제목·설명·공개여부 입력 |
| 트랙 추가/삭제 | 드래그 순서 변경, 트랙 삭제 |
| My Favorites | 하트 버튼으로 좋아요 한 트랙 모음 (가로 스크롤 카드) |
| 전체 재생 | 플레이리스트 전체 큐에 등록 후 재생 |
| 플랫폼 Import | Spotify·YouTube·Tidal 플레이리스트 자동 가져오기 |

---

### EMS (External Music Space) — The Cargo

| 기능 | 설명 |
|------|------|
| 외부 플레이리스트 탐색 | Spotify 공개 플레이리스트·Hot Tracks 표시 |
| 트랙 장바구니 담기 | 분석할 트랙 선택 후 장바구니 추가 |
| AI 분석 요청 | 장바구니 → M1/M2/M3 모델 선택 → 분석 요청 |
| 분석 진행 프로그레스바 | 분석 준비(15%) → 플레이리스트 생성(35%) → AI 요청(55%) → 대기(75%) → 완료(100%) |
| Duration Lazy Loading | Duration 없는 트랙을 iTunes API로 자동 보완 |

---

### GMS (Gateway Music Space) — The Lab

| 기능 | 설명 |
|------|------|
| AI 추천 플레이리스트 | FastAPI가 생성한 추천 결과 목록 |
| 트랙 미리 듣기 | 각 트랙 개별 재생 |
| 트랙 삭제 | 마음에 안 드는 트랙 제거 |
| 플레이리스트 승인 | GMS → PMS로 확정 이동 (AI 학습 데이터로 활용) |
| 플레이리스트 거절 | GMS 플레이리스트 전체 삭제 |

---

### Kuka House (L1 AI 추천 모달)

| 기능 | 설명 |
|------|------|
| 아티스트/곡명 검색 | 89,740곡 데이터 기반 유사 추천 |
| 모델 선택 | 앙상블 / 오디오 KNN / 텍스트 / 하이브리드 |
| AI 추천 이유 | Gemini RAG 기반 추천 이유 텍스트 생성 |
| 결과 재생 | 추천곡 클릭 → 플레이어 연동 |
| Favorites 추가 | 추천 결과에서 바로 하트 버튼 |
| 드래그 앤 드롭 | 모달 위치 자유롭게 이동 가능 |

---

### Deep Dive (L2 자연어 검색)

| 기능 | 설명 |
|------|------|
| 자연어 검색 | 한국어 쿼리 입력 → LLM 번역·감정 분석 → ChromaDB 벡터 검색 |
| 결과 표시 | 유사도 %, 아티스트, 장르, 오디오 특성 바 |
| AI 설명 | Gemini 2.0 Flash 기반 트랙별 한국어 추천 이유 생성 |
| 페이지네이션 | 5곡씩, 최대 3페이지 (15곡) |
| 데이터 규모 | 81,765곡 ChromaDB 벡터 DB (all-MiniLM-L6-v2 임베딩) |
| 즉시 재생 | 결과 트랙 클릭 → 뮤직 플레이어 연동 |

---

### Connections — 외부 플랫폼 연동

| 플랫폼 | 로그인 방식 | Import 방식 | 대상 |
|--------|------------|------------|------|
| Spotify | 브라우저 로그인 | 수동 — 플레이리스트별 버튼 클릭 | PMS |
| YouTube Music | OAuth 팝업 | 자동 — 연결 즉시 전체 Import | PMS |
| Tidal | 모달 로그인 | 자동 — 연결 즉시 전체 Import | PMS |

---

### 뮤직 플레이어 (전역)

| 기능 | 설명 |
|------|------|
| 재생/일시정지 | 오디오 스트림 제어 |
| 이전/다음 곡 | 큐 기반 이동 |
| 반복 재생 | 없음 / 전체 반복 / 한 곡 반복 |
| 셔플 | 큐 랜덤 섞기 |
| 진행 바 | 시간 표시, 클릭 탐색 |
| 볼륨 | 슬라이더 조절 |
| Tidal Smart Match | 제목·아티스트로 Tidal 트랙 자동 매칭 재생 |
| 최근 재생 기록 | localStorage에 최대 50곡 자동 저장 |

---

### Settings — AI 모델 설정

| 기능 | 설명 |
|------|------|
| AI 모델 선택 | M1 / M2 / M3 중 선택 |
| 모델 즉시 재학습 | 선택 시 해당 모델로 재학습 + GMS 추천 갱신 |
| 테마 변경 | Default / Jazz / Soul |

---

## SLIDE 3 — 정책 정의서

### 3-Space 정책

| 공간 | 코드 | 정의 | 진입 조건 | 이탈 조건 |
|------|------|------|----------|---------|
| **PMS** | Personal Music Space | 사용자가 확정·소유한 플레이리스트 | GMS 승인 / 플랫폼 Import / 직접 생성 | 사용자 삭제 |
| **EMS** | External Music Space | 외부에서 가져온 미검증 플레이리스트 | Spotify 공개 플레이리스트 탐색 | 분석 요청 → GMS |
| **GMS** | Gateway Music Space | AI가 생성한 추천 플레이리스트 (검토 대기) | EMS 분석 완료 | 승인 → PMS / 거절 → 삭제 |

---

### 플레이리스트 상태 (status_flag)

| 상태 | 코드 | 설명 |
|------|------|------|
| 준비 | PTP | Prepared — 생성 완료, 검토 전 |
| AI 처리 중 | PRP | Processing — AI 분석·추천 진행 중 |
| 승인됨 | APV | Approved — GMS → PMS 확정 |
| 거절됨 | REJ | Rejected — GMS에서 사용자가 거절 |

---

### 플레이리스트 출처 (source_type)

| 출처 | 값 | 설명 |
|------|-----|------|
| 시스템 | System | AI 생성 GMS 플레이리스트 |
| 플랫폼 | Platform | Spotify·YouTube·Tidal Import |
| 사용자 | User | 직접 생성 |

---

### AI 분석 정책

| 항목 | 정책 |
|------|------|
| 모델 선택 | 사용자가 Settings에서 M1 / M2 / M3 선택 |
| 분석 트리거 | 장바구니에서 "분석 요청" 버튼 클릭 |
| 타임아웃 | 60초 초과 시 실패 처리 |
| GMS 생성 | 분석 완료 후 자동으로 GMS 플레이리스트 생성 |
| 학습 시점 | GMS 플레이리스트 **승인 시** (트랙 삭제 시 아님) |
| 중복 방지 | 분석 중 재요청 버튼 비활성화 |

---

### 사용자 역할 정책

| 역할 | 코드 | 권한 |
|------|------|------|
| 일반 사용자 | USER | 기본 기능 전체 |
| 관리자 | ADMIN | 사용자 관리, 통계 조회 |
| 최고 관리자 | MASTER | 전체 관리 권한, 지정 계정 고정 |

---

### 인증 정책

| 항목 | 정책 |
|------|------|
| Access Token | JWT, 만료 시 자동 갱신 |
| Refresh Token | Redis 저장, 서버 로그아웃 시 즉시 폐기 |
| 보호 경로 | `/music/*` 전체 — 비로그인 시 `/login` 리다이렉트 |
| 비밀번호 | BCrypt 해시 저장 |

---

### 데이터 정책

| 항목 | 정책 |
|------|------|
| 최근 재생 기록 | localStorage 저장, 최대 50곡, 중복 시 최신으로 갱신 |
| 장바구니 | DB 저장 (user_cart), 분석 후 자동 비움 |
| 이미지 업로드 | `/public/uploads`, 컨테이너 볼륨 마운트로 영속 |
| AI 모델 파일 | `/M1/user_models`, 볼륨 마운트로 재시작 후에도 유지 |

---

## SLIDE 4 — 시스템 아키텍처

### 전체 구성도

```
[사용자 브라우저]
        │ HTTP (80)
        ▼
┌─────────────────────────────────┐
│   nginx (musicspace-frontend)   │
│   React SPA + Reverse Proxy     │
└──────────┬──────────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
  [Spring]  [FastAPI]
    :8080     :8000
      │         │
      └────┬────┘
           ▼
  ┌─────────────┐    ┌──────────┐
  │  MariaDB    │    │  Redis   │
  │  :3306      │    │  :6379   │
  └─────────────┘    └──────────┘
```

---

### 컨테이너 구성

| 컨테이너 | 이미지 | 역할 |
|----------|--------|------|
| musicspace-frontend | React + nginx | SPA 서빙 + API 리버스 프록시 |
| musicspace-spring-backend | Spring Boot :8080 | 메인 REST API (인증, 플레이리스트, 외부 API 연동) |
| musicspace-fastapi | FastAPI :8000 | AI 음악 추천 (M1/M2/M3/L1/L2) |
| musicspace-db | MariaDB 10.11 :3306 | 메인 데이터베이스 |
| musicspace-redis | Redis 7 :6379 | JWT Refresh Token 캐시 |

---

### nginx 라우팅 규칙

| URL 패턴 | 대상 | 설명 |
|----------|------|------|
| `/api/auth/*` | Spring Boot | 인증 API |
| `/api/playlists*` | Spring Boot | 플레이리스트 CRUD |
| `/api/pms/*` | Spring Boot | PMS 공간 API |
| `/api/ems/*` | Spring Boot | EMS 공간 API |
| `/api/gms/*` | Spring Boot | GMS 공간 API |
| `/api/spotify/*` | Spring Boot | Spotify REST API |
| `/api/analyze` | FastAPI | 통합 AI 분석 |
| `/api/recommend` | FastAPI | 통합 AI 추천 |
| `/api/m1/*` `/api/m2/*` `/api/m3/*` | FastAPI | 모델별 API |
| `/api/kuka/*` | FastAPI (`/api/spotify/*` rewrite) | L1 Kuka 추천 |
| `/api/llm/*` | FastAPI | L2 Deep Dive 자연어 검색 |
| `/swagger-ui/*` | Spring Boot | API 문서 |
| `/*` | React SPA | 프론트엔드 SPA 라우팅 |

---

### AI 모델 구성

| 모델 | 알고리즘 | 학습 데이터 | 용도 |
|------|---------|-----------|------|
| **M1** | Ridge Regression + 오디오 특성 예측 | EMS 트랙 오디오 피처 | 개인화 추천 (기본) |
| **M2** | SVM + TF-IDF 텍스트 임베딩 (393D) | PMS(긍정) + EMS(부정) | 콘텐츠 기반 필터링 |
| **M3** | CatBoost 협업 필터링 | 사용자 행동 이력 | 협업 필터링 추천 |
| **L1 Kuka** | FAISS + MiniLM-L6-v2 텍스트 임베딩 + 오디오 앙상블 | Spotify 89,740곡 | 아티스트/곡명 기반 추천 |
| **L2 Deep Dive** | ChromaDB + all-MiniLM-L6-v2 + Gemini 2.0 Flash | Spotify 81,765곡 태그 벡터 | 자연어 의미 기반 탐색 |

---

### 기술 스택

| 분류 | 기술 |
|------|------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS |
| **Backend** | Spring Boot 3, JPA, Spring Security, JWT |
| **AI/ML** | FastAPI, scikit-learn, CatBoost, FAISS, Sentence-Transformers, Gemini |
| **DB** | MariaDB 10.11, Redis 7 |
| **인프라** | Docker, Docker Compose, nginx |
| **외부 API** | Spotify API, Tidal API, YouTube Data API, iTunes API, Last.fm API |

---

### 데이터 흐름 — EMS → GMS → PMS

```
1. [EMS] 사용자가 외부 트랙 탐색
        │
        ▼
2. [EMS] 장바구니에 트랙 담기 (DB: user_cart)
        │
        ▼
3. [EMS] AI 분석 요청 (M1/M2/M3 선택)
        │  POST /api/cart/analyze → Spring Boot → FastAPI
        ▼
4. [FastAPI] 모델로 추천 생성
            └─ 결과를 GMS 플레이리스트로 DB 저장
        │
        ▼
5. [GMS] 사용자가 추천 결과 검토
        ├─ 트랙 삭제 → 마음에 드는 것만 남김
        ├─ [승인] → PMS로 이동 + AI 학습 데이터 등록
        └─ [거절] → GMS 플레이리스트 삭제
```
