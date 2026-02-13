# MusicSpace — MacBook 로컬 배포 가이드

---

## 목차

1. [사전 준비](#1-사전-준비)
2. [저장소 준비](#2-저장소-준비)
3. [DB 스키마/데이터 및 용량 초과 파일](#3-db-스키마데이터-및-용량-초과-파일)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [SSL 인증서 준비](#5-ssl-인증서-준비)
6. [전체 스택 실행](#6-전체-스택-실행)
7. [프론트엔드만 업데이트](#7-프론트엔드만-업데이트)
8. [개발 서버 실행](#8-개발-서버-실행)
9. [도메인 및 포트포워딩](#9-도메인-및-포트포워딩)
10. [업데이트 절차](#10-업데이트-절차)
11. [트러블슈팅](#11-트러블슈팅)

---

## 1. 사전 준비

| 항목 | 버전 | 확인 방법 |
|------|------|----------|
| Docker Desktop | 4.x 이상 | `docker --version` |
| Docker Compose | v2 내장 | `docker compose version` |
| Node.js | 20.x (빌드용) | `node --version` |
| Git | any | `git --version` |

**Docker Desktop 설정:**
- Resources → Memory: 8GB 이상 권장
- Resources → CPUs: 4코어 이상 권장

---

## 2. 저장소 준비

세 레포를 같은 부모 디렉토리에 클론합니다:

```bash
mkdir Team_final_project && cd Team_final_project

git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git
git clone https://github.com/imorangepie20/2TeamFinalProject-PB.git      2TeamFinalProject-BE
git clone https://github.com/imorangepie20/FAST_API-PB.git               FAST_API
```

**최종 디렉토리 구조:**
```
Team_final_project/
├── humamAppleTeamPreject001/
├── 2TeamFinalProject-BE/
└── FAST_API/
```

---

## 3. DB 스키마/데이터 및 용량 초과 파일

Git에 포함되지 않는 DB 스키마, 초기 데이터, 대용량 파일은 아래 Google Drive에서 다운로드 후 직접 배치해야 합니다:

> **https://drive.google.com/drive/folders/1CgLZCJ072jbvc2mOgVJF6xkmYFO0spzH?usp=drive_link**

---

## 4. 환경 변수 설정

```bash
cd humamAppleTeamPreject001
cp .env.example .env   # 없으면 직접 생성
```

`.env` 파일 내용:

```env
# Database
DB_ROOT_PASSWORD=musicspace123
DB_NAME=music_space_db
DB_USER=musicspace
DB_PASSWORD=musicspace123

# JWT
JWT_SECRET=MusicSpaceSecretKeyForJWTAuthentication2024VeryLongKeyHereNeedAtLeast256BitsForHS256Algorithm

# Tidal
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=
TIDAL_REDIRECT_URI=https://imapplepie20.tplinkdns.com:8443/tidal-callback

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# YouTube
YOUTUBE_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Google (Gemini for LLM)
GOOGLE_API_KEY=

# Last.fm
LASTFM_API_KEY=
```

> API 키 없이도 기본 기능(로그인, 플레이리스트 관리)은 동작합니다.

---

## 5. SSL 인증서 준비

HTTPS가 필요한 경우 `ssl/` 폴더에 인증서를 배치합니다:

```
ssl/
└── config/
    └── live/
        └── imapplepie20.tplinkdns.com/
            ├── fullchain.pem
            └── privkey.pem
```

**Let's Encrypt 인증서 갱신:**
```bash
# webroot 방식
certbot certonly --webroot -w ./public/webroot \
  -d imapplepie20.tplinkdns.com
```

HTTP만 사용할 경우 `nginx.local.conf`에서 SSL 블록을 제거하고 포트 80만 사용합니다.

---

## 6. 전체 스택 실행

### 최초 실행 / 코드 변경 후 재빌드

```bash
cd humamAppleTeamPreject001

docker compose -f docker-compose.macbook-dockerhub.yml up -d --build
```

빌드 시간: 약 10~30분 (최초 또는 의존성 변경 시)

### 이후 재시작 (빌드 없이)

```bash
docker compose -f docker-compose.macbook-dockerhub.yml up -d
```

### 상태 확인

```bash
docker ps

# 예상 출력
CONTAINER ID  IMAGE                       PORTS                  NAMES
...           nginx:alpine                0.0.0.0:80->80/tcp     musicspace-frontend
...           eclipse-temurin:17          (internal)             musicspace-spring-backend
...           python:3.11                 (internal)             musicspace-fastapi
...           node:20-alpine              (internal)             musicspace-backend
...           mariadb:10.11               0.0.0.0:3306->3306     musicspace-db
...           redis:7-alpine              0.0.0.0:6379->6379     musicspace-redis
```

### 전체 종료

```bash
docker compose -f docker-compose.macbook-dockerhub.yml down
```

### 데이터 포함 완전 삭제

```bash
docker compose -f docker-compose.macbook-dockerhub.yml down -v
```

---

## 7. 프론트엔드만 업데이트

소스 변경 후 프론트엔드 컨테이너만 빠르게 재배포:

```bash
./deploy-frontend.sh
```

스크립트 동작:
1. git pull (최신 코드)
2. npm install + npm run build (로컬 빌드 확인용)
3. 기존 컨테이너 삭제
4. docker-compose up -d --build (이미지 재빌드)

---

## 8. 개발 서버 실행 (Vite Dev)

백엔드 서비스는 Docker로 실행하고, 프론트엔드만 로컬 개발 서버로 실행할 때:

```bash
cd humamAppleTeamPreject001
npm install
npm run dev
```

접속: http://localhost:5173

> `vite.config.ts`의 proxy 설정으로 `/api/*` 요청을 각 백엔드로 전달합니다.

---

## 9. 도메인 및 포트포워딩

### 포트 구성

| 포트 | 용도 |
|------|------|
| 80 | HTTP (→ HTTPS 리다이렉트) |
| 443 | HTTPS (imaiplan.sytes.net) |
| 8443 | HTTPS (imapplepie20.tplinkdns.com) |
| 3306 | MariaDB (외부 접근용) |
| 6379 | Redis (외부 접근용) |

### 라우터 포트포워딩 설정

공유기에서 다음 포트를 MacBook IP로 포워딩:
- 외부 80 → 내부 80
- 외부 443 → 내부 443
- 외부 8443 → 내부 8443

### macOS 방화벽

```bash
# 방화벽에서 포트 허용 (필요 시)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/bin/docker
```

---

## 10. 업데이트 절차

### 프론트엔드 코드 업데이트

```bash
cd humamAppleTeamPreject001
git pull
./deploy-frontend.sh
```

### Spring Boot 업데이트

```bash
cd humamAppleTeamPreject001
git -C ../2TeamFinalProject-BE pull
docker compose -f docker-compose.macbook-dockerhub.yml up -d --build spring-backend
```

### FastAPI 업데이트

```bash
git -C ../FAST_API pull
docker compose -f docker-compose.macbook-dockerhub.yml up -d --build fastapi
```

### 전체 업데이트

```bash
git pull
git -C ../2TeamFinalProject-BE pull
git -C ../FAST_API pull
docker compose -f docker-compose.macbook-dockerhub.yml up -d --build
```

---

## 11. 트러블슈팅

### 컨테이너가 시작되지 않음

```bash
# 로그 확인
docker logs musicspace-spring-backend
docker logs musicspace-fastapi
docker logs musicspace-db
```

### DB 연결 실패

```bash
# DB healthcheck 상태 확인
docker inspect musicspace-db | grep -A5 Health

# DB 직접 접속
docker exec -it musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db
```

### 포트 충돌 (Address already in use)

```bash
# 사용 중인 프로세스 확인
lsof -i :80
lsof -i :443

# 기존 컨테이너 강제 삭제 후 재시작
docker rm -f musicspace-frontend
docker compose -f docker-compose.macbook-dockerhub.yml up -d --build frontend
```

### npm run build 실패 (dist/images 권한 오류)

`vite.config.ts`에 `emptyOutDir: false` 설정이 되어 있어야 합니다.
Docker bind mount로 `public/images`가 `html/images`에 마운트될 때 dist 내부 디렉토리와 충돌하는 문제를 방지합니다.

### FastAPI 모델 로딩 실패

```bash
docker logs musicspace-fastapi | grep ERROR

# 모델 파일 존재 확인
docker exec musicspace-fastapi ls /app/M2/tfidf_gbr_models.pkl
docker exec musicspace-fastapi ls /app/M1/audio_predictor.pkl
```

### Tidal 연결 안 됨

1. `.env`에 `TIDAL_CLIENT_ID`, `TIDAL_CLIENT_SECRET` 확인
2. Tidal 개발자 콘솔에서 Redirect URI 등록 확인:
   `https://imapplepie20.tplinkdns.com:8443/tidal-callback`

### macOS 자동 시작 설정

```bash
# launchd plist 생성
cat > ~/Library/LaunchAgents/com.musicspace.docker.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.musicspace.docker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>compose</string>
        <string>-f</string>
        <string>/Users/woosungjo/Team_final_project/humamAppleTeamPreject001/docker-compose.macbook-dockerhub.yml</string>
        <string>up</string>
        <string>-d</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.musicspace.docker.plist
```
