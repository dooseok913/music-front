# MusicSpace 맥북 배포 가이드 (Docker Hub Pull 방식)

**도메인:** `http://imapplepie20.tplinkdns.com`
**대상:** 맥북 (macOS) — Docker Hub 이미지 Pull
**Compose 파일:** `docker-compose.macbook.yml`

> **빌드 방식과의 차이:**
> - 빌드 방식 (`docker-compose.fullstack-local.yml`): 맥북에서 소스를 직접 빌드 (20~40분)
> - **Docker Hub 방식 (이 문서)**: Docker Hub에서 이미지 Pull → 빌드 불필요, 빠른 시작

> **Compose 파일 안내:**
> | 파일명 | 용도 | 비고 |
> |--------|------|------|
> | `docker-compose.macbook.yml` | **맥북 배포 (이 문서에서 사용)** | Docker Hub Pull, 도메인 설정 포함 |
> | `docker-compose.macbook-dockerhub.yml` | 맥북 로컬 테스트용 (참고용) | `platform: linux/amd64` 명시, localhost 기반 |
> | `docker-compose.fullstack-local.yml` | 로컬 소스 빌드 방식 | 소스 직접 빌드 (느림) |
>
> → `docker-compose.macbook-dockerhub.yml`은 Apple Silicon에서 `platform` 을 명시적으로 지정한 테스트용 파일입니다. 운영 배포에는 `docker-compose.macbook.yml`을 사용하세요.

---

