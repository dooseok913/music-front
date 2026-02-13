# 🎵 스트리밍 플랫폼 연동 현황

> 마지막 업데이트: 2026-02-04

## 개요

Music Space 프로젝트는 6개의 외부 음악 스트리밍 플랫폼과 연동됩니다.

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React)                       │
│                 MusicConnections.tsx                     │
├─────────────────────────────────────────────────────────┤
│  services/api/                                           │
│  ├── tidal.ts          ← Tidal API                      │
│  ├── spotify.ts        ← Spotify API                    │
│  ├── youtube.ts        ← YouTube (공개 검색)             │
│  ├── youtubeMusic.ts   ← YouTube Music (OAuth)          │
│  ├── apple.ts          ← Apple Music (Developer Token)  │
│  └── itunes.ts         ← iTunes (공개 API)              │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend (Node.js)                       │
│                 server/src/routes/                       │
├─────────────────────────────────────────────────────────┤
│  ├── tidal.js          (33KB)  ← OAuth, 플레이리스트    │
│  ├── spotify.js        (27KB)  ← OAuth, Token, Browser  │
│  ├── spotifyBrowser.js (13KB)  ← Playwright 자동화      │
│  ├── youtube.js        (3KB)   ← API Key 기반           │
│  ├── youtubeMusic.js   (18KB)  ← Google OAuth           │
│  └── itunes.js         (6KB)   ← 공개 API               │
└─────────────────────────────────────────────────────────┘
```

---

## 플랫폼별 상세

### 1️⃣ Tidal

| 항목 | 내용 |
|------|------|
| **파일** | `tidal.ts` → `tidal.js` |
| **인증 방식** | Device Auth Flow + Web Auth Flow + OAuth Popup |
| **세션 관리** | `visitorId` (localStorage) |

#### API 엔드포인트
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/tidal/auth/status` | 인증 상태 확인 |
| GET | `/tidal/auth/login-url` | OAuth 로그인 URL |
| POST | `/tidal/auth/device` | Device Auth 시작 |
| POST | `/tidal/auth/token` | 토큰 폴링 |
| POST | `/tidal/auth/exchange` | 코드 교환 |
| POST | `/tidal/auth/logout` | 로그아웃 |
| GET | `/tidal/search` | 플레이리스트/트랙 검색 |
| GET | `/tidal/featured` | Featured 플레이리스트 |
| GET | `/tidal/playlists/:id` | 플레이리스트 상세 |
| GET | `/tidal/playlists/:id/items` | 플레이리스트 트랙 |
| GET | `/tidal/user/playlists` | 사용자 플레이리스트 |
| POST | `/tidal/import` | PMS로 가져오기 |
| POST | `/tidal/sync` | 플레이리스트 동기화 |

#### 데이터 타입
```typescript
interface TidalPlaylist {
    uuid: string
    title: string
    numberOfTracks: number
    trackCount?: number
    squareImage?: string
    image?: string
    description?: string
    creator?: { name: string }
}
```

---

### 2️⃣ Spotify

| 항목 | 내용 |
|------|------|
| **파일** | `spotify.ts` → `spotify.js`, `spotifyBrowser.js` |
| **인증 방식** | 3가지: OAuth, Bearer Token, Browser Automation |
| **세션 관리** | `visitorId` (localStorage) |

#### 3가지 인증 방식

| 방식 | 설명 | 사용 시나리오 |
|------|------|--------------|
| **OAuth** | 표준 Spotify OAuth 2.0 | 일반 사용자 로그인 |
| **Token** | 직접 Bearer Token 입력 | 개발자/고급 사용자 |
| **Browser** | Playwright 자동화 | OAuth 불가 환경 |

