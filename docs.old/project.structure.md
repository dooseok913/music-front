# Music Space 프로젝트 구조

## 목차
1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [프론트엔드 구조](#3-프론트엔드-구조-humamappleteampreject001)
4. [Node.js 백엔드 구조](#4-nodejs-백엔드-구조-server)
5. [Spring Boot 백엔드 구조](#5-spring-boot-백엔드-구조-2teamfinalproject-be)
6. [데이터베이스 스키마](#6-데이터베이스-스키마)
7. [API 엔드포인트 매핑](#7-api-엔드포인트-매핑)
8. [마이그레이션 현황](#8-마이그레이션-현황)

---

## 1. 프로젝트 개요

**Music Space**는 여러 스트리밍 플랫폼(Tidal, Spotify, YouTube Music, Apple Music)의 플레이리스트를 통합 관리하고, AI 기반 음악 추천을 제공하는 음악 스트리밍 플랫폼입니다.

### 1.1 핵심 기능
| 기능 | 설명 |
|------|------|
| **PMS** (Personal Music Space) | 사용자 개인 플레이리스트 관리 |
| **GMS** (Gateway Music Space) | AI 추천 기반 게이트웨이 공간 |
| **EMS** (External Music Space) | 외부 플랫폼 연동 공간 |
| **플랫폼 연동** | Tidal, Spotify, YouTube Music, Apple Music OAuth 연동 |
| **AI 분석** | 사용자 취향 분석 및 맞춤형 추천 |

### 1.2 기술 스택
| 레이어 | 기술 |
|--------|------|
| **프론트엔드** | React 18 + TypeScript + Vite 6 + Tailwind CSS 3 |
| **Node.js 백엔드** | Express.js (레거시/폴백, Port 3001) |
| **Spring Boot 백엔드** | Java 17 + Spring Security + JPA (신규 메인, Port 8080) |
| **데이터베이스** | MariaDB 10.11 (공유 DB: `music_space_db`) |
| **캐시/세션** | Redis 7 |
| **컨테이너** | Docker + Docker Compose |

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend (TypeScript)                       │
│                    humamAppleTeamPreject001/src                      │
│                    Vite + Tailwind CSS                               │
│                    Port: 5173 (dev) / 80 (prod-nginx)                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
              Vite Proxy / Nginx Reverse Proxy
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│  Node.js Backend        │    │  Spring Boot Backend                │
│  (레거시/폴백)           │    │  (신규 메인 API)                     │
│  Express.js             │    │  Java 17 + Spring Security          │
│  Port: 3001             │    │  Port: 8080                         │
│                         │    │                                     │
│  server/src/            │    │  2TeamFinalProject-BE/              │
│  ├── routes/ (14개)     │    │  └── domain/ (15개 모듈)            │
│  ├── services/          │    │                                     │
│  └── config/            │    │  토큰 저장: Redis (30일 TTL)         │
│                         │    │  API 문서: Swagger/OpenAPI          │
│  토큰 저장: In-Memory   │    │                                     │
└────────────┬────────────┘    └─────────────────┬───────────────────┘
             │                                   │
             └─────────────────┬─────────────────┘
                               │
                               ▼
             ┌─────────────────────────────────┐
             │         MariaDB 10.11           │
             │         music_space_db          │
             │         Port: 3306              │
             └─────────────────────────────────┘
                               +
             ┌─────────────────────────────────┐
             │           Redis 7               │
             │         (세션/캐시)              │
             │         Port: 6379              │
             └─────────────────────────────────┘
```

---

## 3. 프론트엔드 구조 (humamAppleTeamPreject001)

### 3.1 디렉토리 구조

```
humamAppleTeamPreject001/
├── src/
│   ├── App.tsx                    # 루트 컴포넌트 (라우팅)
│   ├── main.tsx                   # React 엔트리포인트
│   ├── index.css                  # 글로벌 스타일
│   │
│   ├── components/                # 재사용 컴포넌트
│   │   ├── auth/                  # 인증 관련
│   │   │   ├── ProtectedRoute.tsx     # 보호된 라우트
│   │   │   ├── TidalLoginModal.tsx    # Tidal OAuth 모달
│   │   │   ├── TermsModal.tsx         # 이용약관 모달
│   │   │   └── PrivacyModal.tsx       # 개인정보 모달
│   │   ├── common/                # 공통 UI
│   │   ├── layout/                # 레이아웃 컴포넌트
│   │   └── music/                 # 음악 관련
│   │       ├── MusicPlayer.tsx        # 글로벌 뮤직 플레이어
│   │       ├── MusicHeader.tsx        # 음악 페이지 헤더
│   │       ├── MusicSidebar.tsx       # 음악 페이지 사이드바
│   │       ├── PlaylistCard.tsx       # 플레이리스트 카드
│   │       ├── PlaylistDetailModal.tsx # 플레이리스트 상세
│   │       ├── TrackListOverlay.tsx   # 트랙 목록 오버레이
│   │       ├── UploadZone.tsx         # 업로드 영역
│   │       └── ems/                   # EMS 전용 컴포넌트
│   │
│   ├── pages/                     # 페이지 컴포넌트
│   │   ├── auth/                  # 인증 페이지
│   │   │   ├── Login.tsx              # 로그인
│   │   │   ├── Register.tsx           # 회원가입
│   │   │   ├── Onboarding.tsx         # 온보딩 (서비스 연동)
│   │   │   ├── TidalCallback.tsx      # Tidal OAuth 콜백
│   │   │   ├── SpotifyCallback.tsx    # Spotify OAuth 콜백
│   │   │   └── YouTubeCallback.tsx    # YouTube OAuth 콜백
│   │   ├── music/                 # 음악 페이지
│   │   │   ├── MusicHome.tsx          # 음악 홈
│   │   │   ├── MusicLounge.tsx        # PMS (Personal Music Space)
│   │   │   ├── GatewayMusicSpace.tsx  # GMS (AI 추천)
│   │   │   ├── ExternalMusicSpace.tsx # EMS (외부 연동)
│   │   │   ├── MusicConnections.tsx   # 연동 관리
│   │   │   └── MusicSettings.tsx      # 음악 설정
│   │   ├── dashboard/             # 대시보드
│   │   ├── ai/                    # AI 스튜디오
│   │   ├── pos/                   # POS 시스템
│   │   ├── email/                 # 이메일
│   │   ├── forms/                 # 폼 예제
│   │   ├── tables/                # 테이블 예제
│   │   ├── charts/                # 차트 예제
│   │   └── ui/                    # UI 컴포넌트 예제
│   │
│   ├── layouts/                   # 레이아웃
│   │   ├── MainLayout.tsx             # 메인 레이아웃 (대시보드)
│   │   ├── MusicLayout.tsx            # 음악 레이아웃 (사이드바 포함)
│   │   └── MusicHomeLayout.tsx        # 음악 홈 레이아웃 (사이드바 없음)
│   │
│   ├── contexts/                  # React Context
│   │   └── AuthContext.tsx            # 인증 상태 관리
│   │
│   ├── context/                   # Context (별도 폴더)
│   │   └── MusicContext.tsx           # 음악 재생 상태 관리
│   │
│   └── services/                  # 서비스 레이어
│       ├── api/                   # API 서비스 (11개)
│       │   ├── index.ts               # API 기본 설정
│       │   ├── auth.ts                # 인증 API
│       │   ├── tidal.ts               # Tidal API
│       │   ├── spotify.ts             # Spotify API
│       │   ├── youtube.ts             # YouTube API
│       │   ├── youtubeMusic.ts        # YouTube Music API
│       │   ├── apple.ts               # Apple Music API
│       │   ├── itunes.ts              # iTunes API
│       │   ├── playlists.ts           # 플레이리스트 API
│       │   ├── genres.ts              # 장르 API
│       │   └── stats.ts               # 통계 API
│       └── audio/                 # 오디오 서비스
│           ├── AudioService.ts        # 오디오 재생 서비스
│           └── TidalPlayerAdapter.ts  # Tidal 플레이어 어댑터
│
├── public/
│   └── images/
│       ├── artists/               # 아티스트 이미지 (51+)
│       ├── covers/                # 앨범 커버
│       └── tracks/                # 트랙 이미지
│
├── server/                        # Node.js 백엔드 (별도 섹션 참조)
├── dist/                          # 빌드 출력
├── docs/                          # 문서
│
├── vite.config.ts                 # Vite 설정 + API 프록시
├── tailwind.config.js             # Tailwind CSS 설정
├── tsconfig.json                  # TypeScript 설정
├── package.json                   # npm 의존성
├── docker-compose.yml             # Docker 오케스트레이션
├── Dockerfile                     # Nginx 컨테이너
├── nginx.conf                     # Nginx 설정
├── .env                           # 환경 변수
└── .env.docker                    # Docker 환경 변수
```

### 3.2 라우팅 구조 (App.tsx)

| 경로 | 컴포넌트 | 레이아웃 | 보호 |
|------|----------|----------|------|
| `/login` | Login | 없음 | No |
| `/register` | Register | 없음 | No |
| `/onboarding` | Onboarding | 없음 | Yes |
| `/tidal-callback` | TidalCallback | 없음 | No |
| `/spotify-callback` | SpotifyCallback | 없음 | No |
| `/youtube-callback` | YouTubeCallback | 없음 | No |
| `/` | → `/music/home` | Redirect | - |
| `/music/home` | MusicHome | MusicHomeLayout | No |
| `/music/lounge` | MusicLounge (PMS) | MusicLayout | Yes |
| `/music/lab` | GatewayMusicSpace (GMS) | MusicLayout | Yes |
| `/music/external-space` | ExternalMusicSpace (EMS) | MusicLayout | Yes |
| `/music/connections` | MusicConnections | MusicLayout | Yes |
| `/music/settings` | MusicSettings | MusicLayout | Yes |
| `/dashboard/*` | Dashboard 페이지들 | MainLayout | Yes |

### 3.3 주요 API 서비스 (src/services/api/)

| 파일 | 주요 함수 |
|------|----------|
| `tidal.ts` | `getAuthStatus`, `getLoginUrl`, `exchangeCode`, `logout`, `getUserPlaylists`, `importPlaylist`, `searchPlaylists`, `searchTracks`, `getFeatured`, `syncTidal` |
| `spotify.ts` | `browserLogin`, `browserLogout`, `browserGetStatus`, `browserGetPlaylists`, `browserImportPlaylist` |
| `youtubeMusic.ts` | `getAuthStatus`, `getLoginUrl`, `logout`, `getPlaylists`, `importPlaylist` |
| `playlists.ts` | `getPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `addTrack`, `removeTrack` |
| `auth.ts` | `login`, `register`, `logout`, `getProfile`, `updateProfile` |

---

## 4. Node.js 백엔드 구조 (server/)

### 4.1 디렉토리 구조

```
humamAppleTeamPreject001/server/
├── src/
│   ├── index.js                   # Express 앱 엔트리포인트
│   │
│   ├── routes/                    # API 라우트 (14개)
│   │   ├── auth.js                    # 인증 (/api/auth/*)
│   │   ├── tidal.js                   # Tidal (/api/tidal/*)
│   │   ├── spotify.js                 # Spotify (/api/spotify/*)
│   │   ├── spotifyBrowser.js          # Spotify 브라우저 로그인
│   │   ├── youtube.js                 # YouTube (/api/youtube/*)
│   │   ├── youtubeMusic.js            # YouTube Music (/api/youtube-music/*)
│   │   ├── itunes.js                  # iTunes (/api/itunes/*)
│   │   ├── playlists.js               # 플레이리스트 (/api/playlists/*)
│   │   ├── pms.js                     # PMS (/api/pms/*)
│   │   ├── ems.js                     # EMS (/api/ems/*)
│   │   ├── genres.js                  # 장르 (/api/genres/*)
│   │   ├── stats.js                   # 통계 (/api/stats/*)
│   │   ├── analysis.js                # 분석 (/api/analysis/*)
│   │   └── training.js                # 학습 (/api/training/*)
│   │
│   ├── config/
│   │   └── db.js                      # MariaDB 연결 설정
│   │
│   ├── middleware/
│   │   └── auth.js                    # JWT 인증 미들웨어
│   │
│   ├── services/                  # 비즈니스 로직
│   └── utils/                     # 유틸리티
│
├── migrations/                    # DB 마이그레이션 스크립트
├── ml/                            # 머신러닝 모델
├── dataset/                       # 학습 데이터셋
│
├── package.json                   # npm 의존성
├── Dockerfile                     # Docker 컨테이너
└── *.js                           # 유틸리티 스크립트들
```

### 4.2 주요 라우트 엔드포인트

| 라우트 파일 | 기본 경로 | 주요 엔드포인트 |
|------------|----------|----------------|
| `auth.js` | `/api/auth` | `/login`, `/register`, `/logout`, `/profile` |
| `tidal.js` | `/api/tidal` | `/auth/login-url`, `/auth/exchange`, `/auth/status`, `/auth/logout`, `/user/playlists`, `/import` |
| `spotify.js` | `/api/spotify` | `/auth/*`, `/playlists`, `/import` |
| `youtubeMusic.js` | `/api/youtube-music` | `/auth/*`, `/playlists`, `/import` |
| `playlists.js` | `/api/playlists` | CRUD, `/tracks` |
| `pms.js` | `/api/pms` | `/playlists`, `/tracks` |
| `genres.js` | `/api/genres` | `/`, `/categories`, `/grouped` |
| `stats.js` | `/api/stats` | `/dashboard`, `/content`, `/artists` |

---

## 5. Spring Boot 백엔드 구조 (2TeamFinalProject-BE)

### 5.1 디렉토리 구조

```
2TeamFinalProject-BE/
├── src/main/java/com/springboot/finalprojcet/
│   │
│   ├── FinalProjectApplication.java   # Spring Boot 메인
│   │
│   ├── controller/
│   │   └── MainController.java        # 헬스체크
│   │
│   ├── config/                    # 설정 클래스
│   │   ├── SecurityConfig.java        # Spring Security
│   │   ├── RedisConfig.java           # Redis 설정
│   │   ├── RestTemplateConfig.java    # RestTemplate 빈
│   │   ├── SwaggerConfig.java         # OpenAPI/Swagger
│   │   ├── WebMvcConfig.java          # WebMvc 설정
│   │   └── GlobalExceptionHandler.java # 전역 예외 처리
│   │
│   ├── domain/                    # 도메인 모듈 (15개)
│   │   ├── auth/                  # 인증
│   │   │   ├── controller/AuthController.java
│   │   │   ├── service/AuthService.java
│   │   │   ├── dto/               # LoginRequest, TokenResponse 등
│   │   │   └── jwt/               # JwtTokenProvider, JwtFilter
│   │   │
│   │   ├── user/                  # 사용자
│   │   │   ├── controller/UserController.java
│   │   │   ├── service/UserService.java
│   │   │   └── dto/
│   │   │
│   │   ├── tidal/                 # Tidal 연동 (★ 완성)
│   │   │   ├── controller/TidalController.java
│   │   │   ├── service/
│   │   │   │   ├── TidalService.java (interface)
│   │   │   │   └── impl/TidalServiceImpl.java
│   │   │   ├── store/TidalTokenStore.java (Redis)
│   │   │   ├── config/TidalProperties.java
│   │   │   ├── repository/
│   │   │   │   ├── TracksRepository.java
│   │   │   │   └── PlaylistTracksRepository.java
│   │   │   └── dto/               # 16개 DTO
│   │   │       ├── TidalLoginUrlResponse.java
│   │   │       ├── TidalExchangeRequest.java
│   │   │       ├── TidalExchangeResponse.java
│   │   │       ├── TidalAuthStatusResponse.java
│   │   │       ├── TidalPlaylistResponse.java
│   │   │       ├── TidalImportRequest.java
│   │   │       ├── TidalImportResponse.java
│   │   │       ├── TidalSyncRequest.java
│   │   │       ├── TidalSyncResponse.java
│   │   │       ├── TidalDeviceAuthResponse.java
│   │   │       ├── TidalTokenPollRequest.java
│   │   │       ├── TidalTokenPollResponse.java
│   │   │       ├── TidalSearchResponse.java
│   │   │       ├── TidalFeaturedResponse.java
│   │   │       ├── TidalPlaylist.java
│   │   │       └── TidalTrack.java
│   │   │
│   │   ├── spotify/               # Spotify 연동
│   │   ├── youtube/               # YouTube 연동
│   │   ├── itunes/                # iTunes 연동
│   │   │
│   │   ├── playlist/              # 플레이리스트
│   │   │   ├── controller/PlaylistController.java
│   │   │   ├── service/PlaylistService.java
│   │   │   └── dto/
│   │   │
│   │   ├── pms/                   # Personal Music Space
│   │   ├── gms/                   # Gateway Music Space
│   │   ├── ems/                   # External Music Space
│   │   │
│   │   ├── genre/                 # 장르
│   │   ├── stats/                 # 통계
│   │   ├── analysis/              # AI 분석
│   │   ├── training/              # 학습
│   │   └── common/                # 공통
│   │
│   ├── entity/                    # JPA 엔티티 (17개)
│   │   ├── Users.java
│   │   ├── Playlists.java
│   │   ├── Tracks.java
│   │   ├── PlaylistTracks.java
│   │   ├── UserPlatforms.java
│   │   ├── UserGenres.java
│   │   ├── UserProfiles.java
│   │   ├── MusicGenres.java
│   │   ├── GenreCategories.java
│   │   ├── AiAnalysisLogs.java
│   │   ├── ContentStats.java
│   │   ├── ContentStatsId.java
│   │   ├── ArtistStats.java
│   │   ├── PlaylistScored.java
│   │   ├── TrackScored.java
│   │   ├── EmsPlaylistForRecommend.java
│   │   └── BaseEntity.java
│   │
│   └── enums/                     # Enum 타입 (7개)
│       ├── RoleType.java              # USER, ADMIN
│       ├── PlatformType.java          # Tidal, Spotify, YouTube, Apple
│       ├── SpaceType.java             # PMS, GMS, EMS
│       ├── SourceType.java            # Platform, Upload, System
│       ├── StatusFlag.java            # active, PTP, PRP, PFP
│       ├── TargetType.java            # track, playlist, artist
│       └── RecommendStatus.java       # pending, approved, rejected
│
├── src/main/resources/
│   └── application.yml            # Spring Boot 설정
│
├── build.gradle                   # Gradle 빌드
├── docker-compose.yml             # Docker 오케스트레이션
└── Dockerfile                     # 멀티스테이지 빌드
```

### 5.2 엔티티 관계도 (ERD)

```
┌───────────────┐       ┌────────────────────┐       ┌───────────────┐
│    Users      │       │    Playlists       │       │    Tracks     │
├───────────────┤       ├────────────────────┤       ├───────────────┤
│ PK user_id    │──┐    │ PK playlist_id     │   ┌──│ PK track_id   │
│    username   │  │    │ FK user_id         │   │  │    title      │
│    email      │  └───>│    title           │   │  │    artist     │
│    password   │       │    source_type     │   │  │    tidal_id   │
│    role_type  │       │    external_id     │   │  │    spotify_id │
│    ...        │       │    space_type      │   │  │    youtube_id │
└───────────────┘       │    status_flag     │   │  │    artwork    │
        │               └─────────┬──────────┘   │  │    duration   │
        │                         │              │  │    album      │
        │                         │              │  │    genre      │
        │               ┌─────────▼──────────────▼───┐  └───────────────┘
        │               │     PlaylistTracks        │
        │               ├────────────────────────────┤
        │               │ PK map_id                  │
        │               │ FK playlist_id             │
        │               │ FK track_id                │
        │               │    order_index             │
        │               └────────────────────────────┘
        │
        ▼
┌───────────────────┐       ┌────────────────────┐
│  UserPlatforms    │       │    UserGenres      │
├───────────────────┤       ├────────────────────┤
│ FK user_id        │       │ FK user_id         │
│    platform_name  │       │ FK genre_id        │
│    access_token   │       │    preference_score│
│    refresh_token  │       └────────────────────┘
│    connected_at   │
└───────────────────┘
```

### 5.3 Spring Boot 설정 (application.yml)

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:mariadb://${DB_HOST:localhost}:3306/music_space_db
    username: ${DB_USER:root}
    password: ${DB_PASSWORD:}
  
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: 6379

tidal:
  client-id: ${TIDAL_CLIENT_ID:}
  client-secret: ${TIDAL_CLIENT_SECRET:}
  auth-url: https://auth.tidal.com/v1/oauth2
  api-url: https://api.tidal.com/v1

jwt:
  secret: ${JWT_SECRET:}
  expiration: 86400000

springdoc:
  api-docs:
    path: /v3/api-docs
  swagger-ui:
    path: /api/swagger-ui.html
```

---

## 6. 데이터베이스 스키마

### 6.1 핵심 테이블

```sql
-- 사용자
CREATE TABLE users (
    user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_type ENUM('USER', 'ADMIN') DEFAULT 'USER',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 플레이리스트
CREATE TABLE playlists (
    playlist_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    cover_image VARCHAR(500),
    source_type ENUM('Platform', 'Upload', 'System') DEFAULT 'Platform',
    external_id VARCHAR(255),
    space_type ENUM('PMS', 'GMS', 'EMS') DEFAULT 'PMS',
    status_flag ENUM('active', 'PTP', 'PRP', 'PFP') DEFAULT 'active',
    ai_score DECIMAL(5,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE INDEX idx_user_external (user_id, external_id, source_type)
);

-- 트랙
CREATE TABLE tracks (
    track_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    album VARCHAR(200),
    tidal_id VARCHAR(255),
    spotify_id VARCHAR(255),
    youtube_id VARCHAR(255),
    artwork VARCHAR(500),
    duration INT,
    genre VARCHAR(100),
    INDEX idx_tidal_id (tidal_id),
    INDEX idx_spotify_id (spotify_id)
);

-- 플레이리스트-트랙 매핑
CREATE TABLE playlist_tracks (
    map_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    playlist_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    order_index INT DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(track_id),
    UNIQUE INDEX idx_playlist_track (playlist_id, track_id)
);

-- 사용자 플랫폼 연동
CREATE TABLE user_platforms (
    platform_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    platform_name ENUM('Tidal', 'YouTube Music', 'Apple Music', 'Spotify'),
    platform_user_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    UNIQUE INDEX idx_user_platform (user_id, platform_name)
);
```

---

## 7. API 엔드포인트 매핑

### 7.1 Node.js vs Spring Boot 비교

| 기능 | Node.js 엔드포인트 | Spring Boot 엔드포인트 | 상태 |
|------|-------------------|----------------------|------|
| **Tidal OAuth URL** | `GET /api/tidal/auth/login-url` | `GET /api/tidal/auth/login-url` | ✅ 완료 |
| **Tidal 코드 교환** | `POST /api/tidal/auth/exchange` | `POST /api/tidal/auth/exchange` | ✅ 완료 |
| **Tidal 상태** | `GET /api/tidal/auth/status` | `GET /api/tidal/auth/status` | ✅ 완료 |
| **Tidal 로그아웃** | `POST /api/tidal/auth/logout` | `POST /api/tidal/auth/logout` | ✅ 완료 |
| **Tidal 플레이리스트** | `GET /api/tidal/user/playlists` | `GET /api/tidal/user/playlists` | ✅ 완료 |
| **Tidal 임포트** | `POST /api/tidal/import` | `POST /api/tidal/import` | ✅ 완료 |
| **인증 로그인** | `POST /api/auth/login` | `POST /api/auth/login` | 🔄 진행중 |
| **인증 회원가입** | `POST /api/auth/register` | `POST /api/auth/register` | 🔄 진행중 |
| **플레이리스트 CRUD** | `GET/POST /api/playlists` | `GET/POST /api/playlist` | 🔄 진행중 |
| **PMS** | `/api/pms/*` | `/api/pms/*` | 📋 예정 |
| **장르** | `/api/genres/*` | `/api/genre/*` | 📋 예정 |
| **통계** | `/api/stats/*` | `/api/stats/*` | 📋 예정 |

### 7.2 Vite 프록시 설정 (vite.config.ts)

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api/tidal': 'http://localhost:8080',      // Spring Boot
      '/api/auth': 'http://localhost:8080',       // Spring Boot
      '/api': 'http://localhost:3001',            // Node.js (폴백)
    }
  }
})
```

---

## 8. 마이그레이션 현황

### 8.1 Node.js → Spring Boot 마이그레이션

| 모듈 | Node.js | Spring Boot | 상태 |
|------|---------|-------------|------|
| **Tidal 연동** | `routes/tidal.js` | `domain/tidal/` | ✅ 완료 |
| **인증** | `routes/auth.js` | `domain/auth/` | 🔄 진행중 |
| **플레이리스트** | `routes/playlists.js` | `domain/playlist/` | 🔄 진행중 |
| **PMS** | `routes/pms.js` | `domain/pms/` | 📋 예정 |
| **Spotify** | `routes/spotify.js` | `domain/spotify/` | 📋 예정 |
| **YouTube** | `routes/youtubeMusic.js` | `domain/youtube/` | 📋 예정 |
| **장르** | `routes/genres.js` | `domain/genre/` | 📋 예정 |
| **통계** | `routes/stats.js` | `domain/stats/` | 📋 예정 |
| **분석** | `routes/analysis.js` | `domain/analysis/` | 📋 예정 |

### 8.2 개선 사항 (Spring Boot)

| 항목 | Node.js | Spring Boot | 이점 |
|------|---------|-------------|------|
| 토큰 저장 | In-Memory | Redis (30일 TTL) | 영속성, 확장성 |
| 타입 안전성 | JavaScript | Java Generics | 컴파일 타임 검증 |
| 트랜잭션 | 수동 | `@Transactional` | 데이터 무결성 |
| API 문서 | 없음 | Swagger/OpenAPI | 개발 편의성 |
| 에러 처리 | try-catch | GlobalExceptionHandler | 일관된 응답 |
| 설정 관리 | dotenv | `@ConfigurationProperties` | 타입 안전 설정 |

---

## 부록: 환경 변수

### 필수 환경 변수 (.env)

```bash
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=music_space_db
DB_USER=root
DB_PASSWORD=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_key

# Tidal
TIDAL_CLIENT_ID=your_tidal_client_id
TIDAL_CLIENT_SECRET=your_tidal_client_secret
TIDAL_REDIRECT_URI=http://localhost/tidal-callback

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# YouTube
YOUTUBE_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

*문서 최종 업데이트: 2026년 2월*