## 목차
1. [사전 요구사항](#1-사전-요구사항)
2. [이미지 Push 준비 (개발PC에서)](#2-이미지-push-준비-개발pc에서)
3. [맥북 소스 코드 준비](#3-맥북-소스-코드-준비)
4. [환경 변수(.env) 설정](#4-환경-변수env-설정)
5. [Docker Desktop 설정](#5-docker-desktop-설정)
6. [공유기 포트포워딩 설정](#6-공유기-포트포워딩-설정)
7. [맥북 네트워크 고정 설정](#7-맥북-네트워크-고정-설정)
8. [macOS 방화벽 및 절전 설정](#8-macos-방화벽-및-절전-설정)
9. [최초 실행 (맥북에서)](#9-최초-실행-맥북에서)
10. [DB 마이그레이션 적용](#10-db-마이그레이션-적용)
11. [서비스 실행 및 중지](#11-서비스-실행-및-중지)
12. [배포 후 검증](#12-배포-후-검증)
13. [코드 변경 시 업데이트 방법](#13-코드-변경-시-업데이트-방법)
14. [macOS 자동 시작 설정 (launchd)](#14-macos-자동-시작-설정-launchd)
15. [트러블슈팅](#15-트러블슈팅)
16. [아키텍처 다이어그램](#16-아키텍처-다이어그램)

---

## 1. 사전 요구사항

### 맥북에 필요한 것
- **Docker Desktop for Mac** ([다운로드](https://www.docker.com/products/docker-desktop/))
  - Apple Silicon(M1~M4): "Apple Chip" 버전
  - Intel Mac: "Intel Chip" 버전
- **Git**
- **Docker Hub 계정**: [hub.docker.com](https://hub.docker.com) (이미지 pull용)

```bash
# 설치 확인
docker --version          # 24.x 이상
docker compose version    # v2.x 이상
git --version
```

### 맥 아키텍처 확인
```bash
uname -m
# arm64  → Apple Silicon (M1~M4)
# x86_64 → Intel Mac
```

> Apple Silicon 맥에서 `x86_64(amd64)` 이미지를 실행하면 Rosetta 2 에뮬레이션으로 동작합니다.
> Docker Desktop 4.25+ 에서는 자동으로 처리되지만, 성능이 10~20% 하락할 수 있습니다.

---

## 2. 이미지 Push 준비 (개발 PC에서)

> **맥북에서 직접 빌드한다면 이 단계 건너뜀.**
> Docker Hub에 최신 이미지가 이미 올라가 있다면 바로 [3단계](#3-맥북-소스-코드-준비)로.

### 2-1. Docker Hub 로그인 (개발 PC)
```bash
docker login
# Username: johae201
# Password: Docker Hub 비밀번호 입력
```

### 2-2. 크로스 플랫폼 이미지 빌드

> **⚠️ 개발 PC와 맥북의 CPU 아키텍처가 다를 경우 반드시 크로스 빌드 필요!**
>
> | 개발 PC | 맥북 | 크로스 빌드 필요? |
> |---------|------|------------------|
> | Windows x86_64 | Apple Silicon (arm64) | ⚠️ 필요 — `--platform linux/arm64` |
> | Windows x86_64 | Intel Mac (x86_64) | ✅ 불필요 — 같은 아키텍처 |
> | Apple Silicon (arm64) | Apple Silicon (arm64) | ✅ 불필요 |

#### 방법 A: 기본 빌드 (동일 아키텍처)
```bash
cd ~/humamAppleTeamPreject001   # 또는 본인 경로
```

##### 프론트엔드 (React + nginx)
```bash
docker build -t johae201/music_space_place:frontend .
docker push johae201/music_space_place:frontend
```

##### Spring Boot 백엔드
```bash
docker build -t johae201/music_space_place:spring-backend ../2TeamFinalProject-BE
docker push johae201/music_space_place:spring-backend
```

##### FastAPI AI/ML 서버
```bash
docker build -t johae201/music_space_place:fastapi ../FAST_API
docker push johae201/music_space_place:fastapi
```

##### Node.js 백엔드
```bash
docker build -t johae201/music_space_place:node-backend ./server
docker push johae201/music_space_place:node-backend
```

#### 방법 B: 크로스 플랫폼 빌드 (아키텍처가 다를 때)

> Docker Buildx를 사용하여 멀티 아키텍처 이미지를 빌드합니다.

```bash
# 1) Buildx 빌더 생성 (최초 1회)
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2) 멀티 아키텍처 빌드 + Push (linux/amd64 + linux/arm64 동시)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t johae201/music_space_place:frontend --push .

docker buildx build --platform linux/amd64,linux/arm64 \
  -t johae201/music_space_place:spring-backend --push ../2TeamFinalProject-BE

docker buildx build --platform linux/amd64,linux/arm64 \
  -t johae201/music_space_place:fastapi --push ../FAST_API

docker buildx build --platform linux/amd64,linux/arm64 \
  -t johae201/music_space_place:node-backend --push ./server
```

> **멀티 아키텍처의 장점:** 한 번 빌드하면 Intel/Apple Silicon 맥 모두에서 네이티브 성능으로 실행됩니다.

#### 전체 한 번에 빌드 + Push (기본 빌드)
```bash
docker build -t johae201/music_space_place:frontend . && \
docker build -t johae201/music_space_place:spring-backend ../2TeamFinalProject-BE && \
docker build -t johae201/music_space_place:fastapi ../FAST_API && \
docker build -t johae201/music_space_place:node-backend ./server && \
docker push johae201/music_space_place:frontend && \
docker push johae201/music_space_place:spring-backend && \
docker push johae201/music_space_place:fastapi && \
docker push johae201/music_space_place:node-backend
```

---

## 3. 맥북 소스 코드 준비

> Docker Hub 방식에서도 소스 코드가 필요한 이유:
> - `nginx.local.conf` (nginx 설정)
> - `docs/dbSchema.sql` (DB 초기화)
> - `docker-compose.macbook.yml` (compose 파일)
> - `public/` 폴더 (이미지, 업로드)

```bash
cd ~/

# 레포 클론 (같은 부모 폴더에)
git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git
```

> FastAPI 데이터 파일은 Docker Hub 이미지 안에 포함됨 → 2TeamFinalProject-BE, FAST_API 클론 불필요

---

## 4. 환경 변수(.env) 설정

```bash
cd ~/humamAppleTeamPreject001

# .env 파일 직접 생성
cat > .env << 'EOF'
# Database (기본값 그대로 사용 가능)
DB_ROOT_PASSWORD=musicspace123
DB_NAME=music_space_db
DB_USER=musicspace
DB_PASSWORD=musicspace123

# JWT Secret — 반드시 변경!
JWT_SECRET=여기에_랜덤값_입력

# Tidal API (없으면 빈칸)
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=
TIDAL_REDIRECT_URI=http://imapplepie20.tplinkdns.com/tidal-callback

# Spotify API
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# YouTube API
YOUTUBE_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Last.fm API
LASTFM_API_KEY=
EOF
```

JWT_SECRET 생성:
```bash
openssl rand -base64 32
# 출력값을 .env 파일의 JWT_SECRET에 붙여넣기
```

> **⚠️ `.env` 파일은 Git에 커밋하지 마세요!** `.gitignore`에 포함되어 있는지 확인하세요.

---

## 5. Docker Desktop 설정

Docker Desktop 실행 → **Settings(톱니바퀴)**:

**Resources 탭:**
| 항목 | 권장값 |
|------|--------|
| CPUs | 4 이상 |
| Memory | 8GB 이상 |
| Disk image size | 30GB 이상 |

**General 탭:**
- "Start Docker Desktop when you log in" 체크 → 맥 재시작 후 자동 실행

> **Apple Silicon 참고:** Docker Desktop 4.25+ 에서 Rosetta 에뮬레이션이 기본 활성화됩니다.
> Settings → General → "Use Rosetta for x86_64/amd64 emulation on Apple Silicon" 체크 확인.

---

## 6. 공유기 포트포워딩 설정

TP-Link 공유기 관리 페이지 (`192.168.0.1` 또는 `192.168.1.1`) 접속:

**고급 설정 → NAT 포워딩 → 가상 서버:**

| 이름 | 외부 포트 | 내부 포트 | 내부 IP | 프로토콜 |
|------|----------|---------|--------|---------| 
| MusicSpace | 80 | 80 | 맥북 IP | TCP |

맥북 IP 확인:
```bash
ipconfig getifaddr en0    # Wi-Fi
ipconfig getifaddr en1    # 유선 Ethernet
```

---

## 7. 맥북 네트워크 고정 설정

포트포워딩 대상 IP가 바뀌지 않도록 고정 필요.

### 공유기에서 DHCP 예약 (권장)
TP-Link 관리 페이지 → **고급 → 네트워크 → DHCP 서버 → 주소 예약**:
- 맥북 MAC 주소 + 원하는 IP 등록

맥북 MAC 주소 확인:
```bash
# Wi-Fi
networksetup -getmacaddress Wi-Fi | awk '{print $3}'
# Ethernet
networksetup -getmacaddress Ethernet | awk '{print $3}'
```

---

## 8. macOS 방화벽 및 절전 설정

### 방화벽
**시스템 설정 → 개인정보 및 보안 → 방화벽**:
- Docker Desktop의 수신 연결 허용 확인

### 절전 방지
**시스템 설정 → 배터리 → 전원 어댑터:**
- 디스플레이 끄기: 안 함
- 네트워크 접근 시 깨우기: 체크

서비스 운영 중 터미널에서:
```bash
caffeinate -s   # Ctrl+C로 해제
```

---

## 9. 최초 실행 (맥북에서)

### 9-1. 필수 디렉터리 생성
```bash
cd ~/humamAppleTeamPreject001
mkdir -p public/images
mkdir -p public/uploads
```

### 9-2. Docker Hub 로그인 (맥북)
```bash
docker login
# Username: johae201
# Password: 입력
```

### 9-3. Docker Hub 이미지 Pull
```bash
docker compose -f docker-compose.macbook.yml pull
```

> 최초 Pull 시 이미지 크기: 약 3~5GB (FastAPI 포함)
> 네트워크 속도에 따라 5~15분 소요

### 9-4. 서비스 시작
```bash
docker compose -f docker-compose.macbook.yml up -d
```

### 9-5. 기동 확인
```bash
# 컨테이너 상태 확인 (모두 Up이어야 함)
docker ps --format "table {{.Names}}\t{{.Status}}"
```

예상 결과:
```
NAMES                       STATUS
musicspace-frontend         Up
musicspace-spring-backend   Up
musicspace-fastapi          Up (healthy)
musicspace-backend          Up
musicspace-redis            Up (healthy)
musicspace-db               Up (healthy)
```

### 9-6. 헬스체크 한 번에 확인
```bash
echo "=== Frontend ===" && curl -s -o /dev/null -w "%{http_code}" http://localhost/ && echo ""
echo "=== Spring Boot ===" && curl -s http://localhost/swagger-ui/index.html | head -1
echo "=== FastAPI ===" && curl -s http://localhost/api/fastapi/health
echo "=== Node.js ===" && curl -s http://localhost/api/health
```

---

## 10. DB 마이그레이션 적용

> **최초 실행 시 1회만 적용.** DB 볼륨이 초기화되었을 때도 재적용.

```bash
cd ~/humamAppleTeamPreject001

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

# 008
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < server/migrations/008_users_grade_and_master_role.sql
```

> **004, 006은 적용 불필요** (코드에서 사용 안 함)

### 마이그레이션 확인
```bash
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db -e "SHOW TABLES;"
```

---

## 11. 서비스 실행 및 중지

### 시작
```bash
cd ~/humamAppleTeamPreject001
docker compose -f docker-compose.macbook.yml up -d
```

### 중지 (데이터 유지)
```bash
docker compose -f docker-compose.macbook.yml down
```

### 재시작
```bash
docker compose -f docker-compose.macbook.yml restart
```

### 특정 컨테이너 재시작
```bash
docker restart musicspace-spring-backend
docker restart musicspace-fastapi
docker restart musicspace-frontend
```

### 로그 확인
```bash
# 전체 실시간
docker compose -f docker-compose.macbook.yml logs -f

# 특정 서비스
docker logs musicspace-spring-backend --tail 50
docker logs musicspace-fastapi --tail 50
docker logs musicspace-frontend --tail 50
```

---

## 12. 배포 후 검증

### 외부 접근 (도메인)
| URL | 기대 결과 |
|-----|---------|
| `http://imapplepie20.tplinkdns.com/` | MusicSpace 메인 페이지 로딩 |
| `http://imapplepie20.tplinkdns.com/music/home` | 홈 페이지 |
| `http://imapplepie20.tplinkdns.com/swagger-ui/index.html` | Spring Boot Swagger UI |
| `http://imapplepie20.tplinkdns.com/api/fastapi/health` | FastAPI 헬스 체크 JSON |

### 로컬 접근
| URL | 기대 결과 |
|-----|---------|
| `http://localhost/` | MusicSpace 메인 페이지 |
| `http://localhost/api/m1/health` | M1 모델 상태 |

### 외부 접근 테스트 (맥북이 아닌 다른 기기에서)
```bash
curl -I http://imapplepie20.tplinkdns.com/
# HTTP/1.1 200 OK 가 나와야 함
```

---

## 13. 코드 변경 시 업데이트 방법

### 전체 업데이트 (개발 PC에서 Push → 맥북에서 Pull)

**Step 1 — 개발 PC에서 이미지 빌드 & Push:**
```bash
# 프론트엔드 변경 시
docker build -t johae201/music_space_place:frontend . && \
docker push johae201/music_space_place:frontend

# 백엔드 변경 시
docker build -t johae201/music_space_place:spring-backend ../2TeamFinalProject-BE && \
docker push johae201/music_space_place:spring-backend

# FastAPI 변경 시
docker build -t johae201/music_space_place:fastapi ../FAST_API && \
docker push johae201/music_space_place:fastapi
```

**Step 2 — 맥북에서 Pull & 재시작:**
```bash
cd ~/humamAppleTeamPreject001
git pull   # nginx.local.conf, docker-compose.macbook.yml 등 업데이트
docker compose -f docker-compose.macbook.yml pull
docker compose -f docker-compose.macbook.yml up -d
```

### nginx 설정만 변경 시 (이미지 재빌드 불필요)
```bash
cd ~/humamAppleTeamPreject001
git pull
docker exec musicspace-frontend nginx -s reload
```

### 로컬 개발 환경 (docker-compose.fullstack-local.yml)

> **로컬 개발 시** 코드 수정 후 재빌드 없이 반영하려면 볼륨 마운트 설정 확인 필요

**현재 FastAPI 볼륨 마운트 설정:**
```yaml
fastapi:
  volumes:
    - ../FAST_API/M1:/app/M1           # M1 전체 (소스코드 + 모델)
    - ../FAST_API/M2:/app/M2           # M2 전체
    - ../FAST_API/M3:/app/M3           # M3 전체
    - ../FAST_API/LLM:/app/LLM
    - ../FAST_API/main.py:/app/main.py
    - ../FAST_API/database.py:/app/database.py
```

**코드 수정 후 반영 (재빌드 불필요):**
```bash
# FastAPI 코드 수정 후
docker restart musicspace-fastapi

# 반영 확인
docker logs musicspace-fastapi --tail 20
```

> **참고:** 볼륨 마운트가 안 된 경우 `--build` 옵션 필요
> ```bash
> docker-compose -f docker-compose.fullstack-local.yml up -d --build fastapi
> ```

### 이미지 정리 (디스크 공간 확보)
```bash
# 사용하지 않는 이전 이미지 삭제
docker image prune -a --filter "until=48h"
```

---

## 14. macOS 자동 시작 설정 (launchd)

> 맥 재시작 후 Docker Desktop만 실행되고, MusicSpace 컨테이너는 자동 시작되지 않을 수 있습니다.
> `launchd`를 사용하면 로그인 시 자동으로 서비스를 올릴 수 있습니다.

### 14-1. 자동 시작 스크립트 생성

```bash
cat > ~/musicspace-start.sh << 'SCRIPT'
#!/bin/bash
# MusicSpace 자동 시작 스크립트
LOG_FILE="$HOME/musicspace-autostart.log"
PROJECT_DIR="$HOME/humamAppleTeamPreject001"

echo "$(date): MusicSpace 자동 시작 시작..." >> "$LOG_FILE"

# Docker Desktop 준비 대기 (최대 120초)
WAIT_COUNT=0
while ! docker info > /dev/null 2>&1; do
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [ $WAIT_COUNT -ge 24 ]; then
    echo "$(date): Docker 시작 타임아웃 (120초)" >> "$LOG_FILE"
    exit 1
  fi
  sleep 5
done

echo "$(date): Docker 준비 완료. 컨테이너 시작..." >> "$LOG_FILE"

cd "$PROJECT_DIR"
docker compose -f docker-compose.macbook.yml up -d >> "$LOG_FILE" 2>&1

echo "$(date): MusicSpace 시작 완료." >> "$LOG_FILE"
SCRIPT

chmod +x ~/musicspace-start.sh
```

### 14-2. launchd plist 등록

```bash
cat > ~/Library/LaunchAgents/com.musicspace.autostart.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.musicspace.autostart</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>HOMEDIR/musicspace-start.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>0</integer>
  <key>StandardOutPath</key>
  <string>HOMEDIR/musicspace-launchd.log</string>
  <key>StandardErrorPath</key>
  <string>HOMEDIR/musicspace-launchd-error.log</string>
</dict>
</plist>
PLIST

# HOME 경로를 실제 경로로 치환
sed -i '' "s|HOMEDIR|$HOME|g" ~/Library/LaunchAgents/com.musicspace.autostart.plist
```

### 14-3. 등록 및 활성화

```bash
# 로드 (등록)
launchctl load ~/Library/LaunchAgents/com.musicspace.autostart.plist

# 상태 확인
launchctl list | grep musicspace

# 수동 실행 테스트
launchctl start com.musicspace.autostart

# 로그 확인
cat ~/musicspace-autostart.log
```

### 14-4. 자동 시작 해제 (필요 시)

```bash
launchctl unload ~/Library/LaunchAgents/com.musicspace.autostart.plist
rm ~/Library/LaunchAgents/com.musicspace.autostart.plist
```

---

## 15. 트러블슈팅

### 도메인 접속 불가
```bash
# 1. 컨테이너 80포트 바인딩 확인
docker ps | grep frontend

# 2. 로컬에서 먼저 테스트
curl http://localhost/

# 3. 맥북 IP 확인 (공유기 포트포워딩 대상 IP와 일치 여부)
ipconfig getifaddr en0
```

### 이미지 Pull 실패
```bash
# Docker Hub 로그인 확인
docker login

# 이미지 이름 확인
docker pull johae201/music_space_place:frontend

# 아키텍처 불일치 시 manifest 확인
docker manifest inspect johae201/music_space_place:frontend
```

### Apple Silicon에서 아키텍처 경고/에러
```bash
# 현재 실행 중인 컨테이너 아키텍처 확인
docker inspect musicspace-spring-backend | grep Architecture

# "platform: linux/amd64" 관련 에러 시 → Docker Desktop Rosetta 활성화
# Settings → General → "Use Rosetta for x86_64/amd64 emulation on Apple Silicon" 체크
```

### Spring Boot 기동 실패
```bash
docker logs musicspace-spring-backend --tail 100
```
- `user_grade` 컬럼 오류 → 마이그레이션 008 적용
- DB 연결 실패 → `musicspace-db` healthy 상태 확인 후 재시작

### FastAPI 기동 실패
```bash
docker logs musicspace-fastapi --tail 100
```
- 메모리 부족: Docker Desktop에서 Memory 8GB 이상으로 설정
- L1 Kuka 데이터 없음: fastapi 이미지에 데이터 파일 포함 여부 확인

### 포트 80 충돌
```bash
# 80포트 점유 프로세스 확인
sudo lsof -i :80

# macOS 기본 Apache 끄기
sudo apachectl stop
```

### 컨테이너 전체 상태 빠른 점검
```bash
echo "=== 컨테이너 상태 ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=== 리소스 사용량 ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

### DB 완전 초기화 (최후 수단, 모든 데이터 삭제)
```bash
docker compose -f docker-compose.macbook.yml down -v
docker compose -f docker-compose.macbook.yml up -d
# 이후 마이그레이션 재적용 필요
```

---

## 16. 아키텍처 다이어그램

```
                  ┌──────────────────────────────────────┐
                  │         Docker Hub (johae201)         │
                  │   ┌──────────┐  ┌──────────────────┐ │
                  │   │ frontend │  │ spring-backend   │ │
                  │   │ fastapi  │  │ node-backend     │ │
                  │   └──────────┘  └──────────────────┘ │
                  └──────────────┬───────────────────────┘
                       docker pull │
              ┌────────────────────▼─────────────────────┐
              │            맥북 (Docker Desktop)          │
              │                                          │
              │  ┌─────────────────────────────────────┐ │
              │  │  docker-compose.macbook.yml          │ │
              │  │                                     │ │
              │  │  ┌─────────┐    ┌────────────────┐  │ │
  :80 ────────┼──┼─►│ nginx   │───►│ Spring Boot    │  │ │
  (외부)      │  │  │ frontend│    │ :8080          │  │ │
              │  │  │         │───►│ FastAPI :8000  │  │ │
              │  │  │         │───►│ Node.js :3001  │  │ │
              │  │  └─────────┘    └───────┬────────┘  │ │
              │  │                         │           │ │
              │  │  ┌──────────┐  ┌────────▼────────┐  │ │
              │  │  │ Redis    │  │ MariaDB         │  │ │
              │  │  │ :6379    │  │ :3306           │  │ │
              │  │  └──────────┘  └─────────────────┘  │ │
              │  └─────────────────────────────────────┘ │
              └──────────────────────────────────────────┘
```

---

## 참고

| 항목 | 내용 |
|------|------|
| Docker Hub 이미지 | `johae201/music_space_place:{태그}` |
| 사용 태그 | `frontend`, `spring-backend`, `fastapi`, `node-backend` |
| nginx 설정 | `nginx.local.conf` (HTTP, 도메인 포함) |
| DB 스키마 | `docs/dbSchema.sql` |
| DB 접속 | `docker exec -it musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db` |
| nginx 리로드 | `docker exec musicspace-frontend nginx -s reload` |
| 빌드 방식 가이드 | `docs/DEPLOY_MACBOOK.md` |
| 자동 시작 로그 | `~/musicspace-autostart.log` |
| launchd 설정 | `~/Library/LaunchAgents/com.musicspace.autostart.plist` |
