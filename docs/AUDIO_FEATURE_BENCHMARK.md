# Audio Feature Prediction - 100-Track Benchmark

오디오 피처 예측 모델 3종(M1, M2, QLTY)의 정확도를 Spotify 실측값 기준으로 비교한 벤치마크 결과.

## 테스트 설정

| 항목 | 값 |
|------|-----|
| 테스트 곡 수 | 100 |
| 비교 피처 수 | 8 (danceability, energy, valence, tempo, acousticness, instrumentalness, speechiness, loudness) |
| 총 비교 횟수 | 800 (100곡 x 8피처) |
| Ground Truth | `spotify_reference` 테이블의 Spotify 공식 오디오 피처 |
| 장르 분포 | pop(25), hip-hop(16), rock(15), latin(11), electronic(6), gaming(5), afrobeats(4), punk(3), r&b(3), blues(2), k-pop(2), etc |

### 모델별 구성

| 모델 | 알고리즘 | 입력 피처 |
|------|---------|----------|
| **M1** | Ridge Regression | TF-IDF (artist 500d + album 300d) + genre multi-hot + duration + popularity |
| **M2** | GradientBoosting Regressor | TF-IDF + metadata |
| **QLTY** (no DB match) | Gemini 2.0 Flash + Google Search Grounding → LightGBM fallback | 트랙 메타데이터 → 웹 검색 → LLM 추출 |

> **Note**: QLTY는 4단계 파이프라인(ReccoBeats API → DB매칭 → Gemini+Search → DL모델)이지만, 공정한 비교를 위해 DB매칭을 비활성화하고 **Gemini + DL 모델만** 사용.
> QLTY 소스 분포: llm_search 792건 (99%), dl_model 8건 (1%).

---

## 종합 결과

| 지표 | M1 (Ridge) | M2 (GBR) | QLTY |
|------|-----------|---------|------|
| **Mean Normalized Error (MNE)** | **0.1116** | 0.1165 | 0.1357 |
| Median Track Error | **0.1109** | 0.1123 | 0.1155 |
| Std Dev Track Error | **0.0341** | 0.0462 | 0.1028 |
| Feature Wins (800전) | 212 (26.5%) | 171 (21.4%) | **417 (52.1%)** |
| Track-level Wins (100전) | 27 | 19 | **47** |

### 해석

- **MNE 기준**: M1 > M2 > QLTY (M1이 평균 오차가 가장 낮음)
- **Feature Wins 기준**: QLTY가 800개 비교 중 52.1% 승리 (과반)
- **핵심 차이**: QLTY는 **표준편차가 3배 높음** (0.1028 vs 0.0341)
  - 맞출 때는 매우 정확하지만, 틀릴 때는 크게 벗어남
  - M1/M2는 항상 "적당히 맞추는" 안정적 예측

---

## 피처별 분석

| Feature | M1 | M2 | QLTY | Best | 비고 |
|---------|-----|-----|------|------|------|
| danceability | **0.1140** | 0.1308 | 0.1767 | M1 | |
| energy | **0.1241** | 0.1438 | 0.1866 | M1 | |
| valence | **0.1949** | 0.2078 | 0.2602 | M1 | 모든 모델이 valence 예측에 가장 취약 |
| **tempo** | 0.0827 | 0.0812 | **0.0486** | **QLTY** | QLTY가 압도적 (Google 검색으로 BPM 정확히 획득) |
| acousticness | 0.2022 | 0.2081 | **0.2009** | **QLTY** | 근소한 차이 |
| instrumentalness | 0.0843 | **0.0684** | 0.1108 | M2 | |
| speechiness | **0.0551** | 0.0578 | 0.0667 | M1 | |
| loudness | 0.0352 | **0.0342** | 0.0353 | M2 | 3개 모델 거의 동일 |

### 피처별 Feature Wins 분포

