# EMS (Explore Music Space) API Documentation

사용자의 탐색 공간(EMS) 데이터를 조회하고 ML 학습용으로 내보내는 API

## Base URL

### 로컬 접속
```
http://localhost:3001/api/ems
```

### 외부 접속 (ngrok)
```
https://homological-ashlyn-supercrowned.ngrok-free.dev/api/ems
```

---

## 1. EMS 플레이리스트 목록 조회

사용자의 EMS 공간에 있는 플레이리스트 목록을 조회합니다.

### Request
```
GET /api/ems/playlists?userId=1
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | O | 사용자 ID (토큰 인증 시 자동 추출) |
| limit | query | X | 조회 개수 (default: 50) |
| offset | query | X | 시작 위치 (default: 0) |

### Response
```json
{
  "playlists": [
    {
      "playlistId": 1,
      "title": "K-Pop Favorites",
      "description": "좋아하는 K-Pop 모음",
      "status": "PTP",
      "sourceType": "Platform",
      "externalId": "tidal_12345",
      "coverImage": "https://resources.tidal.com/images/...",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "trackCount": 25,
      "aiScore": 85.5
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

---

## 2. EMS 트랙 목록 조회

EMS 공간의 모든 트랙을 조회합니다.

### Request
```
GET /api/ems/tracks?userId=1&includeFeatures=true
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | O | 사용자 ID |
| limit | query | X | 조회 개수 (default: 100) |
| offset | query | X | 시작 위치 (default: 0) |
| includeFeatures | query | X | 오디오 특성 포함 여부 (default: false) |

### Response
```json
{
  "tracks": [
    {
      "trackId": 101,
      "title": "Dynamite",
      "artist": "BTS",
      "album": "BE",
      "duration": 199,
      "isrc": "USRC12345678",
      "genre": "k-pop, pop",
      "playlistId": 1,
      "playlistTitle": "K-Pop Favorites",
      "aiScore": 92.0,
      "userRating": 1,
      "audioFeatures": {
        "tempo": 114.0,
        "energy": 0.78,
        "danceability": 0.75,
        "valence": 0.95
      }
    }
  ],
  "total": 250,
  "limit": 100,
  "offset": 0
}
```

---

## 3. EMS 통계 조회

EMS 공간의 통계 정보를 조회합니다.

### Request
```
GET /api/ems/stats?userId=1
```

### Response
```json
{
  "userId": 1,
  "spaceType": "EMS",
  "stats": {
    "playlists": 15,
    "tracks": 250,
    "artists": 45,
    "totalDurationSeconds": 54000,
    "totalDurationFormatted": "15:00:00"
  },
  "topArtists": [
    { "artist": "BTS", "trackCount": 25 },
    { "artist": "NewJeans", "trackCount": 18 },
    { "artist": "IVE", "trackCount": 12 }
  ],
  "genreDistribution": [
    { "genre": "k-pop", "trackCount": 120 },
    { "genre": "pop", "trackCount": 80 },
    { "genre": "r&b", "trackCount": 30 }
  ],
  "sourceDistribution": [
    { "sourceType": "Platform", "playlistCount": 12, "trackCount": 200 },
    { "sourceType": "Upload", "playlistCount": 3, "trackCount": 50 }
  ],
  "ratingStats": {
    "total": 100,
    "likes": 75,
    "dislikes": 25
  }
}
```

---

## 4. EMS 데이터 내보내기 (ML 학습용)

EMS 데이터를 ML 학습에 적합한 형식으로 내보냅니다.

### Request
```
GET /api/ems/export?userId=1&format=json
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | O | 사용자 ID |
| format | query | X | 출력 형식: `json` (default) 또는 `csv` |

### Response (JSON)
```json
{
  "userId": 1,
  "spaceType": "EMS",
  "totalRecords": 250,
  "exportedAt": "2024-01-20T15:00:00.000Z",
  "data": [
    {
      "userId": 1,
      "playlistId": 1,
      "playlistTitle": "K-Pop Favorites",
      "sourceType": "Platform",
      "trackId": 101,
      "trackTitle": "Dynamite",
      "artist": "BTS",
      "album": "BE",
      "duration": 199,
      "isrc": "USRC12345678",
      "genre": "k-pop, pop",
      "orderIndex": 0,
      "userRating": 1,
      "trackScore": 92.0,
      "playlistScore": 85.5,
      "audioFeatures": {
        "tempo": 114.0,
        "energy": 0.78,
        "danceability": 0.75
      }
    }
  ]
}
```

### CSV 형식 요청
```
GET /api/ems/export?userId=1&format=csv
```

CSV 파일이 다운로드됩니다.

---

## 5. EMS 기반 추천 트랙

사용자의 EMS 데이터를 기반으로 추천 트랙을 제공합니다.

### Request
```
GET /api/ems/recommendations?userId=1&limit=20
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | O | 사용자 ID |
| limit | query | X | 추천 개수 (default: 20) |

### Response
```json
{
  "userId": 1,
  "recommendations": [
    {
      "trackId": 150,
      "title": "Super Shy",
      "artist": "NewJeans",
      "album": "Get Up",
      "duration": 180,
      "genre": "k-pop",
      "recommendReason": "liked_artist"
    },
    {
      "trackId": 200,
      "title": "Love Dive",
      "artist": "IVE",
      "album": "LOVE DIVE",
      "duration": 192,
      "genre": "k-pop",
      "recommendReason": "high_score",
      "aiScore": 88.5
    }
  ],
  "total": 20
}
```

### 추천 이유 (recommendReason)
| 값 | 설명 |
|----|------|
| liked_artist | 사용자가 좋아요한 아티스트의 다른 트랙 |
| high_score | AI 점수가 높은 트랙 |

---

## 데이터 스키마 참조

### Status Flag (상태 플래그)
| 값 | 설명 |
|----|------|
| PTP | Personal Temporary Playlist - 임시 |
| PRP | Personal Regular Playlist - 정규 |
| PFP | Personal Filtered Playlist - 필터링됨 |

### Source Type (소스 유형)
| 값 | 설명 |
|----|------|
| Platform | 외부 스트리밍 플랫폼 (Tidal, YouTube, Apple Music) |
| Upload | 사용자 직접 업로드 |
| System | 시스템 자동 생성 |

---

## 활용 예시

### Python에서 EMS 데이터 가져오기
```python
import requests
import pandas as pd

BASE_URL = 'http://localhost:3001'
USER_ID = 1

# EMS 통계 조회
stats = requests.get(f'{BASE_URL}/api/ems/stats?userId={USER_ID}').json()
print(f"플레이리스트: {stats['stats']['playlists']}개")
print(f"트랙: {stats['stats']['tracks']}개")
print(f"총 재생시간: {stats['stats']['totalDurationFormatted']}")

# EMS 데이터 내보내기
response = requests.get(f'{BASE_URL}/api/ems/export?userId={USER_ID}')
data = response.json()
df = pd.DataFrame(data['data'])

print(f"총 {len(df)}개 레코드")
print(df.head())
```

### CSV로 직접 가져오기
```python
import pandas as pd

BASE_URL = 'http://localhost:3001'
df = pd.read_csv(f'{BASE_URL}/api/ems/export?userId=1&format=csv')
print(df.head())
```

### 추천 트랙 가져오기
```python
import requests

BASE_URL = 'http://localhost:3001'
USER_ID = 1

recommendations = requests.get(
    f'{BASE_URL}/api/ems/recommendations?userId={USER_ID}&limit=10'
).json()

print(f"추천 트랙 {recommendations['total']}개:")
for track in recommendations['recommendations']:
    print(f"- {track['title']} by {track['artist']} ({track['recommendReason']})")
```

### EMS 데이터로 ML 모델 학습
```python
import requests
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

BASE_URL = 'http://localhost:3001'

# EMS 데이터 가져오기
response = requests.get(f'{BASE_URL}/api/ems/export?userId=1')
data = response.json()
df = pd.DataFrame(data['data'])

# 오디오 특성 펼치기
if 'audioFeatures' in df.columns:
    features_df = pd.json_normalize(df['audioFeatures'].dropna())
    df = df.drop('audioFeatures', axis=1).join(features_df)

# 특성 선택
feature_cols = ['tempo', 'energy', 'danceability', 'valence', 'duration']
X = df[feature_cols].fillna(0)
y = df['userRating'].apply(lambda x: 1 if x >= 0 else 0)

# 학습
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)

print(f"모델 정확도: {model.score(X_test, y_test):.2%}")
```

---

## Training API와 차이점

| 구분 | EMS API | Training API |
|------|---------|--------------|
| 범위 | EMS 공간만 | 모든 공간 (EMS, GMS, PMS) |
| 용도 | EMS 데이터 조회 및 추천 | 전체 학습 데이터 수집 |
| 추천 | O (recommendations 엔드포인트) | X |
| 통계 | EMS 전용 통계 | 전체 특성 추출 |

EMS 데이터만 필요한 경우 이 API를 사용하고, 전체 데이터가 필요한 경우 Training API를 사용하세요.

---

## 6. 개별 플레이리스트 내보내기

특정 플레이리스트의 트랙 데이터를 내보냅니다.

### Request
```
GET /api/ems/playlist/:playlistId/export?format=csv
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| playlistId | path | O | 플레이리스트 ID |
| format | query | X | 출력 형식: `json` (default) 또는 `csv` |

### Response (JSON)
```json
{
  "playlistId": 1,
  "playlistTitle": "K-Pop Favorites",
  "totalTracks": 25,
  "exportedAt": "2024-01-20T15:00:00.000Z",
  "data": [
    {
      "trackId": 101,
      "title": "Dynamite",
      "artist": "BTS",
      "album": "BE",
      "duration": 199,
      "isrc": "USRC12345678",
      "genre": "k-pop, pop",
      "tags": "korean, dance, upbeat",
      "orderIndex": 0,
      "userRating": 1,
      "trackScore": 92.0
    }
  ]
}
```

### CSV 다운로드
```
GET /api/ems/playlist/1/export?format=csv
```

파일명: `playlist_{playlistId}_{title}.csv`

---

## 7. 플레이리스트 CSV 링크 목록

사용자의 모든 EMS 플레이리스트에 대한 CSV/JSON 다운로드 링크를 제공합니다.

### Request
```
GET /api/ems/playlists/links?userId=1
```

### Response
```json
{
  "userId": 1,
  "total": 15,
  "playlists": [
    {
      "playlistId": 1,
      "title": "K-Pop Favorites",
      "trackCount": 25,
      "csvUrl": "http://localhost:3001/api/ems/playlist/1/export?format=csv",
      "jsonUrl": "http://localhost:3001/api/ems/playlist/1/export?format=json"
    },
    {
      "playlistId": 2,
      "title": "Chill Vibes",
      "trackCount": 18,
      "csvUrl": "http://localhost:3001/api/ems/playlist/2/export?format=csv",
      "jsonUrl": "http://localhost:3001/api/ems/playlist/2/export?format=json"
    }
  ]
}
```

### Python에서 모든 플레이리스트 CSV 다운로드
```python
import requests
import os

BASE_URL = 'http://localhost:3001'
USER_ID = 1
OUTPUT_DIR = './ems_data'

os.makedirs(OUTPUT_DIR, exist_ok=True)

# 플레이리스트 링크 가져오기
links = requests.get(f'{BASE_URL}/api/ems/playlists/links?userId={USER_ID}').json()

print(f"총 {links['total']}개 플레이리스트 다운로드 시작...")

for playlist in links['playlists']:
    csv_response = requests.get(playlist['csvUrl'])
    filename = f"{OUTPUT_DIR}/playlist_{playlist['playlistId']}_{playlist['title'][:20]}.csv"
    
    with open(filename, 'wb') as f:
        f.write(csv_response.content)
    
    print(f"✓ {playlist['title']} ({playlist['trackCount']} tracks)")

print("다운로드 완료!")
```

---

## 추가 DB 스키마

EMS API가 사용하는 추가 테이블입니다.

### user_track_ratings (사용자 트랙 평가)
```sql
CREATE TABLE user_track_ratings (
    rating_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    rating TINYINT NOT NULL,  -- 1: 좋아요, -1: 싫어요, 0: 중립
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (user_id, track_id)
);
```

### track_scored_id (트랙 AI 점수)
```sql
CREATE TABLE track_scored_id (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    track_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    ai_score DECIMAL(5,2) DEFAULT 0.00,  -- 0-100
    score_type VARCHAR(50) DEFAULT 'general',
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (track_id, user_id)
);
```

### playlist_scored_id (플레이리스트 AI 점수)
```sql
CREATE TABLE playlist_scored_id (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    playlist_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    ai_score DECIMAL(5,2) DEFAULT 0.00,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (playlist_id, user_id)
);
```

### tracks 테이블 추가 컬럼
```sql
ALTER TABLE tracks
    ADD COLUMN genre VARCHAR(255) DEFAULT NULL,
    ADD COLUMN audio_features JSON DEFAULT NULL;
```

---

## 엔드포인트 요약

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/ems/playlists` | EMS 플레이리스트 목록 |
| GET | `/api/ems/tracks` | EMS 트랙 목록 |
| GET | `/api/ems/stats` | EMS 통계 정보 |
| GET | `/api/ems/export` | 전체 데이터 내보내기 (JSON/CSV) |
| GET | `/api/ems/recommendations` | AI 추천 트랙 |
| GET | `/api/ems/playlist/:id/export` | 개별 플레이리스트 내보내기 |
| GET | `/api/ems/playlists/links` | 플레이리스트 다운로드 링크 목록 |
