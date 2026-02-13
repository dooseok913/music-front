# 프로젝트 아키텍처 분석

## 1. 2TeamFinalProject-BE (Spring Boot Backend)

### 기술 스택
- **프레임워크**: Spring Boot 3.5.9
- **언어**: Java 17
- **데이터 Access**: Spring Data JPA, MyBatis
- **데이터베이스**: MariaDB 10.11
- **캐시**: Redis
- **인증**: JWT (jjwt 0.12.6)
- **API 문서화**: Swagger/OpenAPI (springdoc)

### 디렉토리 구조
```
src/main/java/com/springboot/finalprojcet/
├── config/                 # 전역 설정
│   ├── GlobalExceptionHandler
│   ├── RedisConfig
│   ├── RestTemplateConfig
│   ├── SecurityConfig
│   ├── SwaggerConfig
│   └── WebMvcConfig
├── controller/
│   └── MainController      # 루트 엔드포인트 (/health check)
├── domain/
│   ├── analysis/          # 음악 분석 모듈
│   │   ├── controller/AnalysisController
│   │   ├── dto/ (AnalysisProfileDto, EvaluationResponseDto)
│   │   ├── repository/UserProfilesRepository
│   │   └── service/impl/AnalysisServiceImpl
│   ├── auth/              # 인증 모듈
│   │   ├── controller/AuthController
│   │   ├── dto/ (LoginRequestDto, SignupRequestDto)
│   │   └── jwt/ (JwtAuthenticationFilter, JwtProperties)
│   ├── gms/               # 글로벌 음악 공간
│   └── tidal/             # Tidal 연동
└── entity/                # JPA 엔티티 (Playlists, Tracks, UserProfiles)
```

### 주요 기능

#### 1.1 인증 모듈 (Auth)
- 회원가입 (Sign Up)
- 로그인 (JWT 발행)
- JWT 필터 (보안)

#### 1.2 음악 분석 모듈 (Analysis)
**AnalysisServiceImpl 주요 동작:**
- `trainModel(Long userId)`: 사용자 음악 취향 학습
  - PMS(개인 음악 공간) 트랙 수집
  - 아티스트/앨범 빈도 분석
  - 장르 키워드 추론 (플레이리스트 제목/설명 기반)
  - 프로필 저장 (UserProfiles 테이블)

- `getProfileSummary(Long userId)`: 학습된 프로필 조회

- `evaluatePlaylist(Long userId, String playlistId)`: 플레이리스트 평가
  - 사용자 프로필과 매칭 점수 계산
  - S/A/B/C/D 등급 부여
  - 매칭 아티스트, 장르 등 상세 정보 반환

### 연동 방식
- **데이터베이스**: Node.js 프로젝트의 MariaDB 공유 사용
- **포트**: 8080 (추정)
- **환경변수**: TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET, TIDAL_REDIRECT_URI

---

## 2. FAST_API (Python AI 서비스)

### 기술 스택
- **프레임워크**: FastAPI
- **데이터 Access**: SQLAlchemy, PyMySQL
- **머신러닝**: Scikit-learn, CatBoost, LightGBM
- **데이터 처리**: Pandas, NumPy
- **Spotify API**: Spotipy
- **포트**: 8000

### 디렉토리 구조
```
FAST_API/
├── main.py              # FastAPI 메인 앱
├── database.py          # DB 연결 설정
├── requirements.txt     # Python 의존성
├── docker-compose.yml   # Docker 설정
├── Dockerfile
├── M1/                  # 오디오 특성 예측 모델
│   ├── analysis.py
│   ├── router.py
│   ├── service.py
│   ├── spotify_service.py
│   ├── spotify_recommender.py
│   ├── delete.py
│   └── user_models/     # 사용자별 개인화 모델 저장
├── M2/                  # 콘텐츠 기반 추천 (TF-IDF + GBR)
│   └── tfidf_gbr_models.pkl
└── M3/                  # 협업 필터링 (CatBoost)
    └── recommender_*.cbm
```