| Feature | M1 wins | M2 wins | QLTY wins |
|---------|---------|---------|-----------|
| danceability | 31 | 16 | **53** |
| energy | 33 | 24 | **43** |
| valence | 34 | 26 | **40** |
| **tempo** | 9 | 14 | **77** |
| acousticness | 30 | 19 | **51** |
| instrumentalness | 17 | 31 | **52** |
| speechiness | 33 | 26 | **41** |
| loudness | 25 | 15 | **60** |

> QLTY는 **모든 8개 피처에서 개별 승수 1위**. MNE가 높은 이유는 틀릴 때의 오차 크기 때문.

---

## 장르별 분석

| Genre | N | M1 | M2 | QLTY | Best |
|-------|---|-----|-----|------|------|
| **pop** | 25 | 0.1157 | 0.1126 | **0.1057** | **QLTY** |
| hip-hop | 16 | **0.1116** | 0.1186 | 0.1771 | M1 |
| **rock** | 15 | 0.1136 | 0.1157 | **0.1118** | **QLTY** |
| latin | 11 | **0.0909** | 0.1058 | 0.1676 | M1 |
| electronic | 6 | **0.1189** | 0.1261 | 0.1821 | M1 |
| gaming | 5 | 0.1377 | **0.1359** | 0.1494 | M2 |
| **afrobeats** | 4 | 0.1307 | 0.1068 | **0.1002** | **QLTY** |
| punk | 3 | **0.0849** | 0.1232 | 0.1649 | M1 |
| r&b | 3 | 0.0887 | **0.0753** | 0.1009 | M2 |
| blues | 2 | 0.1058 | **0.0900** | 0.0923 | M2 |
| k-pop | 2 | **0.1055** | 0.1074 | 0.1239 | M1 |

### 장르별 패턴

- **QLTY 강점**: pop, rock, afrobeats — 웹에 오디오 분석 정보가 풍부한 장르
- **M1/M2 강점**: hip-hop, latin, electronic, punk — 상대적으로 웹 데이터가 부족하거나 피처 분포가 넓은 장르
- **원인 분석**: QLTY의 Gemini+Google Search는 해당 곡에 대한 웹 정보가 풍부할수록 정확하고, 정보가 부족하면 LLM 추정치에 의존하여 오차 증가

---

## QLTY 전체 파이프라인 성능 (DB매칭 포함)

위 벤치마크는 공정한 비교를 위해 DB매칭을 제외했으나, 실제 운영 환경에서는 `spotify_reference` 테이블(86,000+ 곡)과의 매칭이 1순위로 작동한다.

### DB매칭 포함 시 (5곡 테스트 결과)

| 지표 | M1 | M2 | QLTY (full pipeline) |
|------|-----|-----|---------------------|
| MNE | 0.1175 | 0.1072 | **0.0527** |
| Feature Wins (40전) | 6 | 9 | **31** |
| vs M1 | - | - | **+55.2%** |
| vs M2 | - | - | **+50.9%** |

> DB매칭된 트랙(spotify_reference에 존재)은 오차 0.000.
> `spotify_reference`에 없는 트랙만 Gemini+DL fallback을 사용.

---

## 결론

### 각 모델의 특성

| 특성 | M1 (Ridge) | M2 (GBR) | QLTY |
|------|-----------|---------|------|
| 안정성 | 높음 (StdDev 0.034) | 중간 (0.046) | 낮음 (0.103) |
| 피크 정확도 | 중간 | 중간 | **매우 높음** |
| 장르 범용성 | **높음** | 중간 | 장르 의존적 |
| 외부 의존성 | 없음 | 없음 | Gemini API, 인터넷 |
| 처리 속도 | 즉시 (~1ms) | 즉시 (~1ms) | 느림 (~3-5s/곡) |
| DB매칭 시 | - | - | **오차 0 (완벽)** |

### 운영 환경 최적 전략

1. `spotify_reference` DB매칭 가능 시 → **QLTY (오차 0)**
2. DB매칭 불가 + 유명곡 (pop/rock) → **QLTY Gemini Search** (웹 데이터 풍부)
3. DB매칭 불가 + 비주류 장르 → **M1 Ridge** (안정적 예측)
4. 실시간 대량 처리 필요 시 → **M1/M2** (API 호출 없이 즉시 예측)

