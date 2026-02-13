# Training API Documentation

ML 모델 학습을 위한 사용자 플레이리스트 및 트랙 데이터 API

## Base URL

### 로컬 접속
```
http://localhost:3001/api/training
```

### 외부 접속 (ngrok)
```
https://homological-ashlyn-supercrowned.ngrok-free.dev/api/training
```
> ⚠️ ngrok 무료 버전은 세션 재시작 시 URL이 변경됩니다.

---

## 1. 사용자 학습 데이터 조회

특정 사용자의 플레이리스트와 트랙 정보를 조회합니다.

### Request
```
GET /api/training/user/:userId/data
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | path | O | 사용자 ID |
| includeMetadata | query | X | 외부 메타데이터 포함 여부 (default: true) |

### Response
```json
{
  "userId": 1,
  "totalPlaylists": 5,
  "totalTracks": 120,
  "data": [
    {
      "playlistId": 1,
      "playlistTitle": "My Favorites",
      "description": "좋아하는 곡 모음",
      "spaceType": "EMS",
      "status": "PTP",
      "sourceType": "Platform",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "trackCount": 25,
      "tracks": [
        {
          "trackId": 101,
          "title": "Song Title",
          "artist": "Artist Name",
          "album": "Album Name",
          "duration": 240,
          "isrc": "USRC12345678",
          "orderIndex": 0,
          "addedAt": "2024-01-15T10:35:00.000Z",
          "externalMetadata": {
            "tidalId": "12345",
            "youtubeId": "abc123"
          }
        }
      ]
    }
  ]
}
```

---

## 2. 학습 데이터 내보내기

전체 또는 특정 사용자의 학습 데이터를 JSON 또는 CSV 형식으로 내보냅니다.

### Request
```
GET /api/training/export
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| format | query | X | 출력 형식: `json` (default) 또는 `csv` |
| userId | query | X | 특정 사용자만 필터링 |

### Response (JSON)
```json
{
  "totalRecords": 500,
  "exportedAt": "2024-01-20T15:00:00.000Z",
  "data": [
    {
      "userId": 1,
      "playlistId": 1,
      "playlistTitle": "My Favorites",
      "spaceType": "EMS",
      "status": "PTP",
      "sourceType": "Platform",
      "trackId": 101,
      "trackTitle": "Song Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration": 240,
      "isrc": "USRC12345678",
      "orderIndex": 0,
      "trackScore": 85.5,
      "playlistScore": 78.0,
      "externalMetadata": {}
    }
  ]
}
```

### Response (CSV)
```csv
userId,playlistId,playlistTitle,spaceType,status,sourceType,trackId,trackTitle,artist,album,duration,isrc,orderIndex,trackScore,playlistScore
1,1,My Favorites,EMS,PTP,Platform,101,Song Title,Artist Name,Album Name,240,USRC12345678,0,85.5,78.0
```

---

## 3. 특성(Feature) 추출

ML 모델 학습에 사용할 특성 데이터를 추출합니다.