### 주요 기능

#### 2.1 M1 모듈 (오디오 특성 예측)

**엔드포인트:**
- `GET /api/m1/health`: 모듈 상태 확인
- `POST /api/m1/analyze`: 사용자 분석 및 모델 학습
  - 1단계: 사용자 정보 조회 → 이메일 기반 폴더 생성
  - 2단계: 기본 모델(audio_predictor.pkl)을 사용자 폴더로 복사
  - 3단계: PMS 트랙 수집
  - 4단계: 모델 추가학습 → 파일명에 `_` 붙임 (email_.pkl)

- `POST /api/m1/recommend/{user_id}`: 추천 생성
  - PMS에서 사용자 선호 트랙 분석
  - EMS에서 후보 트랙 평가
  - final_score >= 0.7 트랙을 GMS에 저장
  - Top 10 추천 반환

- `POST /api/m1/deleted-track`: 트랙 삭제 + 재학습
  - 플레이리스트에서 트랙 삭제
  - 삭제된 트랙을 '싫어요'로 학습

- `GET /api/m1/user/{user_id}/profile`: 음악 취향 프로필 조회
- `POST /api/m1/random-ems`: EMS에서 랜덤 트랙 추출 (균등 분포)
- `POST /api/m1/transfer-ems`: EMS 트랙 전달 및 추천 생성

**서비스 구조:**
- 기본 모델: `M1/audio_predictor.pkl`
- 사용자별 개인화 모델: `M1/user_models/{email}_*.pkl`
- GMS 저장: 추천 결과를 GMS 플레이리스트로 저장

#### 2.2 M2 모듈 (콘텐츠 기반 - 개발중)
- TF-IDF + Gradient Boosting 추천

#### 2.3 M3 모듈 (협업 필터링 - 개발중)
- CatBoost 기반 협업 필터링

### 통신 구조
```
Spring Boot (8080) ←→ FastAPI (8000) ←→ EMS API
                              ↓
                          MariaDB
```

### Docker 설정
```yaml
networks:
  music-network:
    external: true
    name: humamappleteampreject001_musicspace-network

services:
  ai-api:
    ports: "8000:8000"
    depends_on:
      - musicspace-db
    environment:
      - DB_HOST=musicspace-db
      - DB_NAME=music_space_db
      - DB_USER=root
      - DB_PASSWORD=musicspace123
```

---

## 3. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Port 5173)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────┐      ┌──────────────────┐
│ Spring Boot BE  │◄────►│   FastAPI AI     │
│   (8080)        │      │     (8000)        │
│                 │      │                  │
│ - Auth (JWT)    │      │ - M1: Audio      │
│ - Analysis      │      │   Prediction     │
│ - Tidal API     │      │ - M2: Content    │
│ - JPA/MyBatis   │      │   Based          │
└─────────────────┘      │ - M3: Collaborative│
          │              │   Filtering       │
          ▼              └──────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   MariaDB (music_space_db)                   │
│  - users                                                    │
│  - user_profiles                                            │
│  - playlists                                               │
│  - tracks                                                   │
│  - playlist_tracks                                          │
└─────────────────────────────────────────────────────────────┘
          ▲
          │
    MariaDB Service
      (Docker)
```

## 4. 공유 데이터베이스 (MariaDB)

**테이블:**
- `users`: 사용자 정보
- `user_profiles`: AI 분석 프로필 (JSON 형식 저장)
- `playlists`: 플레이리스트 (PMS, GMS)
- `tracks`: 트랙 정보
- `playlist_tracks`: 플레이리스트-트랙 매핑

## 5. 환경 설정

### Spring Boot 환경변수
- `TIDAL_CLIENT_ID`
- `TIDAL_CLIENT_SECRET`
- `TIDAL_REDIRECT_URI`
- DB 연결 정보 (application.yml)

### FastAPI 환경변수
- `ENVIRONMENT=development`
- `PORT=8000`
- `EMS_API_URL=http://host.docker.internal:3001/api/ems`
- `DB_HOST=musicspace-db`
- `DB_PORT=3306`
- `DB_NAME=music_space_db`
- `DB_USER=root`
- `DB_PASSWORD=musicspace123`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