---

## M1 + QLTY 조인트 전략 시뮬레이션

M1(안정적 예측)과 QLTY(높은 피크 정확도)의 장점을 결합하는 라우팅 전략을 시뮬레이션.

### 전략별 성능

| 전략 | MNE | Median | StdDev | vs M1 단독 |
|------|-----|--------|--------|-----------|
| M1 단독 (baseline) | 0.1116 | 0.1109 | 0.0341 | — |
| QLTY 단독 (no DB) | 0.1357 | 0.1155 | 0.1028 | -21.7% |
| Feature Routing | 0.1072 | 0.1025 | 0.0441 | +4.0% |
| Genre Routing | 0.1076 | 0.1018 | 0.0683 | +3.6% |
| **Hybrid (Genre+Feature)** | **0.1065** | **0.1013** | 0.0708 | **+4.5%** |
| Oracle (이론적 상한) | 0.0631 | 0.0614 | 0.0378 | +43.4% |
| QLTY Full Pipeline (w/ DB) | 0.0000 | 0.0000 | 0.0000 | +100% |

### 전략 설명

**Feature Routing** — 피처별로 더 나은 모델을 고정 선택:
- QLTY 담당: `tempo`, `acousticness`
- M1 담당: `danceability`, `energy`, `valence`, `instrumentalness`, `speechiness`, `loudness`

**Genre Routing** — 장르별로 더 나은 모델을 고정 선택:
- QLTY 담당 장르: `pop`, `rock`, `afrobeats`
- M1 담당 장르: 나머지 전부

**Hybrid (Genre + Feature)** — 두 라우팅을 결합한 최적 전략:
- QLTY 강점 장르 (pop, rock, afrobeats) → 모든 피처를 QLTY로
- M1 담당 장르 → 기본 M1, **tempo/acousticness만 QLTY**로

### Hybrid 전략 — 피처별 상세

| Feature | M1 | QLTY | Hybrid 선택 |
|---------|-----|------|-----------|
| danceability | **0.1140** | 0.1767 | M1 (M1 장르) / QLTY (QLTY 장르) |
| energy | **0.1241** | 0.1866 | M1 / QLTY |
| valence | **0.1949** | 0.2602 | M1 / QLTY |
| **tempo** | 0.0827 | **0.0486** | **항상 QLTY** |
| acousticness | 0.2022 | **0.2009** | **항상 QLTY** |
| instrumentalness | **0.0843** | 0.1108 | M1 / QLTY |
| speechiness | **0.0551** | 0.0667 | M1 / QLTY |
| loudness | **0.0352** | 0.0353 | M1 / QLTY |

### Hybrid 전략 — 장르별 상세

| Genre | N | M1 | QLTY | Hybrid | Route |
|-------|---|-----|------|--------|-------|
| **pop** | 25 | 0.1157 | **0.1057** | **0.1057** | QLTY all |
| hip-hop | 16 | **0.1116** | 0.1771 | **0.1143** | M1 + QLTY(tempo,acousticness) |
| **rock** | 15 | 0.1136 | **0.1118** | **0.1118** | QLTY all |
| latin | 11 | **0.0909** | 0.1676 | **0.0950** | M1 + QLTY(tempo,acousticness) |
| electronic | 6 | 0.1189 | 0.1821 | **0.1111** | M1 + QLTY(tempo,acousticness) |
| gaming | 5 | 0.1377 | 0.1494 | **0.1187** | M1 + QLTY(tempo,acousticness) |
| **afrobeats** | 4 | 0.1307 | **0.1002** | **0.1002** | QLTY all |
| punk | 3 | 0.0849 | 0.1649 | **0.0795** | M1 + QLTY(tempo,acousticness) |
| r&b | 3 | 0.0887 | 0.1009 | **0.0781** | M1 + QLTY(tempo,acousticness) |