### Request
```
GET /api/training/features
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | X | 특정 사용자만 필터링 |

### Response
```json
{
  "userId": 1,
  "extractedAt": "2024-01-20T15:00:00.000Z",
  "features": {
    "topArtists": [
      { "artist": "BTS", "frequency": 45, "playlistCount": 8 },
      { "artist": "NewJeans", "frequency": 32, "playlistCount": 6 }
    ],
    "topAlbums": [
      { "album": "Love Yourself", "artist": "BTS", "frequency": 12 },
      { "album": "OMG", "artist": "NewJeans", "frequency": 8 }
    ],
    "spaceTypeDistribution": [
      { "spaceType": "EMS", "playlistCount": 15, "trackCount": 350 },
      { "spaceType": "GMS", "playlistCount": 5, "trackCount": 100 },
      { "spaceType": "PMS", "playlistCount": 3, "trackCount": 50 }
    ],
    "sourceTypeDistribution": [
      { "sourceType": "Platform", "playlistCount": 18, "trackCount": 420 },
      { "sourceType": "Upload", "playlistCount": 5, "trackCount": 80 }
    ],
    "durationStats": {
      "avgSeconds": 215,
      "minSeconds": 120,
      "maxSeconds": 480,
      "totalSeconds": 108000
    }
  }
}
```

---

## 4. 사용자 상호작용 데이터

추천 시스템 학습을 위한 사용자-트랙 상호작용 데이터를 조회합니다.

### Request
```
GET /api/training/interactions
```

### Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| userId | query | X | 특정 사용자만 필터링 |
| limit | query | X | 최대 레코드 수 (default: 1000) |

### Response
```json
{
  "totalInteractions": 500,
  "data": [
    {
      "userId": 1,
      "trackId": 101,
      "artist": "Artist Name",
      "album": "Album Name",
      "interaction": 1,
      "timestamp": "2024-01-15T10:35:00.000Z"
    }
  ]
}
```

---

## 5. AI 점수 저장

ML 모델 학습 결과로 생성된 점수를 저장합니다.

### Request
```
POST /api/training/score
```

### Body
```json
{
  "userId": 1,
  "scores": [
    {
      "type": "playlist",
      "playlistId": 5,
      "score": 85.5
    },
    {
      "type": "track",
      "trackId": 101,
      "score": 92.0
    }
  ]
}
```

### Response
```json
{
  "message": "Scores saved",
  "playlistUpdated": 1,
  "trackUpdated": 1
}
```

---

## 데이터 스키마 참조

### Space Type (공간 유형)
| 값 | 설명 |
|----|------|
| EMS | Explore Music Space - 탐색 공간 |
| GMS | Growth Music Space - 성장 공간 |
| PMS | Personal Music Space - 개인 공간 |

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

## 6. 오디오 특성 수집 (Spotify)

Spotify API를 통해 트랙의 오디오 특성을 수집합니다.

### 수집 현황 조회
```
GET /api/training/features-status
```

### Response
```json
{
  "total": 440,
  "withAudioFeatures": 100,
  "withGenre": 95,
  "missingFeatures": 340
}
```

### 오디오 특성 수집 실행
```
POST /api/training/collect-features
```

### Body
```json
{
  "trackIds": [1, 2, 3],  // 선택적: 특정 트랙만 수집
  "limit": 50            // trackIds 없을 시 최대 수집 개수
}
```

### Response
```json
{
  "message": "Feature collection completed",
  "processed": 50,
  "success": 45,
  "failed": 5,
  "errors": [
    { "trackId": 10, "isrc": "USRC12345678", "error": "Not found on Spotify" }
  ]
}
```

> ⚠️ Spotify API 사용을 위해 `.env`에 `SPOTIFY_CLIENT_ID`와 `SPOTIFY_CLIENT_SECRET` 설정 필요

---

## 7. 사용자 트랙 평가 (좋아요/싫어요)

### 평가 저장
```
POST /api/training/rate
```
> 🔒 인증 필요 (Bearer Token)

### Body
```json
{
  "trackId": 101,
  "rating": 1    // 1=좋아요, 0=보통, -1=싫어요
}
```

### Response
```json
{
  "message": "Rating saved",
  "trackId": 101,
  "rating": 1
}
```

### 평가 데이터 조회
```
GET /api/training/ratings?userId=1&limit=100
```

### Response
```json
{
  "totalRatings": 50,
  "stats": {
    "total": 50,
    "likes": 35,
    "dislikes": 10,
    "neutrals": 5
  },
  "data": [
    {
      "userId": 1,
      "trackId": 101,
      "title": "Song Title",
      "artist": "Artist",
      "genre": "jazz, soul",
      "rating": 1,
      "ratedAt": "2024-01-20T15:00:00.000Z"
    }
  ]
}
```

---

## 8. ML 학습용 통합 데이터셋

모든 데이터를 통합한 ML 학습용 데이터셋을 조회합니다.

### Request
```
GET /api/training/ml-dataset?userId=1
```

### Response
```json
{
  "totalRecords": 500,
  "exportedAt": "2024-01-20T15:00:00.000Z",
  "data": [
    {
      "userId": 1,
      "trackId": 101,
      "title": "Song Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "duration": 240,
      "isrc": "USRC12345678",
      "genre": "jazz, soul",
      "audioFeatures": {
        "tempo": 120.5,
        "energy": 0.65,
        "danceability": 0.72,
        "valence": 0.45,
        "acousticness": 0.32,
        "instrumentalness": 0.01,
        "liveness": 0.15,
        "speechiness": 0.04,
        "loudness": -8.5,
        "key": 5,
        "mode": 1,
        "time_signature": 4
      },
      "userRating": 1,
      "aiScore": 85.5,
      "inPlaylist": 1
    }
  ]
}
```

### 오디오 특성 설명
| 필드 | 범위 | 설명 |
|------|------|------|
| tempo | 0-250 | BPM (분당 박자 수) |
| energy | 0-1 | 에너지 강도 |
| danceability | 0-1 | 춤추기 적합도 |
| valence | 0-1 | 긍정적 분위기 (1=밝음, 0=어두움) |
| acousticness | 0-1 | 어쿠스틱 정도 |
| instrumentalness | 0-1 | 보컬 없는 정도 |
| liveness | 0-1 | 라이브 녹음 느낌 |
| speechiness | 0-1 | 말하기 비율 |

---

## 활용 예시

### Python에서 학습 데이터 가져오기
```python
import requests
import pandas as pd

