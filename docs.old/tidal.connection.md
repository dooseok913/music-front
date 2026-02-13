# Tidal 연동 (Connections) 기술 문서

## 목차
1. [개요](#1-개요)
2. [아키텍처](#2-아키텍처)
3. [프론트엔드 구현](#3-프론트엔드-구현)
4. [Node.js 백엔드 구현](#4-nodejs-백엔드-구현)
5. [Spring Boot 백엔드 구현](#5-spring-boot-백엔드-구현)
6. [OAuth 2.0 PKCE 인증 플로우](#6-oauth-20-pkce-인증-플로우)
7. [플레이리스트 임포트 플로우](#7-플레이리스트-임포트-플로우)
8. [API 엔드포인트](#8-api-엔드포인트)
9. [데이터베이스 스키마](#9-데이터베이스-스키마)
10. [토큰 관리 전략](#10-토큰-관리-전략)
11. [보안 고려사항](#11-보안-고려사항)
12. [마이그레이션 현황](#12-마이그레이션-현황)
13. [환경 변수](#13-환경-변수)
14. [파일 위치 참조](#14-파일-위치-참조)

---

## 1. 개요

### 1.1 목적
Tidal 연동은 Tidal을 구독한 회원이 Music Space 플랫폼에 회원가입하여:
- 자신의 Tidal 플레이리스트를 PMS(Personal Music Space)로 가져오기
- AI가 플레이리스트의 트랙을 분석하여 맞춤형 추천곡 제공
- Tidal 스트리밍 API를 통한 음악 감상

### 1.2 핵심 기능
| 기능 | 설명 |
|------|------|
| OAuth 2.0 PKCE 인증 | 안전한 Tidal 계정 연동 |
| 플레이리스트 임포트 | Tidal 플레이리스트를 PMS로 가져오기 |
| 트랙 동기화 | 트랙 메타데이터 DB 저장 |
| 다중 사용자 지원 | visitorId 기반 세션 격리 |
| 자동 임포트 | 연결 시 모든 플레이리스트 자동 가져오기 |

### 1.3 기술 스택
- **프론트엔드**: React 18 + TypeScript + Vite
- **Node.js 백엔드**: Express.js (레거시/폴백)
- **Spring Boot 백엔드**: Java 17 + Spring Security + Redis (신규 메인)
- **데이터베이스**: MariaDB 10.11 (공유)
- **캐시/세션**: Redis 7

---

## 2. 아키텍처

### 2.1 시스템 구성도

```
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend (TypeScript)                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │  tidal.ts       │  │ TidalLoginModal  │  │ MusicConnections  │   │
│  │  (API 서비스)    │  │ (OAuth 모달)     │  │ (연동 UI)         │   │
│  └────────┬────────┘  └────────┬─────────┘  └─────────┬─────────┘   │
│           │                    │                      │              │
│           └────────────────────┼──────────────────────┘              │
│                                │                                     │
│  ┌─────────────────────────────┼─────────────────────────────────┐   │
│  │              TidalCallback.tsx (OAuth 콜백 핸들러)              │   │
│  │              Route: /tidal-callback                            │   │
│  └─────────────────────────────┼─────────────────────────────────┘   │
└────────────────────────────────┼─────────────────────────────────────┘
                                 │
                    Vite Proxy (/api/* → :8080 또는 :3001)
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
              ▼                                     ▼
┌─────────────────────────────┐    ┌────────────────────────────────────┐
│   Node.js Backend (3001)    │    │    Spring Boot Backend (8080)      │
│   Express.js                │    │    Java 17 + Spring Security       │
│                             │    │                                    │
│  ┌───────────────────────┐  │    │  ┌──────────────────────────────┐  │
│  │ routes/tidal.js       │  │    │  │ domain/tidal/                │  │
│  │                       │  │    │  │  ├─ controller/              │  │
│  │ - OAuth PKCE 구현      │  │    │  │  │  └─ TidalController.java  │  │
│  │ - 플레이리스트 관리     │  │    │  │  ├─ service/                │  │
│  │ - 검색/추천            │  │    │  │  │  └─ TidalServiceImpl.java │  │
│  │                       │  │    │  │  ├─ store/                   │  │
│  │ 토큰 저장:             │  │    │  │  │  └─ TidalTokenStore.java  │  │
│  │ - In-Memory Map       │  │    │  │  ├─ config/                  │  │
│  │ - visitorTokens{}     │  │    │  │  │  └─ TidalProperties.java  │  │
│  │ - visitorPkceVerifiers│  │    │  │  └─ dto/ (14개 DTO)          │  │
│  └───────────────────────┘  │    │  └──────────────────────────────┘  │
│                             │    │                                    │
│                             │    │  토큰 저장:                         │
│                             │    │  - Redis (30일 TTL)                │
│                             │    │  - tidal:token:{visitorId}         │
│                             │    │  - tidal:pkce:{visitorId}          │
└──────────────┬──────────────┘    └─────────────────┬──────────────────┘
               │                                     │
               └──────────────────┬──────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │      MariaDB 10.11       │
                    │      music_space_db      │
                    │                          │
                    │  - playlists             │
                    │  - tracks                │
                    │  - playlist_tracks       │
                    │  - user_platforms        │
                    └──────────────────────────┘
                                  +
                    ┌──────────────────────────┐
                    │        Redis 7           │
                    │   (세션/토큰 캐시)         │
                    └──────────────────────────┘
```

### 2.2 외부 API 연동

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Tidal API Endpoints                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Authentication:                                                    │
│  ├─ https://login.tidal.com/authorize    (OAuth 로그인 페이지)       │
│  └─ https://auth.tidal.com/v1/oauth2/token (토큰 발급/갱신)          │
│                                                                     │
│  API:                                                               │
│  ├─ https://api.tidal.com/v1/sessions    (세션 정보)                 │
│  ├─ https://api.tidal.com/v1/users/{id}/playlists (플레이리스트)     │
│  ├─ https://api.tidal.com/v1/playlists/{id} (플레이리스트 상세)       │
│  ├─ https://api.tidal.com/v1/playlists/{id}/items (트랙 목록)        │
│  ├─ https://api.tidal.com/v1/search      (검색)                     │
│  └─ https://api.tidal.com/v1/pages/*     (추천/피처드)               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 프론트엔드 구현

### 3.1 Tidal API 서비스 (`src/services/api/tidal.ts`)

#### 3.1.1 세션 관리 (다중 사용자 지원)

```typescript
// 각 브라우저 세션마다 고유 visitorId 생성
const getVisitorId = () => {
    let visitorId = localStorage.getItem('tidal_visitor_id');
    if (!visitorId) {
        visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('tidal_visitor_id', visitorId);
    }
    return visitorId;
};
```

#### 3.1.2 API 함수 목록

| 함수 | 설명 | HTTP 메서드 |
|------|------|-------------|
| `getAuthStatus()` | 인증 상태 확인 (visitorId 기반) | GET |
| `getLoginUrl()` | OAuth URL 요청 | GET |
| `exchangeCode(code)` | 인증 코드 → 토큰 교환 | POST |
| `logout()` | 로그아웃 및 토큰 삭제 | POST |
| `getUserPlaylists()` | 사용자 플레이리스트 목록 | GET |
| `importPlaylist(id, userId)` | 플레이리스트 PMS로 임포트 | POST |
| `searchPlaylists(query)` | 플레이리스트 검색 (기본: K-POP) | GET |
| `searchTracks(query)` | 트랙 검색 | GET |
| `getFeatured()` | 추천 플레이리스트 | GET |
| `getPlaylist(id)` | 플레이리스트 상세 | GET |
| `getPlaylistTracks(id)` | 플레이리스트 트랙 목록 | GET |
| `initDeviceAuth()` | Device Code Flow 시작 | POST |
| `pollToken(deviceCode)` | 토큰 폴링 (Device Flow) | POST |
| `syncTidal(data)` | Tidal 데이터 동기화 | POST |

#### 3.1.3 API 요청 헤더 구성

```typescript
const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-visitor-id': getVisitorId(),  // 다중 사용자 식별
});
```

### 3.2 TidalLoginModal 컴포넌트 (`src/components/auth/TidalLoginModal.tsx`)

#### 3.2.1 컴포넌트 구조

```typescript
interface TidalLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (response: TidalAuthResponse) => void;
}

// UI 상태
type ModalState = 'loading' | 'waiting' | 'complete';
```

#### 3.2.2 OAuth 팝업 플로우

```typescript
const handleLogin = async () => {
    setStatus('loading');

    // 1. OAuth URL 요청
    const response = await tidalApi.getLoginUrl();

    // 2. 새 탭에서 Tidal 로그인 페이지 오픈
    const popup = window.open(response.authUrl, '_blank');

    setStatus('waiting');

    // 3. postMessage 또는 localStorage 변경 감지
    window.addEventListener('message', handleAuthMessage);

    // 4. 로그인 완료 시 토큰 저장 및 콜백 호출
};
```

#### 3.2.3 인증 완료 처리

```typescript
const handleAuthMessage = (event: MessageEvent) => {
    if (event.data?.type === 'TIDAL_AUTH_SUCCESS') {
        const { accessToken, refreshToken, user } = event.data;

        // localStorage에 토큰 저장
        localStorage.setItem('tidal_access_token', accessToken);
        localStorage.setItem('tidal_refresh_token', refreshToken);

        setStatus('complete');
        onSuccess(event.data);
    }
};
```

### 3.3 TidalCallback 컴포넌트 (`src/pages/auth/TidalCallback.tsx`)

#### 3.3.1 역할
- OAuth 리다이렉트 URI: `/tidal-callback`
- URL에서 `code` 파라미터 추출
- 백엔드 `/auth/exchange` 호출하여 토큰 교환
- 부모 창에 결과 전달 후 자동 닫힘

#### 3.3.2 구현

```typescript
const TidalCallback: React.FC = () => {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
            exchangeCodeForToken(code);
        }
    }, []);

    const exchangeCodeForToken = async (code: string) => {
        const response = await tidalApi.exchangeCode(code);

        if (response.success) {
            // 부모 창에 결과 전달
            if (window.opener) {
                window.opener.postMessage({
                    type: 'TIDAL_AUTH_SUCCESS',
                    ...response
                }, window.location.origin);
            }

            // 폴백: localStorage
            localStorage.setItem('tidal_auth_result', JSON.stringify(response));

            // 1초 후 팝업 닫기
            setTimeout(() => window.close(), 1000);
        }
    };

    return <div>Tidal 로그인 처리 중...</div>;
};
```

### 3.4 MusicConnections 페이지 (`src/pages/music/MusicConnections.tsx`)

#### 3.4.1 Tidal 관련 상태

```typescript
// 연결 상태
const [tidalConnected, setTidalConnected] = useState(false);
const [tidalUser, setTidalUser] = useState<{
    username: string;
    userId: string;
} | null>(null);

// 플레이리스트
const [tidalPlaylists, setTidalPlaylists] = useState<TidalPlaylist[]>([]);
const [importedTidalPlaylists, setImportedTidalPlaylists] = useState<Set<string>>(new Set());

// UI 상태
const [isLoading, setIsLoading] = useState(false);
const [showTidalModal, setShowTidalModal] = useState(false);
```

#### 3.4.2 연결 상태 확인

```typescript
const checkTidalStatus = async () => {
    try {
        const response = await tidalApi.getAuthStatus();
        if (response.authenticated) {
            setTidalConnected(true);
            setTidalUser(response.user);
            setTidalPlaylists(response.playlists || []);
        }
    } catch (error) {
        setTidalConnected(false);
    }
};
```

#### 3.4.3 자동 임포트 플로우

```typescript
const handleTidalSuccess = async (response: TidalAuthResponse) => {
    setTidalConnected(true);
    setTidalUser(response.user);
    setShowTidalModal(false);

    // 자동 임포트: 모든 플레이리스트를 PMS로 가져오기
    await loadAndImportTidalPlaylists();
};

const loadAndImportTidalPlaylists = async () => {
    const { playlists } = await tidalApi.getUserPlaylists();
    setTidalPlaylists(playlists);

    const imported = new Set<string>();
    for (const playlist of playlists) {
        try {
            const result = await tidalApi.importPlaylist(playlist.uuid, user.id);
            if (result.success) {
                imported.add(playlist.uuid);
            }
        } catch (error) {
            console.error(`Failed to import ${playlist.title}`);
        }
    }
    setImportedTidalPlaylists(imported);
};
```

#### 3.4.4 수동 임포트

```typescript
const handleTidalImport = async (playlist: TidalPlaylist) => {
    if (importedTidalPlaylists.has(playlist.uuid)) {
        alert('이미 임포트된 플레이리스트입니다.');
        return;
    }

    const result = await tidalApi.importPlaylist(playlist.uuid, user.id);

    if (result.success) {
        setImportedTidalPlaylists(prev => new Set([...prev, playlist.uuid]));
        alert(`"${result.title}" 임포트 완료 (${result.importedTracks}곡)`);
    }
};
```

#### 3.4.5 로그아웃

```typescript
const handleTidalLogout = async () => {
    await tidalApi.logout();

    // 상태 초기화
    setTidalConnected(false);
    setTidalUser(null);
    setTidalPlaylists([]);
    setImportedTidalPlaylists(new Set());

    // localStorage 정리
    localStorage.removeItem('tidal_access_token');
    localStorage.removeItem('tidal_refresh_token');
    localStorage.removeItem('tidal_visitor_id');
};
```

---

## 4. Node.js 백엔드 구현

### 4.1 파일 위치
`server/src/routes/tidal.js`

### 4.2 PKCE 헬퍼 함수

```javascript
const crypto = require('crypto');

// Code Verifier 생성 (32바이트 랜덤)
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

// Code Challenge 생성 (SHA256 해시)
function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}
```

### 4.3 토큰 저장소 (In-Memory)

```javascript
// 방문자별 토큰 저장 (서버 재시작 시 손실)
let visitorTokens = {};
// 구조: { visitorId: { accessToken, refreshToken, expiresAt, userId, countryCode } }

// PKCE Verifier 임시 저장
let visitorPkceVerifiers = {};
// 구조: { visitorId: codeVerifier }

// Client Credentials 토큰 (공개 데이터 접근용)
let cachedToken = null;
let tokenExpiry = null;
```

### 4.4 Client Credentials Flow (공개 데이터용)

```javascript
async function getClientToken() {
    // 캐시된 토큰이 유효하면 재사용
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const credentials = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(TIDAL_AUTH_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1분 여유

    return cachedToken;
}
```

### 4.5 OAuth 엔드포인트

#### 4.5.1 로그인 URL 생성

```javascript
// GET /api/tidal/auth/login-url
router.get('/auth/login-url', (req, res) => {
    const visitorId = req.headers['x-visitor-id'] || 'default';
    const origin = req.headers.origin || 'http://localhost:5173';

    // PKCE 생성
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 저장 (교환 시 사용)
    visitorPkceVerifiers[visitorId] = codeVerifier;

    // 새로운 Developer Portal 스코프 (레거시 r_usr/w_usr는 에러 발생)
    const scopes = 'user.read playlists.read playlists.write collection.read';

    const redirectUri = `${origin}/tidal-callback`;

    const authUrl = `https://login.tidal.com/authorize?` +
        `response_type=code&` +
        `client_id=${TIDAL_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`;

    res.json({ authUrl });
});
```

#### 4.5.2 코드 교환

```javascript
// POST /api/tidal/auth/exchange
router.post('/auth/exchange', async (req, res) => {
    const { code, redirectUri } = req.body;
    const visitorId = req.headers['x-visitor-id'] || 'default';

    // 저장된 PKCE Verifier 가져오기
    const codeVerifier = visitorPkceVerifiers[visitorId];
    if (!codeVerifier) {
        return res.status(400).json({ error: 'PKCE verifier not found' });
    }

    const credentials = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64');

    // 토큰 교환
    const tokenResponse = await fetch(`${TIDAL_AUTH_URL}/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
        })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
        return res.status(400).json({ error: tokenData.error_description });
    }

    // 세션 정보 조회 (userId, countryCode)
    const sessionResponse = await fetch(`${TIDAL_API_URL}/sessions`, {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const session = await sessionResponse.json();

    // 토큰 저장
    visitorTokens[visitorId] = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        userId: session.userId,
        countryCode: session.countryCode,
        username: session.username
    };

    // PKCE Verifier 삭제
    delete visitorPkceVerifiers[visitorId];

    res.json({
        success: true,
        user: {
            userId: session.userId,
            countryCode: session.countryCode,
            username: session.username
        },
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in
    });
});
```

#### 4.5.3 인증 상태 확인

```javascript
// GET /api/tidal/auth/status
router.get('/auth/status', async (req, res) => {
    const visitorId = req.headers['x-visitor-id'] || 'default';
    const tokenInfo = visitorTokens[visitorId];

    if (!tokenInfo || Date.now() >= tokenInfo.expiresAt) {
        return res.json({ authenticated: false });
    }

    // 플레이리스트 목록도 함께 반환
    const playlists = await fetchTidalPlaylists(tokenInfo.accessToken, tokenInfo.userId);

    res.json({
        authenticated: true,
        user: {
            userId: tokenInfo.userId,
            countryCode: tokenInfo.countryCode,
            username: tokenInfo.username
        },
        playlists
    });
});
```

#### 4.5.4 로그아웃

```javascript
// POST /api/tidal/auth/logout
router.post('/auth/logout', (req, res) => {
    const visitorId = req.headers['x-visitor-id'] || 'default';

    delete visitorTokens[visitorId];
    delete visitorPkceVerifiers[visitorId];

    res.json({ success: true });
});
```

### 4.6 플레이리스트 관리 엔드포인트

#### 4.6.1 사용자 플레이리스트 조회

```javascript
// GET /api/tidal/user/playlists
router.get('/user/playlists', async (req, res) => {
    const visitorId = req.headers['x-visitor-id'] || 'default';
    const tokenInfo = visitorTokens[visitorId];

    if (!tokenInfo) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const playlists = await fetchTidalPlaylists(tokenInfo.accessToken, tokenInfo.userId);

    res.json({ playlists });
});

// 헬퍼 함수: 플레이리스트 조회 (여러 엔드포인트 시도)
async function fetchTidalPlaylists(token, providedUserId = null) {
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. 사용자 ID 확인
    let tidalUserId = providedUserId;
    if (!tidalUserId) {
        // /sessions, /users/me, /me 순서로 시도
        const sessionResp = await fetch(`${TIDAL_API_URL}/sessions`, { headers });
        const session = await sessionResp.json();
        tidalUserId = session.userId;
    }

    // 2. 플레이리스트 엔드포인트 시도 (순서대로)
    const endpoints = [
        `/users/${tidalUserId}/playlists`,
        `/users/${tidalUserId}/favorites/playlists`,
        `/my-collection/playlists/folders`
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`${TIDAL_API_URL}${endpoint}?limit=50`, { headers });
            if (response.ok) {
                const data = await response.json();
                return data.items || [];
            }
        } catch (e) {
            continue;
        }
    }

    return [];
}
```

#### 4.6.2 플레이리스트 임포트

```javascript
// POST /api/tidal/import
router.post('/import', async (req, res) => {
    const { playlistId, userId } = req.body;
    const visitorId = req.headers['x-visitor-id'] || 'default';
    const tokenInfo = visitorTokens[visitorId];

    if (!tokenInfo) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // 1. 중복 확인
    const existing = await queryOne(`
        SELECT playlist_id FROM playlists
        WHERE user_id = ? AND external_id = ? AND source_type = 'tidal'
    `, [userId, playlistId]);

    if (existing) {
        return res.json({ success: true, skipped: true, message: 'Already imported' });
    }

    // 2. Tidal에서 플레이리스트 정보 조회
    const headers = { 'Authorization': `Bearer ${tokenInfo.accessToken}` };
    const playlistResp = await fetch(
        `${TIDAL_API_URL}/playlists/${playlistId}?countryCode=${tokenInfo.countryCode}`,
        { headers }
    );
    const playlist = await playlistResp.json();

    // 3. 트랙 전체 조회 (페이지네이션)
    const tracks = await fetchTidalPlaylistTracks(tokenInfo.accessToken, playlistId, tokenInfo.countryCode);

    // 4. 플레이리스트 생성
    const result = await execute(`
        INSERT INTO playlists (user_id, title, description, cover_image, source_type, external_id, space_type, status_flag, created_at)
        VALUES (?, ?, ?, ?, 'tidal', ?, 'PMS', 'active', NOW())
    `, [
        userId,
        playlist.title,
        playlist.description || '',
        playlist.squareImage?.[0]?.url || '',
        playlistId
    ]);

    const newPlaylistId = result.insertId;

    // 5. 트랙 삽입
    let importedCount = 0;
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i].item || tracks[i];

        // 트랙 중복 확인 (tidal_id 또는 title+artist)
        let trackRecord = await queryOne(`
            SELECT track_id FROM tracks WHERE tidal_id = ?
        `, [track.id]);

        if (!trackRecord) {
            trackRecord = await queryOne(`
                SELECT track_id FROM tracks WHERE title = ? AND artist = ?
            `, [track.title, track.artist?.name || 'Unknown']);
        }

        if (!trackRecord) {
            // 새 트랙 생성
            const trackResult = await execute(`
                INSERT INTO tracks (title, artist, tidal_id, artwork, duration, album, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `, [
                track.title,
                track.artist?.name || 'Unknown',
                track.id,
                track.album?.cover?.[0]?.url || '',
                track.duration,
                track.album?.title || ''
            ]);
            trackRecord = { track_id: trackResult.insertId };
        }

        // playlist_tracks에 추가
        await execute(`
            INSERT INTO playlist_tracks (playlist_id, track_id, order_index)
            VALUES (?, ?, ?)
        `, [newPlaylistId, trackRecord.track_id, i]);

        importedCount++;
    }

    res.json({
        success: true,
        playlistId: newPlaylistId,
        title: playlist.title,
        importedTracks: importedCount,
        totalTracks: tracks.length
    });
});

// 헬퍼 함수: 트랙 페이지네이션 조회
async function fetchTidalPlaylistTracks(token, playlistId, countryCode = 'KR') {
    const headers = { 'Authorization': `Bearer ${token}` };
    let allItems = [];
    let offset = 0;
    const limit = 100; // Tidal 최대 한도

    while (true) {
        const response = await fetch(
            `${TIDAL_API_URL}/playlists/${playlistId}/items?limit=${limit}&offset=${offset}&countryCode=${countryCode}`,
            { headers }
        );
        const data = await response.json();

        if (!data.items || data.items.length === 0) break;

        allItems = allItems.concat(data.items);
        offset += data.items.length;

        if (offset >= data.totalNumberOfItems) break;
    }

    return allItems;
}
```

### 4.7 검색 및 추천 엔드포인트

```javascript
// GET /api/tidal/search
router.get('/search', async (req, res) => {
    const { query = 'K-POP', type = 'playlists' } = req.query;
    const token = await getClientToken();

    const response = await fetch(
        `${TIDAL_API_URL}/search/${type}?query=${encodeURIComponent(query)}&limit=20&countryCode=KR`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const data = await response.json();
    res.json(data);
});

// GET /api/tidal/featured
router.get('/featured', async (req, res) => {
    const token = await getClientToken();

    const response = await fetch(
        `${TIDAL_API_URL}/pages/explore?countryCode=KR`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const data = await response.json();
    res.json(data);
});
```

---

## 5. Spring Boot 백엔드 구현

### 5.1 패키지 구조

```
com.springboot.finalprojcet.domain.tidal/
├── controller/
│   └── TidalController.java          # REST 컨트롤러
├── service/
│   ├── TidalService.java             # 인터페이스
│   └── impl/
│       └── TidalServiceImpl.java     # 구현체 (350+ lines)
├── store/
│   └── TidalTokenStore.java          # Redis 토큰 저장소
├── config/
│   └── TidalProperties.java          # 환경 설정
└── dto/
    ├── TidalLoginUrlResponse.java
    ├── TidalExchangeRequest.java
    ├── TidalExchangeResponse.java
    ├── TidalAuthStatusResponse.java
    ├── TidalPlaylistResponse.java
    ├── TidalImportRequest.java
    ├── TidalImportResponse.java
    ├── TidalSyncRequest.java
    ├── TidalSyncResponse.java
    ├── TidalDeviceAuthResponse.java
    ├── TidalTokenPollRequest.java
    ├── TidalTokenPollResponse.java
    ├── TidalSearchResponse.java
    └── TidalFeaturedResponse.java
```

### 5.2 환경 설정 (`TidalProperties.java`)

```java
@Component
@ConfigurationProperties(prefix = "tidal")
@Getter
@Setter
public class TidalProperties {
    private String clientId;
    private String clientSecret;
    private String authUrl = "https://auth.tidal.com/v1/oauth2";
    private String apiUrl = "https://api.tidal.com/v1";
    private String redirectUri = "http://localhost/tidal-callback";
}
```

**application.yml 설정:**

```yaml
tidal:
  client-id: ${TIDAL_CLIENT_ID:}
  client-secret: ${TIDAL_CLIENT_SECRET:}
  auth-url: https://auth.tidal.com/v1/oauth2
  api-url: https://api.tidal.com/v1
  redirect-uri: ${TIDAL_REDIRECT_URI:http://localhost/tidal-callback}
```

### 5.3 Redis 토큰 저장소 (`TidalTokenStore.java`)

```java
@Component
@RequiredArgsConstructor
public class TidalTokenStore {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final String TOKEN_KEY_PREFIX = "tidal:token:";
    private static final String PKCE_KEY_PREFIX = "tidal:pkce:";
    private static final long TOKEN_TTL_DAYS = 30;
    private static final long PKCE_TTL_MINUTES = 10;

    // 토큰 정보 구조체
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TokenInfo {
        private String accessToken;
        private String refreshToken;
        private long expiresAt;
        private String userId;
        private String countryCode;
        private String username;
    }

    // 토큰 저장
    public void saveToken(String visitorId, TokenInfo tokenInfo) {
        String key = TOKEN_KEY_PREFIX + visitorId;
        String value = objectMapper.writeValueAsString(tokenInfo);
        redisTemplate.opsForValue().set(key, value, TOKEN_TTL_DAYS, TimeUnit.DAYS);
    }

    // 토큰 조회
    public TokenInfo getToken(String visitorId) {
        String key = TOKEN_KEY_PREFIX + visitorId;
        String value = redisTemplate.opsForValue().get(key);
        if (value == null) return null;
        return objectMapper.readValue(value, TokenInfo.class);
    }

    // 토큰 삭제
    public void removeToken(String visitorId) {
        redisTemplate.delete(TOKEN_KEY_PREFIX + visitorId);
    }

    // PKCE Verifier 저장
    public void savePkceVerifier(String visitorId, String codeVerifier) {
        String key = PKCE_KEY_PREFIX + visitorId;
        redisTemplate.opsForValue().set(key, codeVerifier, PKCE_TTL_MINUTES, TimeUnit.MINUTES);
    }

    // PKCE Verifier 조회 및 삭제 (일회성)
    public String removePkceVerifier(String visitorId) {
        String key = PKCE_KEY_PREFIX + visitorId;
        String value = redisTemplate.opsForValue().get(key);
        if (value != null) {
            redisTemplate.delete(key);
        }
        return value;
    }
}
```

### 5.4 컨트롤러 (`TidalController.java`)

```java
@RestController
@RequestMapping("/api/tidal")
@RequiredArgsConstructor
@Tag(name = "Tidal", description = "Tidal 연동 API")
public class TidalController {

    private final TidalService tidalService;

    // OAuth 로그인 URL
    @GetMapping("/auth/login-url")
    @Operation(summary = "Tidal OAuth 로그인 URL 생성")
    public ResponseEntity<TidalLoginUrlResponse> getLoginUrl(
            @RequestHeader(value = "x-visitor-id", defaultValue = "default") String visitorId,
            @RequestHeader(value = "origin", defaultValue = "http://localhost:5173") String origin) {
        return ResponseEntity.ok(tidalService.getLoginUrl(visitorId, origin));
    }

    // 코드 교환
    @PostMapping("/auth/exchange")
    @Operation(summary = "OAuth 코드를 토큰으로 교환")
    public ResponseEntity<TidalExchangeResponse> exchangeCode(
            @RequestBody TidalExchangeRequest request,
            @RequestHeader(value = "origin", defaultValue = "http://localhost:5173") String origin) {
        return ResponseEntity.ok(tidalService.exchangeCode(request, origin));
    }

    // 인증 상태
    @GetMapping("/auth/status")
    @Operation(summary = "Tidal 인증 상태 확인")
    public ResponseEntity<TidalAuthStatusResponse> getAuthStatus(
            @RequestHeader(value = "x-visitor-id", defaultValue = "default") String visitorId) {
        return ResponseEntity.ok(tidalService.getAuthStatus(visitorId));
    }

    // 로그아웃
    @PostMapping("/auth/logout")
    @Operation(summary = "Tidal 연결 해제")
    public ResponseEntity<Map<String, Boolean>> logout(
            @RequestHeader(value = "x-visitor-id", defaultValue = "default") String visitorId) {
        tidalService.logout(visitorId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // 사용자 플레이리스트
    @GetMapping("/user/playlists")
    @Operation(summary = "사용자 Tidal 플레이리스트 조회")
    public ResponseEntity<TidalPlaylistResponse> getUserPlaylists(
            @RequestHeader(value = "x-visitor-id", defaultValue = "default") String visitorId) {
        return ResponseEntity.ok(tidalService.getUserPlaylists(visitorId));
    }

    // 플레이리스트 임포트
    @PostMapping("/import")
    @Operation(summary = "Tidal 플레이리스트를 PMS로 임포트")
    public ResponseEntity<TidalImportResponse> importPlaylist(
            @RequestBody TidalImportRequest request) {
        return ResponseEntity.ok(tidalService.importPlaylist(request));
    }

    // 검색
    @GetMapping("/search")
    @Operation(summary = "Tidal 플레이리스트/트랙 검색")
    public ResponseEntity<TidalSearchResponse> search(
            @RequestParam(defaultValue = "K-POP") String query,
            @RequestParam(defaultValue = "playlists") String type) {
        return ResponseEntity.ok(tidalService.search(query, type));
    }

    // 피처드
    @GetMapping("/featured")
    @Operation(summary = "추천 플레이리스트")
    public ResponseEntity<TidalFeaturedResponse> getFeatured() {
        return ResponseEntity.ok(tidalService.getFeatured());
    }

    // Device Auth
    @PostMapping("/auth/device")
    @Operation(summary = "Device Code Flow 시작")
    public ResponseEntity<TidalDeviceAuthResponse> initDeviceAuth(
            @RequestHeader(value = "x-visitor-id", defaultValue = "default") String visitorId) {
        return ResponseEntity.ok(tidalService.initDeviceAuth(visitorId));
    }

    // Token Poll
    @PostMapping("/auth/token")
    @Operation(summary = "Device Code Flow 토큰 폴링")
    public ResponseEntity<TidalTokenPollResponse> pollToken(
            @RequestBody TidalTokenPollRequest request) {
        return ResponseEntity.ok(tidalService.pollToken(request));
    }

    // Sync
    @PostMapping("/sync")
    @Operation(summary = "Tidal 데이터 동기화")
    public ResponseEntity<TidalSyncResponse> syncTidal(
            @RequestBody TidalSyncRequest request) {
        return ResponseEntity.ok(tidalService.syncTidal(request));
    }
}
```

### 5.5 서비스 구현 (`TidalServiceImpl.java`)

#### 5.5.1 PKCE 생성

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class TidalServiceImpl implements TidalService {

    private final TidalProperties tidalProperties;
    private final TidalTokenStore tokenStore;
    private final RestTemplate restTemplate;
    private final PlaylistRepository playlistRepository;
    private final TracksRepository tracksRepository;
    private final PlaylistTracksRepository playlistTracksRepository;
    private final UsersRepository usersRepository;

    // PKCE Code Verifier 생성
    private String generateCodeVerifier() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    // PKCE Code Challenge 생성
    private String generateCodeChallenge(String verifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(verifier.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
```

#### 5.5.2 로그인 URL 생성

```java
    @Override
    public TidalLoginUrlResponse getLoginUrl(String visitorId, String origin) {
        String codeVerifier = generateCodeVerifier();
        String codeChallenge = generateCodeChallenge(codeVerifier);

        // Redis에 PKCE Verifier 저장
        tokenStore.savePkceVerifier(visitorId, codeVerifier);

        // 새로운 Developer Portal 스코프
        String scopes = "user.read playlists.read playlists.write collection.read";

        String redirectUri = origin + "/tidal-callback";

        String authUrl = String.format(
            "https://login.tidal.com/authorize?" +
            "response_type=code&" +
            "client_id=%s&" +
            "redirect_uri=%s&" +
            "scope=%s&" +
            "code_challenge=%s&" +
            "code_challenge_method=S256",
            tidalProperties.getClientId(),
            URLEncoder.encode(redirectUri, StandardCharsets.UTF_8),
            URLEncoder.encode(scopes, StandardCharsets.UTF_8),
            codeChallenge
        );

        return TidalLoginUrlResponse.builder()
            .authUrl(authUrl)
            .build();
    }
```

#### 5.5.3 코드 교환

```java
    @Override
    @Transactional
    public TidalExchangeResponse exchangeCode(TidalExchangeRequest request, String origin) {
        // PKCE Verifier 가져오기
        String codeVerifier = tokenStore.removePkceVerifier(request.getVisitorId());
        if (codeVerifier == null) {
            return TidalExchangeResponse.builder()
                .success(false)
                .error("PKCE verifier not found")
                .build();
        }

        // Basic Auth 헤더
        String credentials = Base64.getEncoder().encodeToString(
            (tidalProperties.getClientId() + ":" + tidalProperties.getClientSecret())
                .getBytes(StandardCharsets.UTF_8)
        );

        // 토큰 교환 요청
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Basic " + credentials);
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "authorization_code");
        body.add("code", request.getCode());
        body.add("redirect_uri", request.getRedirectUri());
        body.add("code_verifier", codeVerifier);

        ResponseEntity<JsonNode> tokenResponse = restTemplate.exchange(
            tidalProperties.getAuthUrl() + "/token",
            HttpMethod.POST,
            new HttpEntity<>(body, headers),
            JsonNode.class
        );

        JsonNode tokenData = tokenResponse.getBody();

        if (tokenData.has("error")) {
            return TidalExchangeResponse.builder()
                .success(false)
                .error(tokenData.path("error_description").asText())
                .build();
        }

        String accessToken = tokenData.path("access_token").asText();
        String refreshToken = tokenData.path("refresh_token").asText();
        int expiresIn = tokenData.path("expires_in").asInt();

        // 세션 정보 조회
        TidalAuthStatusResponse.TidalUserInfo userInfo = fetchSessionInfo(accessToken);

        // Redis에 토큰 저장
        TidalTokenStore.TokenInfo tokenInfo = new TidalTokenStore.TokenInfo(
            accessToken,
            refreshToken,
            System.currentTimeMillis() + (expiresIn * 1000L),
            userInfo.getUserId(),
            userInfo.getCountryCode(),
            userInfo.getUsername()
        );
        tokenStore.saveToken(request.getVisitorId(), tokenInfo);

        return TidalExchangeResponse.builder()
            .success(true)
            .user(userInfo)
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(expiresIn)
            .build();
    }

    // 세션 정보 조회 헬퍼
    private TidalAuthStatusResponse.TidalUserInfo fetchSessionInfo(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);

        ResponseEntity<JsonNode> response = restTemplate.exchange(
            tidalProperties.getApiUrl() + "/sessions",
            HttpMethod.GET,
            new HttpEntity<>(headers),
            JsonNode.class
        );

        JsonNode session = response.getBody();

        return TidalAuthStatusResponse.TidalUserInfo.builder()
            .userId(session.path("userId").asText())
            .countryCode(session.path("countryCode").asText())
            .username(session.path("username").asText())
            .build();
    }
```

#### 5.5.4 플레이리스트 임포트

```java
    @Override
    @Transactional
    public TidalImportResponse importPlaylist(TidalImportRequest request) {
        // 중복 확인
        String externalId = "tidal:" + request.getPlaylistId();
        if (playlistRepository.existsByExternalIdAndUserUserId(externalId, request.getUserId())) {
            return TidalImportResponse.builder()
                .success(true)
                .skipped(true)
                .message("Already imported")
                .build();
        }

        // 토큰 조회
        TidalTokenStore.TokenInfo tokenInfo = tokenStore.getToken(request.getVisitorId());
        if (tokenInfo == null) {
            return TidalImportResponse.builder()
                .success(false)
                .error("Not authenticated")
                .build();
        }

        // Tidal에서 플레이리스트 조회
        JsonNode playlist = fetchPlaylistInfo(tokenInfo.getAccessToken(), request.getPlaylistId(), tokenInfo.getCountryCode());

        // 트랙 전체 조회
        List<JsonNode> tracks = fetchPlaylistTracks(tokenInfo.getAccessToken(), request.getPlaylistId(), tokenInfo.getCountryCode());

        // 사용자 조회
        Users user = usersRepository.findById(request.getUserId())
            .orElseThrow(() -> new RuntimeException("User not found"));

        // 플레이리스트 생성
        Playlists newPlaylist = Playlists.builder()
            .user(user)
            .title(playlist.path("title").asText())
            .description(playlist.path("description").asText(""))
            .coverImage(resolvePlaylistImage(playlist))
            .sourceType(SourceType.Platform)
            .externalId(externalId)
            .spaceType(SpaceType.PMS)
            .statusFlag(StatusFlag.Active)
            .build();

        playlistRepository.save(newPlaylist);

        // 트랙 삽입
        int importedCount = 0;
        for (int i = 0; i < tracks.size(); i++) {
            JsonNode trackNode = tracks.get(i);
            JsonNode track = trackNode.has("item") ? trackNode.path("item") : trackNode;

            String tidalId = track.path("id").asText();

            // 중복 확인 (tidal_id 또는 title+artist)
            Tracks trackEntity = tracksRepository.findByTidalId(tidalId)
                .orElseGet(() -> {
                    String title = track.path("title").asText();
                    String artist = track.path("artist").path("name").asText("Unknown");

                    return tracksRepository.findByTitleAndArtist(title, artist)
                        .orElseGet(() -> createNewTrack(track, tidalId));
                });

            // playlist_tracks에 추가
            PlaylistTracks pt = PlaylistTracks.builder()
                .playlist(newPlaylist)
                .track(trackEntity)
                .orderIndex(i)
                .build();
            playlistTracksRepository.save(pt);

            importedCount++;
        }

        return TidalImportResponse.builder()
            .success(true)
            .playlistId(newPlaylist.getPlaylistId())
            .title(newPlaylist.getTitle())
            .importedTracks(importedCount)
            .totalTracks(tracks.size())
            .build();
    }

    // 새 트랙 생성 헬퍼
    private Tracks createNewTrack(JsonNode track, String tidalId) {
        Tracks newTrack = Tracks.builder()
            .title(track.path("title").asText())
            .artist(track.path("artist").path("name").asText("Unknown"))
            .tidalId(tidalId)
            .artwork(track.path("album").path("cover").path(0).path("url").asText(""))
            .duration(track.path("duration").asInt())
            .album(track.path("album").path("title").asText(""))
            .build();

        return tracksRepository.save(newTrack);
    }

    // 트랙 페이지네이션 조회
    private List<JsonNode> fetchPlaylistTracks(String accessToken, String playlistId, String countryCode) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);

        List<JsonNode> allTracks = new ArrayList<>();
        int offset = 0;
        int limit = 100;

        while (true) {
            String url = String.format(
                "%s/playlists/%s/items?limit=%d&offset=%d&countryCode=%s",
                tidalProperties.getApiUrl(), playlistId, limit, offset, countryCode
            );

            ResponseEntity<JsonNode> response = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class
            );

            JsonNode data = response.getBody();
            JsonNode items = data.path("items");

            if (!items.isArray() || items.size() == 0) break;

            for (JsonNode item : items) {
                allTracks.add(item);
            }

            offset += items.size();

            int total = data.path("totalNumberOfItems").asInt();
            if (offset >= total) break;
        }

        return allTracks;
    }
}
```

### 5.6 DTO 클래스

#### 5.6.1 TidalExchangeRequest

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TidalExchangeRequest {
    private String code;
    private String visitorId;
    private String redirectUri;
}
```

#### 5.6.2 TidalExchangeResponse

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TidalExchangeResponse {
    private boolean success;
    private String error;
    private TidalAuthStatusResponse.TidalUserInfo user;
    private String accessToken;
    private String refreshToken;
    private int expiresIn;
}
```

#### 5.6.3 TidalAuthStatusResponse

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TidalAuthStatusResponse {
    private boolean authenticated;
    private TidalUserInfo user;
    private List<TidalPlaylist> playlists;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TidalUserInfo {
        private String userId;
        private String countryCode;
        private String username;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TidalPlaylist {
        private String uuid;
        private String title;
        private String description;
        private String image;
        private int numberOfTracks;
    }
}
```

#### 5.6.4 TidalImportRequest

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TidalImportRequest {
    private String visitorId;
    private String playlistId;
    private Long userId;
}
```

#### 5.6.5 TidalImportResponse

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TidalImportResponse {
    private boolean success;
    private boolean skipped;
    private String error;
    private String message;
    private Long playlistId;
    private String title;
    private int importedTracks;
    private int totalTracks;
}
```

---

## 6. OAuth 2.0 PKCE 인증 플로우

### 6.1 플로우 다이어그램

```
┌────────────────┐                                    ┌─────────────────┐
│  React Client  │                                    │  Backend Server │
│                │                                    │ (Node/Spring)   │
└───────┬────────┘                                    └────────┬────────┘
        │                                                      │
        │ 1. 사용자가 "Tidal 연결" 클릭                           │
        │ ─────────────────────────────────────────────────────>│
        │    GET /api/tidal/auth/login-url                     │
        │    Header: x-visitor-id: visitor_xxx                 │
        │                                                      │
        │                    2. PKCE 생성                       │
        │                    ┌─────────────────────────────┐   │
        │                    │ codeVerifier = random(32)   │   │
        │                    │ codeChallenge = SHA256(v)   │   │
        │                    │ Redis/Memory에 저장          │   │
        │                    └─────────────────────────────┘   │
        │ <─────────────────────────────────────────────────────│
        │    { authUrl: "https://login.tidal.com/authorize?..." }
        │                                                      │
        │ 3. 새 탭에서 authUrl 열기                              │
        │ ─────────────────────────────────────────────────────>│
        │                                                      │
        │                     ┌──────────────────────────────┐ │
        │                     │   Tidal Login Page           │ │
        │                     │   (login.tidal.com)          │ │
        │                     └──────────────────────────────┘ │
        │                                                      │
        │ 4. 사용자 인증 완료                                     │
        │ <─────────────────────────────────────────────────────│
        │    리다이렉트: /tidal-callback?code=AUTH_CODE         │
        │                                                      │
        │ 5. TidalCallback 컴포넌트에서 코드 추출                  │
        │ ─────────────────────────────────────────────────────>│
        │    POST /api/tidal/auth/exchange                     │
        │    { code: AUTH_CODE, visitorId: xxx, redirectUri }  │
        │                                                      │
        │                    6. 토큰 교환                        │
        │                    ┌─────────────────────────────┐   │
        │                    │ POST auth.tidal.com/token   │   │
        │                    │ grant_type=authorization_code│  │
        │                    │ code=AUTH_CODE              │   │
        │                    │ code_verifier=저장된값       │   │
        │                    └─────────────────────────────┘   │
        │                                                      │
        │                    7. 세션 정보 조회                    │
        │                    ┌─────────────────────────────┐   │
        │                    │ GET api.tidal.com/sessions  │   │
        │                    │ → userId, countryCode       │   │
        │                    └─────────────────────────────┘   │
        │                                                      │
        │                    8. 토큰 저장                        │
        │                    ┌─────────────────────────────┐   │
        │                    │ Redis: tidal:token:xxx      │   │
        │                    │ TTL: 30 days                │   │
        │                    └─────────────────────────────┘   │
        │ <─────────────────────────────────────────────────────│
        │    { success: true, user: {...}, accessToken, ... }  │
        │                                                      │
        │ 9. 부모 창에 결과 전달 (postMessage)                    │
        │    팝업 자동 닫힘                                      │
        │                                                      │
        │ 10. MusicConnections에서 상태 업데이트                  │
        │     자동 플레이리스트 임포트 시작                         │
        │                                                      │
```

### 6.2 PKCE 보안 매커니즘

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PKCE (Proof Key for Code Exchange)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Code Verifier 생성 (클라이언트)                                  │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  verifier = base64url(random(32 bytes))                   │   │
│     │  예: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"         │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  2. Code Challenge 생성 (클라이언트)                                 │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  challenge = base64url(SHA256(verifier))                  │   │
│     │  예: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"         │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  3. Authorization Request (브라우저 → Tidal)                         │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  GET /authorize?                                          │   │
│     │    code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw│   │
│     │    code_challenge_method=S256                             │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  4. Token Request (서버 → Tidal)                                    │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  POST /token                                              │   │
│     │    code=AUTH_CODE                                         │   │
│     │    code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk│  │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  5. Tidal 검증                                                       │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  계산: base64url(SHA256(code_verifier))                   │   │
│     │  비교: == 저장된 code_challenge ?                          │   │
│     │  일치하면 → 토큰 발급                                       │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  보안 효과:                                                          │
│  - code_verifier는 서버에만 저장 (브라우저 노출 X)                    │
│  - Authorization Code를 가로채도 토큰 획득 불가                       │
│  - MITM (Man-in-the-Middle) 공격 방어                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. 플레이리스트 임포트 플로우

### 7.1 플로우 다이어그램

```
┌────────────────┐          ┌─────────────────┐          ┌──────────────┐
│  React Client  │          │  Backend Server │          │  Tidal API   │
└───────┬────────┘          └────────┬────────┘          └──────┬───────┘
        │                            │                          │
        │ 1. 임포트 요청              │                          │
        │ ──────────────────────────>│                          │
        │ POST /api/tidal/import     │                          │
        │ {                          │                          │
        │   visitorId: "xxx",        │                          │
        │   playlistId: "uuid",      │                          │
        │   userId: 123              │                          │
        │ }                          │                          │
        │                            │                          │
        │              2. 중복 확인   │                          │
        │              ┌─────────────────────────────────────┐  │
        │              │ SELECT FROM playlists               │  │
        │              │ WHERE external_id = 'tidal:uuid'    │  │
        │              │   AND user_id = 123                 │  │
        │              └─────────────────────────────────────┘  │
        │                            │                          │
        │              (중복인 경우)   │                          │
        │ <──────────────────────────│                          │
        │ { success: true,           │                          │
        │   skipped: true }          │                          │
        │                            │                          │
        │              (신규인 경우)   │                          │
        │                            │ 3. 플레이리스트 조회       │
        │                            │ ─────────────────────────>│
        │                            │ GET /playlists/{uuid}    │
        │                            │ <─────────────────────────│
        │                            │ { title, description,... }│
        │                            │                          │
        │                            │ 4. 트랙 조회 (페이지네이션) │
        │                            │ ─────────────────────────>│
        │                            │ GET /playlists/{uuid}/items
        │                            │   ?limit=100&offset=0    │
        │                            │ <─────────────────────────│
        │                            │ { items: [...], total }   │
        │                            │                          │
        │                            │ (offset < total 동안 반복) │
        │                            │ ─────────────────────────>│
        │                            │ GET ...&offset=100       │
        │                            │ <─────────────────────────│
        │                            │                          │
        │              5. DB 저장     │                          │
        │              ┌─────────────────────────────────────┐  │
        │              │ INSERT INTO playlists (...)         │  │
        │              │   source_type = 'tidal'             │  │
        │              │   external_id = 'tidal:uuid'        │  │
        │              │   space_type = 'PMS'                │  │
        │              └─────────────────────────────────────┘  │
        │                            │                          │
        │              6. 트랙 저장   │                          │
        │              ┌─────────────────────────────────────┐  │
        │              │ FOR each track:                     │  │
        │              │   - 중복 확인 (tidal_id)             │  │
        │              │   - 없으면 INSERT INTO tracks       │  │
        │              │   - INSERT INTO playlist_tracks     │  │
        │              └─────────────────────────────────────┘  │
        │                            │                          │
        │ <──────────────────────────│                          │
        │ {                          │                          │
        │   success: true,           │                          │
        │   playlistId: 456,         │                          │
        │   title: "K-POP Hits",     │                          │
        │   importedTracks: 45,      │                          │
        │   totalTracks: 50          │                          │
        │ }                          │                          │
        │                            │                          │
```

### 7.2 데이터 변환

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Tidal → PMS 데이터 매핑                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Tidal Playlist                    PMS Playlist                     │
│  ─────────────────────────────────────────────────────────────────  │
│  {                                 {                                │
│    "uuid": "abc-123",       →        playlist_id: AUTO_INCREMENT,   │
│    "title": "K-POP",        →        title: "K-POP",                │
│    "description": "...",    →        description: "...",            │
│    "squareImage": [...]     →        cover_image: "https://...",    │
│  }                                   source_type: "tidal",          │
│                                      external_id: "tidal:abc-123",  │
│                                      space_type: "PMS",             │
│                                      status_flag: "active"          │
│                                    }                                │
│                                                                     │
│  Tidal Track                       PMS Track                        │
│  ─────────────────────────────────────────────────────────────────  │
│  {                                 {                                │
│    "id": 12345,             →        track_id: AUTO_INCREMENT,      │
│    "title": "Song",         →        title: "Song",                 │
│    "artist": {                       artist: "Artist",              │
│      "name": "Artist"       →        tidal_id: "12345",             │
│    },                                artwork: "https://...",        │
│    "album": {                        duration: 240,                 │
│      "title": "Album",      →        album: "Album"                 │
│      "cover": [...]                }                                │
│    },                                                               │
│    "duration": 240          →                                       │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. API 엔드포인트

### 8.1 인증 (OAuth)

| 엔드포인트 | 메서드 | 설명 | 요청 | 응답 |
|-----------|--------|------|------|------|
| `/api/tidal/auth/login-url` | GET | OAuth URL 생성 | Header: `x-visitor-id` | `{ authUrl }` |
| `/api/tidal/auth/exchange` | POST | 코드 → 토큰 교환 | `{ code, visitorId, redirectUri }` | `{ success, user, accessToken, refreshToken, expiresIn }` |
| `/api/tidal/auth/status` | GET | 인증 상태 확인 | Header: `x-visitor-id` | `{ authenticated, user, playlists }` |
| `/api/tidal/auth/logout` | POST | 연결 해제 | Header: `x-visitor-id` | `{ success }` |
| `/api/tidal/auth/device` | POST | Device Code Flow 시작 | Header: `x-visitor-id` | `{ deviceCode, userCode, verificationUri }` |
| `/api/tidal/auth/token` | POST | 토큰 폴링 | `{ deviceCode, visitorId }` | `{ success, user, accessToken, ... }` |

### 8.2 플레이리스트

| 엔드포인트 | 메서드 | 설명 | 요청 | 응답 |
|-----------|--------|------|------|------|
| `/api/tidal/user/playlists` | GET | 사용자 플레이리스트 | Header: `x-visitor-id` | `{ playlists: [...] }` |
| `/api/tidal/import` | POST | PMS로 임포트 | `{ visitorId, playlistId, userId }` | `{ success, playlistId, title, importedTracks, totalTracks }` |
| `/api/tidal/playlists/{id}` | GET | 플레이리스트 상세 | Path: `id` | `{ uuid, title, description, ... }` |
| `/api/tidal/playlists/{id}/items` | GET | 트랙 목록 | Path: `id`, Query: `limit, offset` | `{ items: [...], totalNumberOfItems }` |

### 8.3 검색 및 추천

| 엔드포인트 | 메서드 | 설명 | 요청 | 응답 |
|-----------|--------|------|------|------|
| `/api/tidal/search` | GET | 검색 | Query: `query, type` | `{ items: [...] }` |
| `/api/tidal/featured` | GET | 추천 플레이리스트 | - | `{ modules: [...] }` |
| `/api/tidal/recommendations` | GET | 믹스 추천 | Header: `x-visitor-id` | `{ mixes: [...] }` |

### 8.4 동기화

| 엔드포인트 | 메서드 | 설명 | 요청 | 응답 |
|-----------|--------|------|------|------|
| `/api/tidal/sync` | POST | 데이터 동기화 | `{ visitorId, accessToken, refreshToken }` | `{ success }` |

---

## 9. 데이터베이스 스키마

### 9.1 playlists 테이블

```sql
CREATE TABLE playlists (
    playlist_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    cover_image VARCHAR(500),
    source_type ENUM('Platform', 'Upload', 'System') NOT NULL DEFAULT 'Platform',
    external_id VARCHAR(255),                    -- 'tidal:{uuid}' 형식
    space_type ENUM('PMS', 'EMS', 'GMS') NOT NULL DEFAULT 'PMS',
    status_flag ENUM('active', 'PTP', 'PRP', 'PFP') NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

    -- Tidal 임포트 중복 방지 인덱스
    UNIQUE INDEX idx_user_external (user_id, external_id, source_type)
);
```

### 9.2 tracks 테이블

```sql
CREATE TABLE tracks (
    track_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200),
    tidal_id VARCHAR(255),                       -- Tidal 트랙 ID
    spotify_id VARCHAR(255),                     -- 타 플랫폼 ID (확장용)
    youtube_id VARCHAR(255),
    artwork VARCHAR(500),
    duration INT,                                -- 초 단위
    album VARCHAR(200),
    external_metadata JSON,                      -- 추가 메타데이터
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Tidal ID로 빠른 조회
    INDEX idx_tidal_id (tidal_id),
    -- 제목+아티스트로 중복 체크
    INDEX idx_title_artist (title, artist)
);
```

### 9.3 playlist_tracks 테이블

```sql
CREATE TABLE playlist_tracks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    playlist_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,          -- 트랙 순서
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (playlist_id) REFERENCES playlists(playlist_id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(track_id) ON DELETE CASCADE,

    -- 같은 트랙 중복 추가 방지
    UNIQUE INDEX idx_playlist_track (playlist_id, track_id)
);
```

### 9.4 user_platforms 테이블

```sql
CREATE TABLE user_platforms (
    platform_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    platform_name ENUM('Tidal', 'YouTube Music', 'Apple Music', 'Spotify') NOT NULL,
    platform_user_id VARCHAR(255),               -- 플랫폼 사용자 ID
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

    -- 사용자당 플랫폼 하나
    UNIQUE INDEX idx_user_platform (user_id, platform_name)
);
```

### 9.5 ERD

```
┌───────────────┐       ┌────────────────────┐       ┌───────────────┐
│    users      │       │    playlists       │       │    tracks     │
├───────────────┤       ├────────────────────┤       ├───────────────┤
│ PK user_id    │──┐    │ PK playlist_id     │   ┌──│ PK track_id   │
│    username   │  │    │ FK user_id         │   │  │    title      │
│    email      │  └───>│    title           │   │  │    artist     │
│    ...        │       │    source_type     │   │  │    tidal_id   │
└───────────────┘       │    external_id     │   │  │    artwork    │
                        │    space_type      │   │  │    duration   │
                        │    status_flag     │   │  │    album      │
                        └─────────┬──────────┘   │  └───────────────┘
                                  │              │
                                  │              │
                        ┌─────────▼──────────────▼───┐
                        │     playlist_tracks        │
                        ├────────────────────────────┤
                        │ PK id                      │
                        │ FK playlist_id             │
                        │ FK track_id                │
                        │    order_index             │
                        └────────────────────────────┘

┌───────────────┐       ┌────────────────────┐
│    users      │       │  user_platforms    │
├───────────────┤       ├────────────────────┤
│ PK user_id    │──────>│ FK user_id         │
│    ...        │       │    platform_name   │
└───────────────┘       │    access_token    │
                        │    refresh_token   │
                        │    connected_at    │
                        └────────────────────┘
```

---

## 10. 토큰 관리 전략

### 10.1 Node.js (In-Memory)

```javascript
// 토큰 구조
visitorTokens = {
    "visitor_xxx": {
        accessToken: "eyJ...",
        refreshToken: "abc...",
        expiresAt: 1704067200000,  // timestamp (ms)
        userId: "12345",
        countryCode: "KR",
        username: "user@example.com"
    }
};

// PKCE Verifier (OAuth 플로우 중에만 사용)
visitorPkceVerifiers = {
    "visitor_xxx": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
};

// 특징
// - 서버 재시작 시 모든 토큰 손실
// - 단일 서버 환경에만 적합
// - 메모리 사용량 주의 필요
```

### 10.2 Spring Boot (Redis)

```
Redis Key 구조:

토큰 저장:
┌─────────────────────────────────────────────────────────────┐
│ KEY: tidal:token:visitor_xxx                                │
│ VALUE: {                                                    │
│   "accessToken": "eyJ...",                                  │
│   "refreshToken": "abc...",                                 │
│   "expiresAt": 1704067200000,                               │
│   "userId": "12345",                                        │
│   "countryCode": "KR",                                      │
│   "username": "user@example.com"                            │
│ }                                                           │
│ TTL: 30 days                                                │
└─────────────────────────────────────────────────────────────┘

PKCE Verifier 임시 저장:
┌─────────────────────────────────────────────────────────────┐
│ KEY: tidal:pkce:visitor_xxx                                 │
│ VALUE: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"        │
│ TTL: 10 minutes                                             │
└─────────────────────────────────────────────────────────────┘

특징:
- 서버 재시작 후에도 토큰 유지
- 다중 서버 환경 지원 (수평 확장)
- 자동 만료 (TTL)
- 고가용성 (Redis Cluster)
```

### 10.3 토큰 갱신 전략

```
┌─────────────────────────────────────────────────────────────────────┐
│                       토큰 갱신 로직                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. API 요청 전 토큰 유효성 확인                                      │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  if (Date.now() >= tokenInfo.expiresAt - 60000) {         │   │
│     │      // 만료 1분 전이면 갱신                                │   │
│     │      await refreshAccessToken(tokenInfo.refreshToken);    │   │
│     │  }                                                        │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  2. 토큰 갱신 요청                                                    │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  POST https://auth.tidal.com/v1/oauth2/token              │   │
│     │  grant_type=refresh_token                                 │   │
│     │  refresh_token={refreshToken}                             │   │
│     │  client_id={clientId}                                     │   │
│     │  client_secret={clientSecret}                             │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
│  3. 새 토큰 저장                                                      │
│     ┌───────────────────────────────────────────────────────────┐   │
│     │  tokenInfo.accessToken = newAccessToken;                  │   │
│     │  tokenInfo.expiresAt = Date.now() + (expiresIn * 1000);   │   │
│     │  // refreshToken은 일반적으로 변경 없음                     │   │
│     └───────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.4 Client Credentials vs User Token

```
┌─────────────────────────────────────────────────────────────────────┐
│                    토큰 유형별 사용 시나리오                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Client Credentials Token (공개 데이터용)                             │
│  ─────────────────────────────────────────                          │
│  - 검색 (search)                                                    │
│  - 추천/피처드 플레이리스트 (featured)                                │
│  - 공개 플레이리스트 조회                                             │
│                                                                     │
│  획득 방법:                                                          │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  POST /token                                              │      │
│  │  grant_type=client_credentials                            │      │
│  │  Authorization: Basic {base64(clientId:clientSecret)}     │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  User Token (개인 데이터용)                                           │
│  ─────────────────────────────────────                              │
│  - 사용자 플레이리스트 조회                                           │
│  - 즐겨찾기 조회                                                     │
│  - 세션 정보 조회                                                    │
│  - 플레이리스트 생성/수정                                             │
│                                                                     │
│  획득 방법: OAuth 2.0 PKCE 플로우                                     │
│                                                                     │
│  우선순위:                                                           │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  1. User Token 확인                                       │      │
│  │  2. User Token 없으면 → Client Token 사용 (공개 API만)     │      │
│  │  3. Client Token도 없으면 → 새로 발급                      │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. 보안 고려사항

### 11.1 구현된 보안 기능

| 기능 | 설명 | 구현 위치 |
|------|------|----------|
| **PKCE** | Authorization Code 가로채기 방지 | 프론트엔드/백엔드 |
| **visitorId 세션 격리** | 사용자별 독립 토큰 관리 | 전체 |
| **서버 사이드 토큰 저장** | 토큰 클라이언트 노출 최소화 | 백엔드 |
| **Redis TTL** | 토큰 자동 만료 (30일) | Spring Boot |
| **PKCE TTL** | OAuth 플로우 타임아웃 (10분) | Spring Boot |
| **중복 임포트 방지** | external_id 기반 체크 | 백엔드 |

### 11.2 보안 권장사항

```
┌─────────────────────────────────────────────────────────────────────┐
│                        보안 체크리스트                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ 구현됨:                                                          │
│  □ PKCE (S256 method) 사용                                          │
│  □ HTTPS 강제 (프로덕션)                                             │
│  □ 토큰 서버 사이드 저장                                              │
│  □ visitorId 기반 세션 격리                                          │
│  □ 중복 임포트 방지                                                   │
│                                                                     │
│  ⚠️ 추가 권장:                                                       │
│  □ Rate Limiting (API 요청 제한)                                     │
│  □ IP 기반 접근 제어                                                 │
│  □ 토큰 암호화 (Redis 저장 시)                                        │
│  □ 감사 로그 (연결/해제 이벤트)                                       │
│  □ CORS 화이트리스트 강화                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.3 OAuth Scope 가이드

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Tidal OAuth Scope                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  권장 스코프 (새 Developer Portal):                                   │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  user.read           - 사용자 정보 읽기                    │      │
│  │  playlists.read      - 플레이리스트 읽기                   │      │
│  │  playlists.write     - 플레이리스트 쓰기 (선택)            │      │
│  │  collection.read     - 컬렉션/즐겨찾기 읽기                │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  ⚠️ 주의: 레거시 스코프 (사용 금지)                                   │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  r_usr, w_usr, w_sub  → Error 1002 발생                   │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  최소 권한 원칙:                                                      │
│  - 필요한 스코프만 요청                                               │
│  - 플레이리스트 수정이 불필요하면 playlists.write 제외                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 12. 마이그레이션 현황

### 12.1 Node.js → Spring Boot 마이그레이션

| 기능 | Node.js | Spring Boot | 상태 |
|------|---------|-------------|------|
| OAuth PKCE | ✅ 구현 | ✅ 구현 | 완료 |
| 토큰 저장 | In-Memory | Redis | 개선됨 |
| 플레이리스트 조회 | ✅ 구현 | ✅ 구현 | 완료 |
| 플레이리스트 임포트 | ✅ 구현 | ✅ 구현 | 완료 |
| 검색 | ✅ 구현 | ✅ 구현 | 완료 |
| 추천/피처드 | ✅ 구현 | ✅ 구현 | 완료 |
| Device Code Flow | ✅ 구현 | ✅ 구현 | 완료 |
| Swagger 문서화 | ❌ | ✅ 구현 | Spring Boot만 |

### 12.2 라우팅 전환

```
Vite 프록시 설정 (vite.config.ts):

현재:
┌─────────────────────────────────────────────────────────────────────┐
│  /api/tidal/* → http://localhost:3001 (Node.js) 또는               │
│                 http://localhost:8080 (Spring Boot)                 │
└─────────────────────────────────────────────────────────────────────┘

마이그레이션 완료 후:
┌─────────────────────────────────────────────────────────────────────┐
│  /api/tidal/* → http://localhost:8080 (Spring Boot only)           │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.3 개선 사항 (Spring Boot)

| 항목 | Node.js | Spring Boot | 이점 |
|------|---------|-------------|------|
| 토큰 영속성 | 없음 (재시작 시 손실) | Redis 30일 | 서비스 안정성 |
| 타입 안전성 | JavaScript | Java Generics | 컴파일 타임 오류 검출 |
| 트랜잭션 | 수동 | @Transactional | 데이터 무결성 |
| API 문서 | 없음 | Swagger/OpenAPI | 개발 편의성 |
| 에러 처리 | try-catch | GlobalExceptionHandler | 일관된 응답 |
| 설정 관리 | dotenv | @ConfigurationProperties | 타입 안전 설정 |

---

## 13. 환경 변수

### 13.1 필수 환경 변수

```bash
# Tidal Developer Portal에서 발급
TIDAL_CLIENT_ID=your_client_id
TIDAL_CLIENT_SECRET=your_client_secret

# OAuth 콜백 URL
TIDAL_REDIRECT_URI=http://localhost/tidal-callback
```

### 13.2 Docker Compose 설정

```yaml
# docker-compose.yml
services:
  backend:
    environment:
      - TIDAL_CLIENT_ID=${TIDAL_CLIENT_ID}
      - TIDAL_CLIENT_SECRET=${TIDAL_CLIENT_SECRET}
      - TIDAL_REDIRECT_URI=${TIDAL_REDIRECT_URI:-http://localhost/tidal-callback}
```

### 13.3 Spring Boot 설정 (application.yml)

```yaml
tidal:
  client-id: ${TIDAL_CLIENT_ID:}
  client-secret: ${TIDAL_CLIENT_SECRET:}
  auth-url: https://auth.tidal.com/v1/oauth2
  api-url: https://api.tidal.com/v1
  redirect-uri: ${TIDAL_REDIRECT_URI:http://localhost/tidal-callback}

spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
```

### 13.4 .env.docker 예시

```bash
# .env.docker
TIDAL_CLIENT_ID=abc123
TIDAL_CLIENT_SECRET=secret456
TIDAL_REDIRECT_URI=http://localhost/tidal-callback

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Database
DB_HOST=mariadb
DB_PORT=3306
DB_NAME=music_space_db
```

---

## 14. 파일 위치 참조

### 14.1 프론트엔드

```
humamAppleTeamPreject001/
├── src/
│   ├── services/api/
│   │   └── tidal.ts                      # Tidal API 서비스
│   ├── components/auth/
│   │   └── TidalLoginModal.tsx           # OAuth 로그인 모달
│   ├── pages/
│   │   ├── auth/
│   │   │   └── TidalCallback.tsx         # OAuth 콜백 핸들러
│   │   └── music/
│   │       └── MusicConnections.tsx      # 연동 관리 페이지
│   └── App.tsx                           # 라우트 정의
├── vite.config.ts                        # API 프록시 설정
└── .env                                  # 환경 변수
```

### 14.2 Node.js 백엔드

```
humamAppleTeamPreject001/server/
├── src/
│   ├── routes/
│   │   └── tidal.js                      # Tidal 라우트 (전체 구현)
│   ├── config/
│   │   └── db.js                         # DB 연결 설정
│   └── middleware/
│       └── auth.js                       # 인증 미들웨어
├── index.js                              # Express 앱
└── test_tidal.js                         # 테스트 유틸
```

### 14.3 Spring Boot 백엔드

```
2TeamFinalProject-BE/src/main/java/com/springboot/finalprojcet/
├── domain/tidal/
│   ├── controller/
│   │   └── TidalController.java          # REST 컨트롤러
│   ├── service/
│   │   ├── TidalService.java             # 서비스 인터페이스
│   │   └── impl/
│   │       └── TidalServiceImpl.java     # 서비스 구현
│   ├── store/
│   │   └── TidalTokenStore.java          # Redis 토큰 저장소
│   ├── config/
│   │   └── TidalProperties.java          # 환경 설정
│   └── dto/                              # 14개 DTO
│       ├── TidalLoginUrlResponse.java
│       ├── TidalExchangeRequest.java
│       ├── TidalExchangeResponse.java
│       ├── TidalAuthStatusResponse.java
│       ├── TidalPlaylistResponse.java
│       ├── TidalImportRequest.java
│       ├── TidalImportResponse.java
│       ├── TidalSyncRequest.java
│       ├── TidalSyncResponse.java
│       ├── TidalDeviceAuthResponse.java
│       ├── TidalTokenPollRequest.java
│       ├── TidalTokenPollResponse.java
│       ├── TidalSearchResponse.java
│       └── TidalFeaturedResponse.java
├── entity/
│   ├── Playlists.java
│   ├── Tracks.java
│   └── PlaylistTracks.java
└── config/
    ├── RedisConfig.java
    └── RestTemplateConfig.java

2TeamFinalProject-BE/src/main/resources/
└── application.yml                       # Spring Boot 설정
```

### 14.4 설정 파일

```
프로젝트 루트/
├── humamAppleTeamPreject001/
│   ├── docker-compose.yml                # 전체 서비스 오케스트레이션
│   ├── .env.docker                       # Docker 환경 변수
│   └── vite.config.ts                    # 프론트엔드 빌드 & 프록시
└── 2TeamFinalProject-BE/
    ├── docker-compose.yml                # Spring Boot 서비스
    ├── Dockerfile                        # 멀티스테이지 빌드
    └── build.gradle                      # Gradle 의존성
```

---

## 부록: 트러블슈팅

### A.1 일반적인 오류

| 오류 | 원인 | 해결 |
|------|------|------|
| Error 1002 | 잘못된 스코프 (r_usr/w_usr) | 새 스코프 사용 (user.read 등) |
| PKCE verifier not found | Redis 만료 또는 visitorId 불일치 | 다시 로그인 시도 |
| 401 Unauthorized | 토큰 만료 | 토큰 갱신 또는 재로그인 |
| CORS error | Origin 헤더 불일치 | 프록시 설정 확인 |

### A.2 디버깅 팁

```javascript
// 프론트엔드: visitorId 확인
console.log('visitorId:', localStorage.getItem('tidal_visitor_id'));

// 프론트엔드: 토큰 확인
console.log('accessToken:', localStorage.getItem('tidal_access_token'));

// 백엔드 (Node.js): 토큰 상태 확인
console.log('visitorTokens:', Object.keys(visitorTokens));

// 백엔드 (Spring Boot): Redis 확인
redis-cli KEYS "tidal:*"
redis-cli GET "tidal:token:visitor_xxx"
```

---

## 부록B: Tidal API 응답 데이터 구조

### B.1 Tidal API 버전

| API 버전 | Base URL | 인증 | 특징 |
|----------|----------|------|------|
| v1 | `https://api.tidal.com/v1/` | Bearer Token | 레거시, `r_usr` scope 필요 (현재 403 에러) |
| v2 | `https://openapi.tidal.com/v2/` | Bearer Token + Client-Id 헤더 | JSON:API 형식, 현재 사용 |

### B.2 v2 플레이리스트 조회 응답

**엔드포인트**: `GET /v2/playlists/{playlistId}?countryCode={cc}&include=coverArt`

```json
{
  "data": {
    "id": "21561405-9428-4205-b936-d0203876fa7c",
    "type": "playlists",
    "attributes": {
      "name": "My Favor_001",
      "description": "",
      "bounded": true,
      "duration": "PT20H29M17S",
      "numberOfItems": 289,
      "externalLinks": [
        {
          "href": "https://listen.tidal.com/playlist/21561405-9428-4205-b936-d0203876fa7c",
          "meta": { "type": "TIDAL_SHARING" }
        }
      ]
    }
  },
  "included": [
    {
      "id": "2b7Vtuqr0FkAs1v4655u21UZxDQZbN959ifNswgbDxlwwYsU9Bl9FXCfz",
      "type": "artworks",
      "attributes": {
        "mediaType": "IMAGE",
        "files": [
          {
            "href": "https://resources.tidal.com/images/925f6e2a/2bd6/4634/8c2e/045abfd06d67/160x160.jpg",
            "meta": { "width": 160, "height": 160 }
          },
          {
            "href": "https://resources.tidal.com/images/925f6e2a/2bd6/4634/8c2e/045abfd06d67/320x320.jpg",
            "meta": { "width": 320, "height": 320 }
          },
          {
            "href": "https://resources.tidal.com/images/925f6e2a/2bd6/4634/8c2e/045abfd06d67/480x480.jpg",
            "meta": { "width": 480, "height": 480 }
          },
          {
            "href": "https://resources.tidal.com/images/925f6e2a/2bd6/4634/8c2e/045abfd06d67/1080x1080.jpg",
            "meta": { "width": 1080, "height": 1080 }
          }
        ],
        "visualMetadata": {
          "selectedPaletteColor": "#946941",
          "blurHash": "UbMZ,g=xxaNG_N00WAxu.8NGaexurXs;IoX7",
          "status": "OK"
        }
      },
      "relationships": {
        "owners": {
          "links": {
            "self": "/artworks/.../relationships/owners?countryCode=AR"
          }
        }
      }
    }
  ]
}
```

**중요 포인트**:
- `included[].type === "artworks"` 로 coverArt 데이터 식별
- 이미지 URL은 `included[].attributes.files[].href`에 존재
- 320x320 사이즈 이미지를 우선 사용

### B.3 v2 플레이리스트 트랙 조회 응답

**엔드포인트**: `GET /v2/playlists/{playlistId}/relationships/items?countryCode={cc}&include=items`

```json
{
  "data": [
    {
      "id": "123456789",
      "type": "playlistItems",
      "meta": { "addedAt": "2024-01-01T00:00:00Z" }
    }
  ],
  "included": [
    {
      "id": "123456789",
      "type": "tracks",
      "attributes": {
        "title": "Track Title",
        "duration": "PT3M45S",
        "explicit": false,
        "isrc": "USKPK1234567",
        "popularity": 75
      },
      "relationships": {
        "albums": {
          "data": [{ "id": "987654321", "type": "albums" }]
        },
        "artists": {
          "data": [{ "id": "111222333", "type": "artists" }]
        }
      }
    }
  ]
}
```

**문제점**: v2 트랙 응답에는 앨범 커버 이미지가 직접 포함되지 않음 → 별도 앨범 API 호출 필요

### B.4 v1 플레이리스트 트랙 조회 응답

**엔드포인트**: `GET /v1/playlists/{playlistId}/items?countryCode={cc}&limit=100&offset=0`

```json
{
  "limit": 100,
  "offset": 0,
  "totalNumberOfItems": 289,
  "items": [
    {
      "item": {
        "id": 123456789,
        "title": "Track Title",
        "duration": 225,
        "album": {
          "id": 987654321,
          "title": "Album Title",
          "cover": "925f6e2a-2bd6-4634-8c2e-045abfd06d67"  // UUID 형식!
        },
        "artist": {
          "id": 111222333,
          "name": "Artist Name"
        },
        "artists": [
          { "id": 111222333, "name": "Artist Name" }
        ]
      },
      "type": "track",
      "cut": null
    }
  ]
}
```

**중요 포인트**:
- `items[].item.album.cover` 값이 UUID 형식 (하이픈 포함)
- 이미지 URL 변환: `https://resources.tidal.com/images/{cover.replace('-', '/')}/320x320.jpg`
- 예: `925f6e2a-2bd6-4634-8c2e-045abfd06d67` → `https://resources.tidal.com/images/925f6e2a/2bd6/4634/8c2e/045abfd06d67/320x320.jpg`

### B.5 이미지 URL 변환 함수

```java
// Java (TidalServiceImpl.java)
private String tidalImageUrl(String uuidOrUrl) {
    if (uuidOrUrl == null || uuidOrUrl.isEmpty()) return null;
    if (uuidOrUrl.startsWith("http")) return uuidOrUrl;
    // UUID를 URL 경로로 변환: 하이픈 → 슬래시
    return "https://resources.tidal.com/images/"
         + uuidOrUrl.replace("-", "/")
         + "/320x320.jpg";
}
```

```javascript
// JavaScript (Node.js)
function tidalImageUrl(uuidOrUrl) {
    if (!uuidOrUrl) return null;
    if (uuidOrUrl.startsWith('http')) return uuidOrUrl;
    return `https://resources.tidal.com/images/${uuidOrUrl.replace(/-/g, '/')}/320x320.jpg`;
}
```

### B.6 데이터 추출 우선순위

#### 플레이리스트 커버 이미지
1. `included[type=artworks].attributes.files[]` (v2 API) - 320x320 우선
2. `squareImage` 필드 (v1 API)
3. `image` 필드
4. `picture` 필드
5. `imageLinks[]` 배열
6. 첫 번째 트랙의 앨범 커버 (fallback)

#### 트랙 앨범 커버
1. `item.album.cover` (v1 API) - UUID를 URL로 변환
2. `attributes.relationships.albums` → 별도 앨범 API 호출 (v2 API)

---

*문서 최종 업데이트: 2026년 2월*

## TODO
1. 회원가입시 회원이 타이달 체크하면 연동해서 플레이리스트가져오고 PMS에 저장하고 음악들을때 타이달 고음질 우선으로 듣는다.
2. Connections 페이지에서 연동하면 회원가입시와 마찬가지 일을 한다. 플레이리스트 출력이 된다. ---> 이거 완벽하게 완성해야해
node.js는 스프링 부트로 포팅할거야