#### API 엔드포인트 (OAuth)
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/spotify/auth/login` | 로그인 URL |
| POST | `/spotify/auth/exchange` | 코드 교환 |
| GET | `/spotify/auth/status` | 인증 상태 |
| POST | `/spotify/auth/logout` | 로그아웃 |
| GET | `/spotify/playlists` | 플레이리스트 목록 |
| GET | `/spotify/playlists/:id/tracks` | 트랙 목록 |
| POST | `/spotify/import` | PMS로 가져오기 |
| GET | `/spotify/liked` | 좋아요 곡 |

#### API 엔드포인트 (Token)
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/spotify/token/connect` | 토큰으로 연결 |
| GET | `/spotify/token/status` | 토큰 상태 |
| POST | `/spotify/token/disconnect` | 토큰 연결 해제 |
| GET | `/spotify/token/playlists` | 플레이리스트 |
| POST | `/spotify/token/import` | 가져오기 |

#### API 엔드포인트 (Browser)
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/spotify/browser/login` | 이메일/비밀번호 로그인 |
| GET | `/spotify/browser/status` | 세션 상태 |
| POST | `/spotify/browser/logout` | 로그아웃 |
| GET | `/spotify/browser/playlists` | 플레이리스트 |
| POST | `/spotify/browser/import` | 가져오기 |

#### 데이터 타입
```typescript
interface SpotifyPlaylist {
    id: string
    name: string
    description?: string
    image?: string
    trackCount: number
    owner?: string
    public?: boolean
    collaborative?: boolean
    externalUrl?: string
}

interface SpotifyTrack {
    spotifyId: string
    title: string
    artist: string
    artistIds?: string[]
    album?: string
    albumId?: string
    artwork?: string
    duration: number
    isrc?: string
    popularity?: number
    previewUrl?: string
    externalUrl?: string
}
```

---

### 3️⃣ YouTube (공개 검색)

| 항목 | 내용 |
|------|------|
| **파일** | `youtube.ts` → `youtube.js` |
| **인증 방식** | API Key (OAuth 불필요) |
| **용도** | 공개 플레이리스트/비디오 검색 |

#### API 엔드포인트
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/youtube/status` | API 연결 상태 |
| GET | `/youtube/search` | 플레이리스트/비디오 검색 |
| GET | `/youtube/playlists` | Featured 플레이리스트 |
| GET | `/youtube/playlist/:id` | 플레이리스트 상세 |
| GET | `/youtube/playlist/:id/items` | 플레이리스트 아이템 |

#### 데이터 타입
```typescript
interface YoutubePlaylist {
    id: string
    title: string
    description: string
    thumbnail: string
    channelTitle: string
    itemCount?: number
    publishedAt: string
}

interface YoutubeTrack {
    id: string
    title: string
    channelTitle: string
    thumbnail: string
    duration: number
    position: number
}
```

---

### 4️⃣ YouTube Music (OAuth)

| 항목 | 내용 |
|------|------|
| **파일** | `youtubeMusic.ts` → `youtubeMusic.js` |
| **인증 방식** | Google OAuth 2.0 |
| **세션 관리** | `visitorId` (localStorage) |

#### API 엔드포인트
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/youtube-music/auth/login` | 로그인 URL |
| POST | `/youtube-music/auth/exchange` | 코드 교환 |
| GET | `/youtube-music/auth/status` | 인증 상태 |
| POST | `/youtube-music/auth/logout` | 로그아웃 |
| GET | `/youtube-music/playlists` | 사용자 플레이리스트 |
| GET | `/youtube-music/playlists/:id/items` | 플레이리스트 아이템 |
| POST | `/youtube-music/import` | PMS로 가져오기 |
| GET | `/youtube-music/liked` | 좋아요 동영상 |

#### 데이터 타입
```typescript
interface YouTubePlaylist {
    id: string
    name: string
    description?: string
    image?: string
    trackCount: number
    publishedAt?: string
}

