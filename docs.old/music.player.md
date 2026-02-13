# Music Player 기술 문서

> **핵심 요구사항**: 타이달이랑 유튜브 연동 프로그램되어 있어. 모든 음악은 타이달에서 고음질로 재생하는걸 기본으로 하고 타이달에 없는 음악인 경우만 유튜브로 재생

---

## 1. 개요

### 1.1 재생 우선순위
| 순위 | 소스 | 조건 | 품질 |
|------|------|------|------|
| 1 | **Tidal HLS** | tidalId 존재 + Tidal 로그인 | LOSSLESS (무손실) |
| 2 | **Tidal Search** | tidalId 없이 artist+title로 Tidal 검색 | LOSSLESS (무손실) |
| 3 | **YouTube (저장됨)** | externalMetadata.youtubeId 존재 | 가변 |
| 4 | **YouTube URL** | track.url에 youtube.com 포함 | 가변 |
| 5 | **YouTube Smart Match** | artist+title로 YouTube 실시간 검색 | 가변 |
| 6 | **iTunes Preview (저장됨)** | externalMetadata.previewUrl 존재 | 256kbps (30초) |
| 7 | **iTunes URL** | track.url에 audio-ssl.itunes 포함 | 256kbps (30초) |
| 8 | **iTunes Smart Match** | artist+title로 iTunes API 실시간 검색 | 256kbps (30초) |
| — | **자동 다음 곡 이동** | 모든 소스 실패 시 큐의 다음 트랙으로 자동 skip | — |

### 1.2 기술 스택
- **hls.js**: Tidal HLS 스트리밍 (m3u8 매니페스트 파싱)
- **react-player**: YouTube/일반 미디어 재생
- **React Context**: 전역 상태 관리
- **Tailwind CSS**: 반응형 UI

---

## 2. 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     MusicContext.tsx                        │
│  (전역 상태: currentTrack, queue, shuffle, repeat)          │
└────────────────────────┬────────────────────────────────────┘
                         │ playTrack()
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    AudioService.ts                          │
│  resolveAndPlay(track) → 소스 우선순위에 따라 URL 결정       │
└─────────┬─────────────────────────┬─────────────────────────┘
          │                         │
          │ TIDAL                   │ YOUTUBE/ITUNES
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────────────┐
│ TidalPlayerAdapter  │   │         ReactPlayer             │
│ (HLS.js + Audio)    │   │  (숨겨진 iframe 플레이어)        │
└─────────────────────┘   └─────────────────────────────────┘
          │                         │
          └────────────┬────────────┘
                       ▼
            ┌─────────────────────┐
            │   MusicPlayer.tsx   │
            │  (반응형 UI)         │
            └─────────────────────┘
```

---

## 3. 핵심 파일

| 파일 | 경로 | 역할 |
|------|------|------|
| MusicContext | `src/context/MusicContext.tsx` | 전역 상태 (큐, 셔플, 반복) |
| AudioService | `src/services/audio/AudioService.ts` | URL 해석, 재생 제어 |
| TidalPlayerAdapter | `src/services/audio/TidalPlayerAdapter.tsx` | Tidal HLS 재생 |
| MusicPlayer | `src/components/music/MusicPlayer.tsx` | 반응형 플레이어 UI |

---

## 4. Tidal HLS 스트리밍

### 4.1 흐름
```
1. tidalApi.getStreamUrl(trackId, 'LOSSLESS')
2. 백엔드 → Tidal API (/v1/tracks/{id}/playbackinfo)
3. HLS URL(m3u8) 또는 직접 URL 반환
4. hls.js로 재생 (Safari는 네이티브 HLS)
```

### 4.2 품질 옵션
| 품질 | 설명 |
|------|------|
| LOSSLESS | 무손실 FLAC (~1411 kbps) - **기본값** |
| HIGH | 320 kbps |
| HI_RES_LOSSLESS | 고해상도 무손실 (~9216 kbps) |

### 4.3 에러 복구
```typescript
hls.on(Hls.Events.ERROR, (event, data) => {
    if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()  // 재시도
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()  // 복구
        }
    }
})
```

---

## 5. 폴백 로직

Tidal 재생 실패 시 순차적으로 폴백:

```typescript
// AudioService.resolveAndPlay()

// 1. Tidal HLS 시도 (로그인 + tidalId + playback scope)
if (tidalVisitorId && tidalId) {
    const success = await tidalPlayer.loadAndPlay(tidalId)
    if (success) return 'TIDAL_INTERNAL'
}

// 2. 저장된 iTunes Preview URL
if (parsedMetadata.previewUrl) return previewUrl

// 3. 저장된 YouTube ID
if (parsedMetadata.youtubeId) return youtubeUrl