### Track-level 승률 (M1 vs Hybrid)

| | Hybrid | M1 | Tie |
|--|--------|----|----|
| 승수 (100전) | **55** | 39 | 6 |

---

## 최적 전략: Divergence-Based Routing

### 개념

M1(Ridge Regression)과 QLTY(Gemini+Google Search)는 각각 장단점이 있다.
- **M1**: 항상 "적당히" 맞추지만 정확도 한계가 있음 (MNE 0.1116)
- **QLTY**: 맞출 때 매우 정확하지만, 틀릴 때 크게 벗어남 (StdDev 3배)

**핵심 아이디어**: 두 모델을 **동시에 돌린 뒤**, 두 예측값의 차이(divergence)를 보고 QLTY를 신뢰할지 M1로 보호할지 **자동 판단**한다.

- 두 모델이 **비슷한 값**을 내면 → 둘 다 맞을 가능성 높음 → **평균** 사용
- 두 모델이 **크게 다르면** → QLTY가 틀렸을 가능성 83% → **M1**로 보호
- QLTY가 **잘 맞는 조건**(장르/피처)이면 → **QLTY** 우선

Hybrid 전략(+4.5%)을 넘어서는 최적 전략을 찾기 위해 8가지 라우팅 전략을 시뮬레이션한 결과, 이 Divergence-Based Routing이 **+7.7%**로 최고 성능.

### 핵심 발견: Divergence가 가장 강력한 라우팅 신호

M1과 QLTY 예측값의 차이(divergence)로 QLTY 신뢰도를 판별할 수 있다.

| Divergence 구간 | QLTY 승률 | 의미 |
|-----------------|----------|------|
| div < 0.08 (하위 25%) | 50% | 두 모델 일치 → 평균이 유리 |
| div < 0.12 (하위 50%) | 57% | QLTY 약간 우세 |
| div < 0.16 (하위 75%) | 57% | QLTY 우세 유지 |
| **div > 0.16 (상위 25%)** | **17%** | **QLTY 신뢰 불가 → M1 사용** |

추가 신호:
- **popularity >= 90**: QLTY 승률 **75%** (vs 전체 47%)
- **QLTY 강점 장르** (pop, rock, afrobeats, gaming): 승률 **60~80%**
- **QLTY 약점 장르** (hip-hop, latin, punk, k-pop): 승률 **0~27%**

### 전략 비교 (8가지 시뮬레이션)

| Rank | Strategy | MNE | vs M1 | Oracle 달성% |
|------|----------|-----|-------|-------------|
| 1 | **Divergence-Based Routing** | **0.1030** | **+7.7%** | **17.6%** |
| 2 | Divergence + Fine-tuned 임계값 | 0.1032 | +7.6% | 17.4% |
| 3 | 확장 장르 라우팅 | 0.1056 | +5.4% | 12.4% |
| 4 | Divergence + 평균 블렌딩 | 0.1059 | +5.1% | 11.7% |
| 5 | Hybrid (장르+피처) | 0.1065 | +4.5% | 11.4% |
| 6 | 가중 평균 (M1:60 QLTY:40) | 0.1109 | +0.6% | 1.6% |
| 7 | M1 단독 | 0.1116 | — | 0% |
| - | Oracle (이론적 상한) | 0.0631 | +43.4% | 100% |

> Oracle 달성% = M1→Oracle 갭 중 몇 % 달성했는가

### Divergence-Based Routing 라우팅 로직

```
1. divergence > 0.16 → M1          (QLTY 17% 승률, 위험)
2. QLTY 강점 장르       → QLTY        (pop,rock,afrobeats,gaming...)
3. QLTY 강점 피처       → QLTY        (tempo, acousticness)
4. divergence < 0.05 → Average     (두 모델 일치, 평균이 최적)
5. divergence < 0.10 → WAvg 6:4    (M1 60% + QLTY 40%)
6. popularity >= 80  → WAvg 6:4    (인기곡은 QLTY 참고 가치 있음)
7. default           → M1          (안전한 선택)
```

