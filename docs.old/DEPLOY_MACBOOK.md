# MusicSpace 맥북 배포 가이드

**도메인:** `http://imapplepie20.tplinkdns.com`
**대상:** 맥북 (macOS) 로컬 풀스택 배포
**방식:** `docker-compose.fullstack-local.yml` (빌드 방식, HTTP)

---

## 목차
1. [사전 요구사항](#1-사전-요구사항)
2. [소스 코드 준비](#2-소스-코드-준비)
3. [nginx 도메인 설정](#3-nginx-도메인-설정)
4. [환경 변수(.env) 설정](#4-환경-변수env-설정)
5. [Docker Desktop 설정](#5-docker-desktop-설정)
6. [공유기 포트포워딩 설정](#6-공유기-포트포워딩-설정)
7. [맥북 네트워크 고정 설정](#7-맥북-네트워크-고정-설정)
8. [macOS 방화벽 및 절전 설정](#8-macos-방화벽-및-절전-설정)
9. [최초 실행 (DB 초기화 포함)](#9-최초-실행-db-초기화-포함)
10. [서비스 실행 및 중지](#10-서비스-실행-및-중지)
11. [배포 후 검증](#11-배포-후-검증)
12. [업데이트 방법](#12-업데이트-방법)
13. [트러블슈팅](#13-트러블슈팅)

---

## 1. 사전 요구사항

### 필수 설치
```bash
# 설치 확인
docker --version          # Docker 24.x 이상
docker compose version    # Docker Compose v2.x 이상
git --version
```

- **Docker Desktop for Mac** 설치: https://www.docker.com/products/docker-desktop/
  - Apple Silicon(M1/M2/M3)이면 "Apple Chip" 버전으로 설치
  - Intel이면 "Intel Chip" 버전으로 설치

### API 키 확인 (배포 전 준비)
아래 키들이 있는지 확인. 없어도 서비스는 기동되지만 해당 기능이 비활성화됨.
| 키 | 용도 | 발급처 |
|----|------|-------|
| TIDAL_CLIENT_ID / SECRET | Tidal 연동 | developer.tidal.com |
| SPOTIFY_CLIENT_ID / SECRET | Spotify 연동 | developer.spotify.com |
| YOUTUBE_KEY | YouTube 검색 | console.cloud.google.com |
| LASTFM_API_KEY | Last.fm 태그 | www.last.fm/api |

---

## 2. 소스 코드 준비

```bash
# 배포할 폴더로 이동
cd ~/

# 두 레포 클론 (같은 부모 폴더에 나란히 위치해야 함)
git clone https://github.com/사용자명/humamAppleTeamPreject001.git
git clone https://github.com/사용자명/2TeamFinalProject-BE.git
git clone https://github.com/사용자명/FAST_API.git

# 폴더 구조 확인 (반드시 이 구조여야 함)
ls ~/
# humamAppleTeamPreject001/
# 2TeamFinalProject-BE/
# FAST_API/
```

> **중요:** `docker-compose.fullstack-local.yml`이 `../2TeamFinalProject-BE`와 `../FAST_API` 경로를 참조하므로
> 세 폴더가 **같은 부모 폴더** 아래에 있어야 함.

---

## 3. nginx 도메인 설정

`nginx.local.conf`의 `server_name` 에 배포 도메인을 추가해야 함.

```bash
cd ~/humamAppleTeamPreject001
```

[humamAppleTeamPreject001/nginx.local.conf](../nginx.local.conf) 파일에서:

```nginx
# 변경 전
server_name imaiplan.sytes.net localhost;

# 변경 후
server_name imapplepie20.tplinkdns.com imaiplan.sytes.net localhost;
```

---

## 4. 환경 변수(.env) 설정

```bash
cd ~/humamAppleTeamPreject001

# 템플릿 복사
cp .env.docker .env
```

`.env` 파일을 열어 아래 항목 수정:

```env
# Database (변경 불필요)
DB_ROOT_PASSWORD=musicspace123
DB_NAME=music_space_db
DB_USER=musicspace
DB_PASSWORD=musicspace123

# JWT Secret (보안을 위해 반드시 변경)
JWT_SECRET=여기에_랜덤값_입력
# 랜덤값 생성 명령어: openssl rand -base64 32

# Tidal API (있으면 입력, 없으면 빈칸으로 두면 됨)
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=

# Spotify API
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# YouTube API
YOUTUBE_KEY=

# Last.fm API
LASTFM_API_KEY=
```

---

## 5. Docker Desktop 설정

Docker Desktop을 열고 **Settings** (톱니바퀴) → **Resources** 에서:

| 항목 | 권장값 |
|------|--------|
| CPUs | 4 이상 |
| Memory | 8GB 이상 (FastAPI AI 모델 로딩 필요) |
| Disk image size | 40GB 이상 |

**General** 탭에서:
- "Start Docker Desktop when you log in" 체크 → 맥 재시작 후 자동 실행

---

## 6. 공유기 포트포워딩 설정

TP-Link 공유기 관리 페이지 (`192.168.0.1` 또는 `192.168.1.1`)에 접속:

1. **고급 설정** → **NAT 포워딩** → **가상 서버(Virtual Servers)**
2. 아래 규칙 추가:

| 이름 | 외부 포트 | 내부 포트 | 내부 IP | 프로토콜 |
|------|----------|---------|--------|---------|
| MusicSpace HTTP | 80 | 80 | 맥북 IP (예: 192.168.0.xxx) | TCP |

3. **저장** 후 공유기 재시작

> 맥북 IP 확인 방법:
> ```bash
> ipconfig getifaddr en0    # Wi-Fi
> ipconfig getifaddr en1    # Ethernet
> ```

---

## 7. 맥북 네트워크 고정 설정

포트포워딩은 IP가 변하면 깨지므로 맥북 IP를 **고정(DHCP 예약)** 해야 함.

### 방법 A: 공유기에서 DHCP 예약 (권장)
TP-Link 관리 페이지 → **고급** → **네트워크** → **DHCP 서버** → **주소 예약**:
- 맥북의 MAC 주소와 IP를 고정 매핑

### 방법 B: 맥북에서 고정 IP 설정
**시스템 설정** → **네트워크** → Wi-Fi/Ethernet → **세부 사항** → **TCP/IP**:
- IPv4 구성: **수동**
- IP 주소: `192.168.0.xxx` (현재 IP 입력)
- 서브넷 마스크: `255.255.255.0`
- 라우터: `192.168.0.1` (공유기 IP)

DNS 탭:
- DNS 서버: `8.8.8.8`, `8.8.4.4`

---

## 8. macOS 방화벽 및 절전 설정

### 방화벽 확인
**시스템 설정** → **개인정보 및 보안** → **방화벽**:
- 방화벽이 켜져 있다면 Docker Desktop에 대한 수신 연결 **허용** 확인

### 절전 방지 설정 (서버 운용 중에는 필수)
**시스템 설정** → **잠금 화면**:
- "다음 시간 동안 사용하지 않으면 화면 보호기 시작": 안 함 (또는 긴 시간)

**시스템 설정** → **배터리** → **전원 어댑터**:
- "다음 시간 동안 활동이 없으면 디스플레이 끄기": 안 함
- "네트워크 접근 시 깨우기": 체크

또는 터미널로 절전 방지 (서비스 운영 중 실행):
```bash
# 맥이 잠자지 않도록 (Ctrl+C로 해제)
caffeinate -s
```

---

## 9. 최초 실행 (DB 초기화 포함)

> **주의:** 최초 실행 시 Docker 이미지 빌드로 인해 20~40분 이상 소요될 수 있음.
> 특히 FastAPI는 ML 라이브러리(faiss, scikit-learn, etc.) 설치로 시간이 걸림.

### 9-1. 필수 디렉터리 생성
```bash
cd ~/humamAppleTeamPreject001

mkdir -p public/images
mkdir -p public/uploads
```

### 9-2. DB 초기화 파일 확인
`docker-compose.fullstack-local.yml`은 아래 파일로 DB를 초기화함:
```
humamAppleTeamPreject001/music_space_db_dump.sql
```

이 파일이 없다면 `docs/dbSchema.sql`로 대체:
```bash
# music_space_db_dump.sql이 없는 경우
cp docs/dbSchema.sql music_space_db_dump.sql
```

### 9-3. 최초 빌드 및 실행
```bash
cd ~/humamAppleTeamPreject001

docker compose -f docker-compose.fullstack-local.yml up -d --build
```

### 9-4. 빌드 진행 확인
```bash
# 실시간 로그 확인
docker compose -f docker-compose.fullstack-local.yml logs -f

# 컨테이너 상태 확인 (모두 Up 상태여야 함)
docker ps
```

예상 컨테이너:
```
musicspace-db             Up (healthy)
musicspace-redis          Up (healthy)
musicspace-spring-backend Up
musicspace-fastapi        Up (healthy)
musicspace-backend        Up
musicspace-frontend       Up
```

### 9-5. DB 마이그레이션 적용
DB가 기동된 후 migrations 폴더의 SQL을 순서대로 적용:

```bash
# DB 컨테이너에 접속
docker exec -it musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db

# 접속 성공 확인 후 exit
exit
```

아래 마이그레이션을 **순서대로** 실행 (이미 적용된 항목은 건너뜀):

```bash
# 001
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/001_create_genres_tables.sql

# 002
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/002_ems_scoring_tables.sql

# 003
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/003_track_extended_metadata.sql

# stats
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/create_stats_tables.sql

# 005
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/005_ems_playlist_for_recommend.sql

# 007
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/007_user_cart_table.sql

# 008 (user_grade, MASTER role)
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/008_users_grade_and_master_role.sql
```

> **004, 006은 적용하지 않아도 됨:**
> - 004: 코드에서 `external_metadata` JSON으로 대체 사용
> - 006: `AiAnalysisLogs` 엔티티에 해당 필드 없음

---

## 10. 서비스 실행 및 중지

### 시작
```bash
cd ~/humamAppleTeamPreject001
docker compose -f docker-compose.fullstack-local.yml up -d
```

### 중지 (데이터 유지)
```bash
docker compose -f docker-compose.fullstack-local.yml down
```

### 재시작
```bash
docker compose -f docker-compose.fullstack-local.yml restart
```

### 특정 컨테이너만 재시작
```bash
docker restart musicspace-spring-backend
docker restart musicspace-fastapi
docker restart musicspace-frontend
```

### 로그 확인
```bash
# 전체
docker compose -f docker-compose.fullstack-local.yml logs -f

# 특정 서비스
docker logs musicspace-spring-backend --tail 50
docker logs musicspace-fastapi --tail 50
docker logs musicspace-frontend --tail 50
docker logs musicspace-db --tail 50
```

---

## 11. 배포 후 검증

서비스가 기동된 후 아래 URL들을 확인:

### 외부 접근 (도메인)
| URL | 기대 결과 |
|-----|---------|
| `http://imapplepie20.tplinkdns.com/` | MusicSpace 메인 페이지 |
| `http://imapplepie20.tplinkdns.com/music/home` | 홈 페이지 |
| `http://imapplepie20.tplinkdns.com/swagger-ui/index.html` | Spring Boot Swagger UI |

### 내부 접근 (로컬)
| URL | 기대 결과 |
|-----|---------|
| `http://localhost/` | MusicSpace 메인 페이지 |
| `http://localhost/api/fastapi/health` | FastAPI 헬스 체크 |
| `http://localhost/api/m1/health` | M1 모델 상태 |

### 컨테이너 상태 최종 확인
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## 12. 업데이트 방법

### 코드 업데이트 후 재빌드
```bash
cd ~/humamAppleTeamPreject001
git pull

# 프론트엔드만 변경된 경우
docker compose -f docker-compose.fullstack-local.yml up -d --build frontend

# 백엔드 포함 전체 재빌드
docker compose -f docker-compose.fullstack-local.yml up -d --build
```

### Spring Boot 업데이트
```bash
cd ~/2TeamFinalProject-BE
git pull
cd ~/humamAppleTeamPreject001
docker compose -f docker-compose.fullstack-local.yml up -d --build spring-backend
```

### FastAPI 업데이트
```bash
cd ~/FAST_API
git pull
cd ~/humamAppleTeamPreject001
docker compose -f docker-compose.fullstack-local.yml up -d --build fastapi
```

---

## 13. 트러블슈팅

### 도메인으로 접속이 안 될 때
1. 공유기 포트포워딩 확인 (80번 포트 → 맥북 내부 IP)
2. 맥북 내부 IP가 바뀌지 않았는지 확인: `ipconfig getifaddr en0`
3. tplinkdns 동적 DNS가 현재 공인 IP를 가리키는지 확인
4. Docker 컨테이너 80번 포트 바인딩 확인: `docker ps | grep frontend`

### Spring Boot가 시작 안 될 때
```bash
docker logs musicspace-spring-backend --tail 100
```
- DB 연결 실패 → `musicspace-db` 컨테이너 상태 확인 (`healthy` 상태인지)
- `user_grade` 컬럼 오류 → 마이그레이션 008 적용 확인

### FastAPI가 시작 안 될 때
```bash
docker logs musicspace-fastapi --tail 100
```
- ML 라이브러리 로딩 실패 → 메모리 부족 (Docker Desktop 메모리 8GB 이상으로 설정)
- L1 Kuka 데이터 파일 없음 → `FAST_API/LLM/L1/data/spotify_cleaned.parquet` 존재 확인

### DB 초기화가 안 될 때
```bash
# DB 볼륨 완전 삭제 후 재시작 (모든 데이터 초기화됨)
docker compose -f docker-compose.fullstack-local.yml down -v
docker compose -f docker-compose.fullstack-local.yml up -d --build
```

### 디스크 용량 부족
```bash
# 사용하지 않는 이미지/컨테이너 정리
docker system prune -f

# 전체 용량 확인
docker system df
```

### 포트 충돌 (80번이 이미 사용 중)
```bash
# 80번 포트 사용 중인 프로세스 확인
sudo lsof -i :80

# macOS Apache가 켜져 있다면 끄기
sudo apachectl stop
sudo launchctl unload -w /System/Library/LaunchDaemons/org.apache.httpd.plist 2>/dev/null
```

---

## 참고

- **DB 접속:** `docker exec -it musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db`
- **nginx 설정 변경 후 reload:** `docker exec musicspace-frontend nginx -s reload`
- **DB 스키마 파일:** `humamAppleTeamPreject001/docs/dbSchema.sql`
- **Docker 상세 가이드:** `humamAppleTeamPreject001/DOCKER.md`