## 6. 실행 방법

### Spring Boot
```bash
gradlew bootRun
# 포트 8080
```

### FastAPI (Docker)
```bash
docker-compose up --build
# 포트 8000
# Swagger UI: http://localhost:8000/docs
```

### Docker Services
```bash
# MariaDB
docker-compose -f 2TeamFinalProject-BE/docker-compose.yml up

# Redis
docker-compose -f 2TeamFinalProject-BE/docker-compose.yml up
```

---

## 7. AI 음악 추천 플로우

### 7.1 전체 플로우 다이어그램
```
┌─────────────┐
│ 사용자 가입  │ 
└──────┬──────┘
       │
       ▼
┌────────────────────┐
│ 플레이리스트 등록  │  (PMS에 직접 음악 추가)
└──────┬─────────────┘
       │
       ▼
┌──────────────────────────────┐
│ 1차 AI 학습                   │
│ - Spring Boot: trainModel()  │
│   PMS 트랙 수집 → 아티스트/장르 분석 │
│   프로필 저장 (user_profiles)  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ 2차 AI 학습                   │
│ - FastAPI: /api/m1/analyze   │
│   기본 모델(audio_predictor.pkl)     │
│   → 사용자별 개인화 모델 생성     │
│     M1/user_models/{email}_*.pkl  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ EMS에서 플레이리스트 제공    │
│ - EMS API 호출               │
│ - 랜덤/후보 트랙 조회        │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ AI 평가                       │
│ - 사용자별 모델로 점수 계산   │
│ - final_score 계산            │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ GMS 저장                     │
│ - final_score >= 0.7 트랙     │
│   GMS 플레이리스트로 저장     │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ 사용자 선택                  │
│ - GMS 플레이리스트에서 곡 선택│
│ - 좋아요/싫어요 피드백       │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ PMS 이동                     │
│ - 선택한 곡을 PMS로 옮김      │
│ - 모델 재학습 (deleted-   │
│   track / retrain)           │
└──────────────────────────────┘
```

### 7.2 상세 단계별 설명

#### STEP 1: 사용자 가입
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/auth/signup` (Spring Boot) |
| **기능** | 사용자 정보 DB 등록, JWT 발급 |

#### STEP 2: 플레이리스트 등록 (PMS)
| 항목 | 설명 |
|------|------|
| **공간** | PMS (Personal Music Space) |
| **기능** | 사용자가 직접 좋아하는 음악 추가 |
| **DB 테이블** | `playlists` (space_type=PMS), `playlist_tracks`, `tracks` |

#### STEP 3: 1차 AI 학습 (Spring Boot)
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/analysis/train/{userId}` |
| **서비스** | `AnalysisServiceImpl.trainModel()` |
| **동작** | PMS 트랙 수집 → 아티스트/앨범 빈도 분석 → 장르 추론 → 프로필 저장 |
| **출력** | `user_profiles` 테이블에 JSON 형식 저장 |

**프로필 구조 (AnalysisProfileDto):**
```json
{
  "userId": 1,
  "trainedAt": "2026-02-04",
  "dataStats": {
    "totalTracks": 50,
    "uniqueArtists": 30,
    "uniqueAlbums": 45
  },
  "preferences": {
    "topArtists": [...],
    "topAlbums": [...],
    "inferredGenres": [
      {"name": "K-Pop", "count": 20},
      {"name": "Jazz", "count": 15}
    ]
  },
  "weights": {
    "artistMatch": 0.35,
    "genreMatch": 0.25,
    "popularityMatch": 0.15
  }
}
```