# Base URL 설정 (로컬 또는 외부)
BASE_URL = 'http://localhost:3001'  # 로컬
# BASE_URL = 'https://homological-ashlyn-supercrowned.ngrok-free.dev'  # 외부

# JSON 데이터 가져오기
response = requests.get(f'{BASE_URL}/api/training/export?userId=1')
data = response.json()

# DataFrame으로 변환
df = pd.DataFrame(data['data'])
print(df.head())

# 또는 CSV로 직접 가져오기
df = pd.read_csv(f'{BASE_URL}/api/training/export?format=csv&userId=1')
```

### 학습 후 점수 저장
```python
import requests

BASE_URL = 'http://localhost:3001'  # 로컬
# BASE_URL = 'https://homological-ashlyn-supercrowned.ngrok-free.dev'  # 외부

scores = {
    "userId": 1,
    "scores": [
        {"type": "playlist", "playlistId": 5, "score": 85.5},
        {"type": "track", "trackId": 101, "score": 92.0}
    ]
}

response = requests.post(
    f'{BASE_URL}/api/training/score',
    json=scores
)
print(response.json())
```

### ML 학습용 통합 데이터셋 가져오기
```python
import requests
import pandas as pd

BASE_URL = 'http://localhost:3001'

# 통합 데이터셋 가져오기
response = requests.get(f'{BASE_URL}/api/training/ml-dataset')
data = response.json()

# DataFrame으로 변환
df = pd.DataFrame(data['data'])

# 오디오 특성 펼치기
if 'audioFeatures' in df.columns:
    features_df = pd.json_normalize(df['audioFeatures'].dropna())
    df = df.drop('audioFeatures', axis=1).join(features_df)

print(df.head())
print(f"총 {len(df)}개 레코드, 컬럼: {list(df.columns)}")
```

### 추천 모델 학습 예시
```python
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# 특성 선택 (오디오 특성 + 메타데이터)
feature_cols = ['tempo', 'energy', 'danceability', 'valence', 'acousticness', 'duration']
X = df[feature_cols].fillna(0)
y = df['userRating'].apply(lambda x: 1 if x >= 0 else 0)  # 좋아요/싫어요 이진 분류

# 학습/테스트 분리
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# 모델 학습
model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)

# 정확도 확인
accuracy = model.score(X_test, y_test)
print(f"모델 정확도: {accuracy:.2%}")
```
