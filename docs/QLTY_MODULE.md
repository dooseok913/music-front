# QLTY 모듈 — 오디오 피처 보강 파이프라인

불완전한 트랙 데이터의 Spotify 스타일 오디오 피처를 4단계 우선순위로 채워넣는 FastAPI 모듈.

> 기존 전략 문서(`AUDIO_FEATURES_STRATEGY.md`)의 실제 구현체.

---

## 파일 구조

```
FAST_API/QLTY/
├── __init__.py          # 모듈 설명
├── pipeline.py          # 오케스트레이터 (4단계 우선순위 실행)
├── reccobeats.py        # 1순위: ReccoBeats API (ISRC 기반)
├── db_matcher.py        # 2순위: spotify_reference DB 매칭
├── llm_estimator.py     # 3순위: Gemini + Google Search Grounding
├── model.py             # 4순위: LightGBM DL 모델 정의
├── train.py             # DL 모델 학습 스크립트
└── router.py            # FastAPI 엔드포인트
```

---

## 4단계 우선순위

```
트랙 입력
    │
    ▼
1순위: ReccoBeats API ──(ISRC 필요)──▶ 실제 오디오 분석 데이터
    │ (부족하면)
    ▼
2순위: spotify_reference DB ──(title+artist)──▶ Spotify 공식 데이터 (86K곡)
    │ (부족하면)
    ▼
3순위: Gemini + Google Search ──(항상 가능)──▶ 웹 검색 기반 실제값/추정
    │ (부족하면)
    ▼
4순위: LightGBM DL 모델 ──(학습 필요)──▶ 통계적 추정 (최후 수단)
    │
    ▼
최종 결과: 12개 피처 coverage 1.0
```

**핵심 원칙**: 상위 소스에서 이미 채운 피처는 하위 소스에서 절대 덮어쓰지 않음.

---

## 대상 피처 (12개)

| 피처 | 범위 | 주요 소스 |
|------|------|-----------|
| danceability | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| energy | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| valence | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| tempo | 40 ~ 250 BPM | ReccoBeats / DB / LLM Search |
| acousticness | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| instrumentalness | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| liveness | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| speechiness | 0.0 ~ 1.0 | ReccoBeats / DB / LLM Search |
| loudness | -60 ~ 5 dB | ReccoBeats / DB / LLM Search |
| music_key | 0 ~ 11 | DB / DL 모델 |
| mode | 0 or 1 | DB / DL 모델 |
| time_signature | 3 ~ 7 | DB / DL 모델 |

---

## API 엔드포인트

### POST `/api/qlty/enrich`

트랙 오디오 피처 보강. 단일/배치 모두 지원.

**요청:**
```json
{
  "tracks": [
    {
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "isrc": "USUG11904154",
      "album": "After Hours",
      "genre": "Pop",
      "duration_ms": 200040,
      "popularity": 87
    }
  ],
  "skip_api": false,
  "skip_llm": false
}
```

**응답:**
```json
{
  "success": true,
  "total": 1,
  "complete": 1,
  "results": [
    {
      "title": "Blinding Lights",
      "artist": "The Weeknd",
      "features": {
        "danceability": 0.76,
        "energy": 0.7,
        "valence": 0.74,
        "tempo": 171.0,
        "acousticness": 0.5,
        "instrumentalness": 0.22,
        "liveness": 0.18,
        "speechiness": 0.09,
        "loudness": -8.0,
        "music_key": 6,
        "mode": 0,
        "time_signature": 4
      },
      "sources": {
        "danceability": "llm_search",
        "energy": "llm_search",
        "tempo": "llm_search",
        "music_key": "dl_model",
        "mode": "dl_model",
        "time_signature": "dl_model"
      },
      "attempted": ["db_match", "llm_search", "dl_model"],
      "feature_count": 12,
      "coverage": 1.0
    }
  ]
}
```

### POST `/api/qlty/train`

DL 모델 학습. `spotify_reference` 테이블 데이터 기반.

**응답:**
```json
{
  "success": true,
  "message": "QLTY 모델 학습 완료",
  "head_a": { "data_count": 86000, "features": 7, "metrics": {...} },
  "head_b": { "data_count": 1700, "features": 5, "metrics": {...} }
}
```

### GET `/api/qlty/health`

모듈 컴포넌트 상태 확인.