#### STEP 4: 2차 AI 학습 (FastAPI M1)
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/m1/analyze` |
| **서비스** | `M1RecommendationService` |
| **동작** | 기본 모델 복사 → PMS 트랙으로 추가학습 → 개인화 모델 저장 |
| **모델 경로** | `M1/user_models/{email}_{timestamp}.pkl` |

**학습 과정:**
1. 사용자 이메일 기반 폴더 생성
2. 기본 모델(`audio_predictor.pkl`) 복사
3. PMS 트랙의 오디오 특성으로 모델 추가학습
4. 파일명에 `_` 붙여 저장 (중복 회피)

#### STEP 5: EMS에서 플레이리스트 제공
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/m1/random-ems`, `POST /api/m1/transfer-ems` |
| **동작** | EMS API에서 랜덤/후보 트랙 조회 |
| **출력** | EMS 트랙 목록 (track_id, title, artist, album 등) |

#### STEP 6: AI 평가
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/m1/transfer-ems` |
| **모델** | 사용자별 개인화 모델(`{email}_*.pkl`) |
| **동작** | EMS 트랙에 점수 계산 |
| **점수 기준** | 0.0 ~ 1.0 (높을수록 추천 확신도 높음) |

#### STEP 7: GMS 저장
| 항목 | 설명 |
|------|------|
| **엔드포인트** | `POST /api/m1/recommend/{user_id}` |
| **공간** | GMS (Global Music Space) |
| **조건** | final_score >= 0.7 트랙만 저장 |
| **DB 테이블** | `playlists` (space_type=GMS), `playlist_tracks` |

**저장 예시:**
```json
{
  "user_id": 1,
  "playlist_id": 100,
  "message": "GMS playlist created successfully",
  "recommendations": [
    {"track_id": 500, "title": "곡제목", "artist": "아티스트", "score": 0.85},
    {"track_id": 501, "title": "곡제목2", "artist": "아티스트2", "score": 0.78}
  ]
}
```

#### STEP 8: 사용자 선택
| 항목 | 설명 |
|------|------|
| **액션** | 사용자가 GMS 플레이리스트에서 곡 선택 |
| **피드백** | 좋아요 / 싫어요 클릭 가능 |
| **엔드포인트** | `POST /api/m1/deleted-track`, `POST /api/m1/retrain/{user_id}` |

**싫어요 처리 (재학습):**
1. 트랙을 플레이리스트에서 삭제
2. 삭제된 트랙을 '싫어요'로 학습
3. PreferenceClassifier 재학습

#### STEP 9: PMS 이동
| 항목 | 설명 |
|------|------|
| **동작** | 좋아요 트랙을 PMS로 옮김 |
| **추가학습** | 새로운 PMS 트랙으로 모델 재학습 |

---

## 8. API 매핑 테이블

| 기능 | Spring Boot (8080) | FastAPI (8000) |
|------|-------------------|----------------|
| 회원가입 | `POST /api/auth/signup` | - |
| 로그인 | `POST /api/auth/login` | - |
| 1차 학습 | `POST /api/analysis/train/{userId}` | - |
| 1차 프로필 조회 | `GET /api/analysis/summary/{userId}` | - |
| 2차 학습 | - | `POST /api/m1/analyze` |
| EMS 랜덤 트랙 | - | `POST /api/m1/random-ems` |
| EMS 전달 + 평가 | - | `POST /api/m1/transfer-ems` |
| 추천 + GMS 저장 | - | `POST /api/m1/recommend/{user_id}` |
| 프로필 조회 | - | `GET /api/m1/user/{user_id}/profile` |
| 트랙 삭제 + 재학습 | - | `POST /api/m1/deleted-track` |
| 피드백 재학습 | - | `POST /api/m1/retrain/{user_id}` |