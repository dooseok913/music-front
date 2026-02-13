# Audio Features 수집 전략

Spotify Audio Features API 없이 트랙의 오디오 피처(danceability, energy 등)를 채우기 위한 전략 문서.

---

## 대상 컬럼 (tracks 테이블)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| tempo | DECIMAL(6,3) | BPM |
| music_key | TINYINT | 조성 |
| mode | BOOLEAN | Major/Minor |
| time_signature | TINYINT | 박자 |
| danceability | DECIMAL(4,3) | 0.0 ~ 1.0 |
| energy | DECIMAL(4,3) | 0.0 ~ 1.0 |
| valence | DECIMAL(4,3) | 0.0 ~ 1.0 |
| acousticness | DECIMAL(4,3) | 0.0 ~ 1.0 |
| instrumentalness | DECIMAL(4,3) | 0.0 ~ 1.0 |
| liveness | DECIMAL(4,3) | 0.0 ~ 1.0 |
| speechiness | DECIMAL(4,3) | 0.0 ~ 1.0 |
| loudness | DECIMAL(5,2) | dB 단위 |

---

## 전략 1: ReccoBeats API (1순위)

Spotify Audio Features의 직접 대체제. 완전 무료, API 키 불필요.

**엔드포인트:**
```
GET https://api.reccobeats.com/v1/track/audio-features?isrc={isrc}
```

**특징:**
- Spotify Track ID 또는 ISRC로 조회 가능
- 반환값: danceability, energy, valence, tempo, acousticness, instrumentalness, liveness, speechiness, loudness → Spotify와 동일 형식
- DB에 `isrc` 컬럼이 이미 있으므로 바로 연동 가능
- 실제 오디오 분석 기반 → 예상 적중률 높음
- DB 규모: millions of tracks

**연동 방식:**
1. tracks 테이블에서 `isrc IS NOT NULL AND danceability IS NULL`인 레코드 조회
2. ISRC로 ReccoBeats API 호출
3. 응답값을 DB에 업데이트

---

## 전략 2: Last.fm 태그 + LLM (2순위, Fallback)

이미 프로젝트에서 사용 중인 Last.fm API의 태그 데이터를 활용.

**방식:**
1. Last.fm `track.getTopTags` API로 태그 조회
2. 태그를 LLM 프롬프트로 전달하여 수치 변환

**예시:**
```
tags: ["energetic", "dance", "upbeat"]
→ energy=0.8, danceability=0.85, valence=0.7
```

**특징:**
- Last.fm API 키가 .env에 이미 설정됨
- 태그가 텍스트 기반이라 LLM 변환에 적합
- ISRC가 없거나 ReccoBeats에 데이터가 없는 트랙의 fallback
- 정확도는 ReccoBeats 대비 낮음 (추정값)

---

## 전략 3: LLM 단독 추정 (3순위, 최후 수단)

아티스트, 장르, 제목 정보만으로 LLM이 오디오 피처 수치를 생성.

**방식:**
1. 트랙의 artist, title, genre 정보를 프롬프트로 구성
2. LLM에게 Spotify 형식의 수치 생성 요청

**특징:**
- 외부 API 호출 없이 가능
- 정확도가 가장 낮음
- ReccoBeats, Last.fm 모두 실패 시 최후 수단

---

## 적용 우선순위

```
ISRC 있음? ──Yes──▶ ReccoBeats API 호출
    │                    │
    │              성공? ──Yes──▶ DB 업데이트 ✓
    │                    │
    │                   No
    │                    ▼
    ▼              Last.fm 태그 + LLM 추정
ISRC 없음                │
    │              성공? ──Yes──▶ DB 업데이트 ✓
    │                    │
    │                   No
    ▼                    ▼
Last.fm 태그 + LLM ──▶ LLM 단독 추정 ──▶ DB 업데이트 ✓
```

---

## 전략 4: 하이브리드 (ReccoBeats + Last.fm 태그 병합)

ReccoBeats의 정량 데이터와 Last.fm 태그의 정성 데이터를 결합하여 정확도를 높이는 방식.

**방식:**
1. ReccoBeats API로 기본 오디오 피처 수치 확보
2. Last.fm `track.getTopTags`로 태그 조회
3. LLM에게 두 데이터를 함께 전달하여 보정/보완

**예시:**
```
ReccoBeats 결과: energy=0.65, danceability=0.70
Last.fm 태그:   ["energetic", "workout", "upbeat"]

→ LLM 보정: energy=0.65→0.78 (태그가 energetic/workout이므로 상향)
→ 누락 필드 보완: genre="Electronic Dance" (태그 기반 추정)
```

**활용 시나리오:**
- ReccoBeats 데이터가 있지만 일부 필드가 누락된 경우 → Last.fm 태그로 보완
- ReccoBeats 수치가 태그와 크게 불일치 시 → LLM이 가중 평균으로 보정
- genre, mood 같은 ReccoBeats에 없는 정성 데이터 → Last.fm 태그에서 추출

**장점:**
- 단일 소스 대비 높은 정확도
- ReccoBeats에 없는 트랙도 Last.fm + LLM으로 커버
- 정량(API) + 정성(태그) 데이터의 상호 검증 가능

---

## 전략 5: Spotify 11만곡 CSV 데이터셋 (로컬 매칭)

Spotify Audio Features가 포함된 11만곡 CSV 파일을 보유. 외부 API 호출 없이 로컬에서 즉시 매칭 가능.

**방식:**
1. CSV를 DB 또는 메모리에 로드
2. tracks 테이블의 ISRC, title+artist 조합으로 매칭
3. 매칭된 트랙의 오디오 피처를 DB에 업데이트

**장점:**
- API 호출 없음 → rate limit 걱정 없음
- 일괄 처리 가능 → 기존 DB 트랙 한번에 채우기 적합
- Spotify 원본 데이터 → 정확도 최상

**한계:**
- 11만곡 범위 내에서만 매칭 가능
- 신규 트랙은 커버 불가 → 다른 전략으로 fallback 필요

**활용:**
- 1차로 CSV 매칭을 돌려 최대한 채우고
- 나머지는 ReccoBeats → Last.fm + LLM 순으로 보완

---

## 구현 위치

| 구분 | 위치 | 비고 |
|------|------|------|
| ReccoBeats API 호출 | Spring Boot (BE) | RestTemplate 사용 |
| Last.fm 태그 조회 | Spring Boot (BE) | 기존 Last.fm 서비스 활용 |
| LLM 추정 | FastAPI (AI) | Gemini API 활용 |
| 배치 업데이트 | Spring Boot (BE) | 스케줄러 또는 수동 트리거 |