**응답:**
```json
{
  "status": "ready",
  "components": {
    "dl_model": true,
    "gemini": true,
    "db": true,
    "reccobeats": true
  }
}
```

---

## 각 소스 상세

### 1순위: ReccoBeats API (`reccobeats.py`)

- **엔드포인트**: `GET https://api.reccobeats.com/v1/track/audio-features?isrc={isrc}`
- **조건**: ISRC 필요
- **비용**: 무료, API 키 불필요
- **반환**: 9개 핵심 피처 (Spotify 형식 동일)
- Rate limit 보호: 배치 시 순차 실행

### 2순위: spotify_reference DB (`db_matcher.py`)

- **테이블**: `spotify_reference` (약 86,000곡)
- **매칭**: `LOWER(TRIM(title))` + `LOWER(TRIM(artist))` 일치
- **다중 매칭 시**: `popularity DESC` 최상위 1건
- **반환**: 12개 전체 피처

### 3순위: Gemini + Google Search (`llm_estimator.py`)

- **SDK**: `google.genai` v1.63.0 (신규 SDK)
- **모델**: `gemini-2.0-flash`
- **동작**:
  1. Google Search Grounding으로 tunebat.com 등에서 실제 데이터 검색
  2. 검색 결과 부족 시 순수 LLM 추정 fallback
- **환경변수**: `GOOGLE_API_KEY`
- **반환**: 9개 피처 (검색 기반 또는 추정)
- **주의**: 구 SDK(`google.generativeai` 0.8.x)의 `GoogleSearchRetrieval`은 API가 거부함

**올바른 사용법:**
```python
from google import genai
from google.genai import types

client = genai.Client(api_key=api_key)
response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        max_output_tokens=500,
        temperature=0.1,
    ),
)
```

### 4순위: LightGBM DL 모델 (`model.py` + `train.py`)

- **입력**: SentenceTransformer(`all-MiniLM-L6-v2`, 384D) + numeric(duration, popularity) = 386D
- **구조**:
  - Head A: 7개 피처 (86K 학습 데이터) — danceability, energy, valence, tempo, acousticness, instrumentalness, liveness
  - Head B: 5개 피처 (1.7K 학습 데이터) — speechiness, loudness, music_key, mode, time_signature
- **모델 파일**: `QLTY/qlty_models.pkl`
- **성능**: R² ≈ 0 (사실상 평균값 예측 — 보조 수단으로만 활용)

---

## Docker 설정

`docker-compose.fullstack-local.yml` FastAPI 서비스에 볼륨 마운트 추가:

```yaml
volumes:
  - ../FAST_API/QLTY:/app/QLTY
```

**수정 반영 방법:**
- 소스 코드 수정: `docker restart musicspace-fastapi`
- 환경변수 변경: `docker compose -f docker-compose.fullstack-local.yml up -d --no-deps fastapi`

---

## 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| google-genai | 1.63.0 | Gemini + Google Search |
| sentence-transformers | - | 텍스트 임베딩 (DL 모델) |
| lightgbm | - | DL 모델 학습/예측 |
| httpx | - | ReccoBeats API 호출 |
| sqlalchemy | - | DB 매칭 |

---

## 테스트 결과 (2026-02-13)

3곡 테스트 — DB에 없는 트랙으로 LLM Search 경로 확인:

| 트랙 | 소스 구성 | coverage |
|------|-----------|----------|
| Blinding Lights - The Weeknd | 9개 llm_search + 3개 dl_model | 1.0 |
| Bohemian Rhapsody - Queen | 9개 llm_search + 3개 dl_model | 1.0 |
| bad guy - Billie Eilish | 9개 llm_search + 3개 dl_model | 1.0 |

---

## 호출 흐름 (Spring Boot → FastAPI)

```
Spring Boot
    │
    ├─ POST /api/qlty/enrich (트랙 목록)
    │
    ▼
FastAPI (QLTY router)
    │
    ├─ pipeline.enrich_batch()
    │   ├─ reccobeats.fetch_by_isrc()     → 외부 API
    │   ├─ db_matcher.match_track()        → MariaDB
    │   ├─ llm_estimator.estimate()        → Gemini API
    │   └─ model.predict()                 → 로컬 LightGBM
    │
    ▼
JSON 응답 (features + sources + coverage)
```