interface YouTubeTrack {
    videoId: string
    title: string
    channelTitle?: string
    thumbnail?: string
    description?: string
    publishedAt?: string
    position?: number
}
```

---

### 5️⃣ Apple Music

| 항목 | 내용 |
|------|------|
| **파일** | `apple.ts` (프론트엔드 직접 호출) |
| **인증 방식** | Developer Token (하드코딩) ⚠️ |
| **프록시** | `/apple-proxy/` (CORS 우회) |

#### ⚠️ 주의사항
- Developer Token이 코드에 하드코딩되어 있음
- 토큰 만료 시 수동 갱신 필요
- CORS 정책으로 인해 Nginx 프록시 사용

#### API 엔드포인트
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/apple-proxy/editorial/kr/groupings` | 에디토리얼 그룹 |
| GET | `/apple-proxy/catalog/kr/{type}/{id}/tracks` | 트랙 목록 |

#### 데이터 타입
```typescript
interface AppleMusicItem {
    id: string
    type: 'songs' | 'albums' | 'playlists'
    attributes: {
        name: string
        artistName: string
        albumName?: string
        artwork?: { url: string }
        editorialNotes?: { short: string }
        previews?: { url: string }[]
        url: string
        releaseDate?: string
    }
}
```

---

### 6️⃣ iTunes

| 항목 | 내용 |
|------|------|
| **파일** | `itunes.ts` → `itunes.js` |
| **인증 방식** | 불필요 (완전 공개 API) |
| **용도** | 검색, 추천, 앨범 상세 |

#### API 엔드포인트
| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | `/api/itunes/search` | 음악 검색 |
| GET | `/api/itunes/recommendations` | 추천 앨범 |
| GET | `/api/itunes/album/:id` | 앨범 상세 |

---

## UI 컴포넌트

### MusicConnections.tsx (990줄)

플랫폼 연결 관리 페이지

```
┌─────────────────────────────────────────────────────────┐
│                 MusicConnections                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Spotify   │  │   YouTube   │  │    Tidal    │      │
│  │   ● 연결됨   │  │   ○ 미연결  │  │   ● 연결됨   │      │
│  │  [로그아웃]  │  │   [로그인]  │  │  [로그아웃]  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 플레이리스트 목록                                  │   │
│  │ ├── K-Pop Hits (45곡)          [가져오기]        │   │
│  │ ├── Chill Vibes (32곡)         [가져오기]        │   │
│  │ └── Workout Mix (28곡)         [가져오기]        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 주요 핸들러
| 함수 | 설명 |
|------|------|
| `handleSpotifyLogout` | Spotify 로그아웃 |
| `loadSpotifyPlaylists` | Spotify 플레이리스트 로드 |
| `handleImportPlaylist` | 플레이리스트 가져오기 |
| `handleYoutubeLogin` | YouTube 팝업 로그인 |
| `handleYoutubeLogout` | YouTube 로그아웃 |
| `handleYoutubeImport` | YouTube 플레이리스트 가져오기 |
| `handleTidalLogin` | Tidal 팝업 로그인 |
| `handleTidalLogout` | Tidal 로그아웃 |
| `handleTidalImport` | Tidal 플레이리스트 가져오기 |

---

## 공통 패턴

### visitorId 세션 관리
```typescript
function getVisitorId(): string {
    let visitorId = localStorage.getItem('{platform}_visitor_id')
    if (!visitorId) {
        visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('{platform}_visitor_id', visitorId)
    }
    return visitorId
}
```

### 플레이리스트 가져오기 플로우
```
1. 플랫폼 로그인 (OAuth/Token)
2. 사용자 플레이리스트 조회
3. 플레이리스트 선택
4. /import API 호출
5. PMS (Playlist Music Space)에 저장
```

---

## 개선 필요 사항

| 우선순위 | 항목 | 설명 |
|----------|------|------|
| 🔴 High | Apple Music 토큰 | 하드코딩된 토큰 → 환경변수/자동 갱신 |
| 🟡 Medium | MusicConnections 리팩토링 | 990줄 → 컴포넌트 분리 |
| 🟡 Medium | 에러 핸들링 통합 | 플랫폼별 에러 메시지 통일 |
| 🟢 Low | 타입 정의 통합 | 각 플랫폼 타입을 공통 인터페이스로 |