// 4. iTunes 실시간 검색 (항상 작동, 30초 프리뷰)
const itunesResults = await itunesService.search(`${track.artist} ${track.title}`)
if (itunesResults[0]?.previewUrl) return itunesResults[0].previewUrl

// 5. YouTube 실시간 검색 (할당량 제한 있음)
const youtubeResults = await youtubeApi.searchVideos(query, 1)
if (youtubeResults.playlists[0]) return youtubeUrl
```

### 5.1 Tidal OAuth Scope

스트리밍을 위해 필요한 scope:
```
user.read playlists.read playlists.write collection.read playback
```

> **주의**: `playback` scope가 없으면 스트리밍 API 접근이 거부됩니다 (403).

---

## 6. 반응형 UI

### 6.1 브레이크포인트

| 크기 | 뷰포트 | 레이아웃 |
|------|--------|----------|
| **xs** | < 640px | 미니바 + 풀스크린 확장 |
| **sm** | 640px+ | 미니바 (더 큰 버튼) |
| **lg** | 1024px+ | 데스크톱 3단 레이아웃 |
| **xl** | 1280px+ | 넓은 간격 |

### 6.2 모바일 뷰 (< 1024px)

```
┌─────────────────────────────────────────┐
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ (프로그레스 바)        │
├─────────────────────────────────────────┤
│ [앨범] 제목 / 아티스트  [◀][▶][▶▶] [↑] │
└─────────────────────────────────────────┘

↑ 탭하면 풀스크린 확장:

┌─────────────────────────────────────────┐
│ [↓]        Now Playing           [목록] │
│                                         │
│           ┌─────────────┐               │
│           │             │               │
│           │  앨범 아트   │               │
│           │             │               │
│           └─────────────┘               │
│              [TIDAL]                    │
│           트랙 제목                      │
│           아티스트                       │
│                                         │
│    ▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬                  │
│    0:00              3:45              │
│                                         │
│    [🔀]  [◀◀]  [▶]  [▶▶]  [🔁]         │
│                                         │
│    🔊 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  ♡             │
└─────────────────────────────────────────┘
```

### 6.3 데스크톱 뷰 (1024px+)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [앨범] 제목        [🔀][◀◀][▶][▶▶][🔁]        [TIDAL] [♡] 🔊 ▬▬▬▬▬   │
│        아티스트    0:00 ▬▬▬●▬▬▬▬▬▬▬ 3:45                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.4 소스 배지 색상

| 소스 | 색상 | 클래스 |
|------|------|--------|
| TIDAL | 시안 | `bg-cyan-500/20 text-cyan-400` |
| YouTube | 빨강 | `bg-red-500/20 text-red-400` |
| Preview | 핑크 | `bg-pink-500/20 text-pink-400` |
| Local | 회색 | `bg-gray-500/20 text-gray-400` |

### 6.5 인터랙션

| 기능 | 동작 |
|------|------|
| 프로그레스 드래그 | 마우스 드래그로 시크 |
| 호버 노브 | 프로그레스/볼륨 바에 호버 시 노브 표시 |
| 좋아요 | Heart 아이콘 토글 |
| 에러 토스트 | 하단 중앙에 에러 메시지 |

---

## 7. 구현 상태

### 완료
- [x] hls.js 패키지 설치
- [x] TidalPlayerAdapter HLS 재생 구현
- [x] 에러 복구 로직
- [x] 폴백 (Tidal → iTunes → YouTube)
- [x] AudioService와 TidalPlayerAdapter 연동
- [x] 반응형 UI (모바일/태블릿/데스크톱)
- [x] 프로그레스 바 드래그
- [x] 소스별 색상 배지
- [x] 에러 토스트
- [x] iTunes 실시간 검색 폴백 추가
- [x] Tidal OAuth scope에 `playback` 추가

### 테스트 필요
- [ ] Tidal 재연결 후 스트림 테스트 (playback scope 적용)
- [ ] HLS 에러 복구 테스트
- [ ] Safari 네이티브 HLS 테스트
- [ ] iTunes 폴백 동작 테스트

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-05 | 초기 문서 작성, HLS.js 기반 Tidal 스트리밍 구현 |
| 2026-02-05 | 반응형 UI 구현 (모바일 풀스크린, 데스크톱 3단) |
| 2026-02-05 | AudioService-TidalPlayerAdapter 연동 완료 |
| 2026-02-05 | iTunes 실시간 검색 폴백 추가 |
| 2026-02-05 | Tidal OAuth scope에 `playback` 추가 (스트리밍 권한) |
| 2026-02-11 | 재생 우선순위 변경: Tidal → YouTube → iTunes (YouTube를 iTunes보다 우선) |
| 2026-02-11 | 소스 없을 시 자동 다음 곡 skip 기능 추가 (MusicContext queueRef 패턴) |