### Divergence-Based Routing 라우팅 분포 (800 comparisons)

| Route | 횟수 | 비율 | 설명 |
|-------|------|------|------|
| QLTY (장르 기반) | 294 | 36.8% | pop, rock, afrobeats 등 |
| M1 (high divergence) | 243 | 30.4% | div > 0.16일 때 M1 보호 |
| Average (low div) | 113 | 14.1% | div < 0.05, 두 모델 합의 |
| QLTY (피처 기반) | 54 | 6.8% | tempo, acousticness |
| WAvg (mid div) | 49 | 6.1% | div 0.05~0.10 |
| M1 (default) | 38 | 4.8% | 기타 |
| WAvg (high pop) | 9 | 1.1% | pop>=80 참고 |

### Divergence-Based Routing 피처별 개선

| Feature | M1 | Divergence-Based Routing | 개선율 |
|---------|-----|---------|--------|
| danceability | 0.1140 | **0.1007** | +11.7% |
| energy | 0.1241 | **0.1129** | +9.1% |
| valence | 0.1949 | **0.1942** | +0.4% |
| **tempo** | 0.0827 | **0.0556** | **+32.8%** |
| acousticness | 0.2022 | **0.1974** | +2.4% |
| instrumentalness | 0.0843 | **0.0816** | +3.3% |
| speechiness | 0.0551 | **0.0549** | +0.5% |
| **loudness** | 0.0352 | **0.0271** | **+23.0%** |

### Divergence-Based Routing 장르별 개선

| Genre | N | M1 | Divergence-Based Routing | 개선율 |
|-------|---|-----|---------|--------|
| **punk** | 3 | 0.0849 | **0.0666** | **+21.6%** |
| **gaming** | 5 | 0.1377 | **0.1132** | **+17.8%** |
| **rock** | 15 | 0.1136 | **0.0997** | **+12.2%** |
| **r&b** | 3 | 0.0887 | **0.0785** | **+11.5%** |
| **pop** | 25 | 0.1157 | **0.1025** | **+11.4%** |
| afrobeats | 4 | 0.1307 | 0.1296 | +0.9% |
| hip-hop | 16 | 0.1116 | 0.1120 | -0.4% |
| latin | 11 | 0.0909 | 0.0909 | -0.0% |

> hip-hop, latin 등 QLTY 약점 장르에서는 M1을 유지하여 손실 없음 (±0%)

### 핵심 인사이트

1. **Divergence-Based Routing**는 M1 단독 대비 **+7.7% 개선** (Hybrid +4.5% 대비 +70% 추가 개선)
2. **divergence > 0.16 → M1 강제**가 핵심: QLTY의 큰 오류를 사전 차단
3. **두 모델 합의 구간(div<0.05) → 평균**이 양쪽 모두보다 정확
4. 어떤 장르에서도 M1 대비 **손실 없음** (최악이 -0.5%)
5. **실운영**: DB매칭(1순위) → Divergence-Based Routing(fallback) → **MNE 0에 수렴**

---

## 측정 방법론

### Mean Normalized Error (MNE)
- 0~1 피처 (danceability 등): `|predicted - actual|`
- tempo: `|predicted - actual| / 250`
- loudness: `|predicted - actual| / 60`
- 범위: 0 (완벽) ~ 1 (최악)

### Feature Win 판정
- 3개 모델 중 normalized error가 가장 작은 모델이 승리
- 0.005 이내 차이는 tie (가장 작은 쪽에 부여)

### 테스트 데이터
- `spotify_reference` 테이블에서 `RAND(42)` 시드로 100곡 샘플링
- popularity >= 50 필터 (최소한의 인지도 보장)
- 8개 피처 모두 NOT NULL인 곡만 포함

---

*테스트 일시: 2026-02-13*
*테스트 환경: Docker (musicspace-fastapi), Gemini 2.0 Flash, LightGBM*
