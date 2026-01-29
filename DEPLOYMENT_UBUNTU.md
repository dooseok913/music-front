# MusicSpace Ubuntu Server 배포 가이드 (Docker)

## 목차
1. [아키텍처](#1-아키텍처)
2. [사전 요구사항](#2-사전-요구사항)
3. [서버 배포](#3-서버-배포)
4. [컨테이너 관리](#4-컨테이너-관리)
5. [업데이트 배포](#5-업데이트-배포)
6. [방화벽 설정](#6-방화벽-설정)
7. [HTTPS 설정](#7-https-설정-선택)
8. [백업 및 복원](#8-백업-및-복원)
9. [트러블슈팅](#9-트러블슈팅)
10. [모니터링](#10-모니터링)

---

## 1. 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│                      Ubuntu Server + Docker                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│    클라이언트 요청 (80 포트)                                        │
│            │                                                       │
│            ▼                                                       │
│    ┌──────────────┐                                               │
│    │   frontend   │  Nginx (리버스 프록시 + SPA 서빙)               │
│    │   :80        │                                               │
│    └──────┬───────┘                                               │
│           │                                                       │
│    ┌──────┴───────┬─────────────────┐                             │
│    │ /api/*       │ /images/*       │ 그 외                        │
│    ▼              ▼                 ▼                             │
│  ┌──────────────────┐        ┌─────────────┐                      │
│  │     backend      │        │ 정적 파일    │                      │
│  │   (Node.js)      │        │ (React SPA) │                      │
│  │     :3001        │        └─────────────┘                      │
│  └────────┬─────────┘                                             │
│           │                                                       │
│           ▼                                                       │
│    ┌──────────────┐    ┌─────────────────┐                        │
│    │      db      │    │  Volume: images │                        │
│    │  (MariaDB)   │    │  artists/       │                        │
│    │    :3306     │    │  covers/        │                        │
│    └──────────────┘    │  tracks/        │                        │
│                        └─────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

### 컨테이너 구성

| 컨테이너 | 이미지 | 역할 | 포트 |
|----------|--------|------|------|
| musicspace-frontend | nginx:alpine | 리버스 프록시 + React SPA | 80 (외부 노출) |
| musicspace-backend | node:20-alpine | REST API 서버 | 3001 (내부) |
| musicspace-db | mariadb:10.11 | 데이터베이스 | 3306 (내부) |

### 프로젝트 구조

```
humamAppleTeamPreject001/
├── Dockerfile              # 프론트엔드 이미지 (Multi-stage: Node → Nginx)
├── nginx.conf              # Nginx 설정 (프록시, 캐싱, SPA 라우팅)
├── docker-compose.yml      # Docker Compose 설정
├── .env                    # 환경 변수 (직접 생성 필요)
├── .env.docker             # 환경 변수 템플릿
├── music_space_db_dump.sql # 초기 DB 덤프 (자동 import)
├── public/
│   └── images/             # 이미지 저장소 (Volume 마운트)
│       ├── artists/
│       ├── covers/
│       └── tracks/
└── server/
    ├── Dockerfile          # 백엔드 이미지
    └── src/                # Node.js 소스 코드
```

---

## 2. 사전 요구사항

### 2.1 서버 사양 (권장)
- **OS**: Ubuntu 22.04 LTS 이상
- **RAM**: 최소 2GB (권장 4GB)
- **Storage**: 최소 20GB
- **네트워크**: 80 포트 개방

### 2.2 Docker 설치

```bash
# 1. 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 2. 필요 패키지 설치
sudo apt install -y ca-certificates curl gnupg lsb-release

# 3. Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 4. 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker $USER

# 5. 그룹 변경 적용 (재로그인 또는 아래 명령어)
newgrp docker

# 6. Docker Compose 설치 확인 (Docker 20.10+ 기본 포함)
docker compose version

# 7. 설치 확인
docker --version          # Docker version 24.x.x 이상
docker compose version    # Docker Compose version v2.x.x 이상
```

---

## 3. 서버 배포

### 3.1 프로젝트 클론

```bash
# 홈 디렉토리에서 작업
cd ~

# Git 설치 (없는 경우)
sudo apt install -y git

# 프로젝트 클론
git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git

# 프로젝트 디렉토리 이동
cd humamAppleTeamPreject001
```

### 3.2 환경 변수 설정

```bash
# 템플릿 복사
cp .env.docker .env

# 편집
nano .env
```

**.env 파일 내용** (아래 값들을 실제 값으로 변경):

```env
# ===== Database =====
DB_ROOT_PASSWORD=강력한_루트_비밀번호_설정
DB_NAME=music_space_db
DB_USER=musicspace
DB_PASSWORD=강력한_DB_비밀번호_설정

# ===== JWT (필수 변경!) =====
# 생성 명령어: openssl rand -base64 32
JWT_SECRET=여기에_랜덤_시크릿_키_입력

# ===== API Keys =====
# Tidal API
TIDAL_CLIENT_ID=your_tidal_client_id
TIDAL_CLIENT_SECRET=your_tidal_client_secret

# Spotify API (https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# YouTube Data API (https://console.cloud.google.com)
YOUTUBE_KEY=your_youtube_api_key

# Last.fm API (https://www.last.fm/api)
LASTFM_API_KEY=your_lastfm_api_key
```

> **주의**: `.env` 파일은 절대 Git에 커밋하지 마세요!

### 3.3 이미지 디렉토리 준비

```bash
# 이미지 디렉토리 생성 (없는 경우)
mkdir -p public/images/{artists,covers,tracks}

# 권한 설정
chmod -R 755 public/images
```

### 3.4 Docker 빌드 및 실행

```bash
# 전체 스택 빌드 및 실행 (백그라운드)
docker compose up -d --build
```

빌드 시간: 약 2-5분 (네트워크 속도에 따라 다름)

### 3.5 실행 확인

```bash
# 컨테이너 상태 확인 (3개 모두 running/healthy 상태여야 함)
docker compose ps

# 예상 출력:
# NAME                  STATUS                   PORTS
# musicspace-db         running (healthy)        3306/tcp
# musicspace-backend    running                  3001/tcp
# musicspace-frontend   running                  0.0.0.0:80->80/tcp
```

```bash
# API 헬스체크
curl http://localhost/api/health
# 예상 출력: {"status":"ok","timestamp":"..."}

# 또는 브라우저에서 접속
# http://서버_IP_주소
```

---

## 4. 컨테이너 관리

### 4.1 기본 명령어

| 작업 | 명령어 |
|------|--------|
| 전체 시작 | `docker compose up -d` |
| 전체 중지 | `docker compose down` |
| 전체 재시작 | `docker compose restart` |
| 상태 확인 | `docker compose ps` |
| 전체 로그 | `docker compose logs -f` |
| 최근 로그 | `docker compose logs --tail=100` |

### 4.2 개별 서비스 관리

```bash
# 특정 서비스 재시작
docker compose restart frontend
docker compose restart backend
docker compose restart db

# 특정 서비스 로그 확인
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f db

# 특정 서비스만 재빌드
docker compose up -d --build frontend
docker compose up -d --build backend
```

### 4.3 컨테이너 내부 접속

```bash
# 백엔드 셸 접속
docker compose exec backend sh

# DB 직접 접속
docker compose exec db mysql -u musicspace -p music_space_db
# 비밀번호 입력 후 접속

# Nginx 설정 확인
docker compose exec frontend cat /etc/nginx/nginx.conf
```

---

## 5. 업데이트 배포

### 5.1 일반 업데이트

```bash
cd ~/humamAppleTeamPreject001

# 최신 코드 가져오기
git pull origin main

# 재빌드 및 재시작
docker compose up -d --build
```

### 5.2 프론트엔드만 업데이트

```bash
git pull origin main
docker compose up -d --build frontend
```

### 5.3 백엔드만 업데이트

```bash
git pull origin main
docker compose up -d --build backend
```

### 5.4 환경변수 변경 시

```bash
# .env 파일 수정 후
nano .env

# 컨테이너 재생성 (환경변수 적용)
docker compose up -d
```

---

## 6. 방화벽 설정

```bash
# UFW 설치 및 활성화
sudo apt install -y ufw
sudo ufw enable

# 필수 포트 개방
sudo ufw allow ssh       # SSH (22)
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (SSL 사용 시)

# 상태 확인
sudo ufw status

# 예상 출력:
# Status: active
# To                         Action      From
# --                         ------      ----
# 22/tcp                     ALLOW       Anywhere
# 80/tcp                     ALLOW       Anywhere
# 443/tcp                    ALLOW       Anywhere
```

---

## 7. HTTPS 설정 (선택)

### 7.1 도메인 연결 시 Let's Encrypt SSL

```bash
# Certbot 설치
sudo apt install -y certbot

# 인증서 발급 (프론트엔드 잠시 중지)
docker compose stop frontend
sudo certbot certonly --standalone -d your-domain.com

# 인증서 위치
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 7.2 nginx.conf HTTPS 설정

SSL 사용 시 `nginx.conf` 수정이 필요합니다. 별도 가이드 참조.

---

## 8. 백업 및 복원

### 8.1 데이터베이스 백업

```bash
# 백업 (날짜 포함 파일명)
docker compose exec db mysqldump -u musicspace -p'비밀번호' music_space_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 백업 파일 확인
ls -la backup_*.sql
```

### 8.2 데이터베이스 복원

```bash
# 복원
docker compose exec -T db mysql -u musicspace -p'비밀번호' music_space_db < backup_20260129.sql
```

### 8.3 이미지 백업

```bash
# 이미지 폴더 압축 백업
tar -czf images_backup_$(date +%Y%m%d).tar.gz ./public/images/

# 복원
tar -xzf images_backup_20260129.tar.gz
```

### 8.4 자동 백업 스크립트

```bash
# 백업 스크립트 생성
cat > ~/backup_musicspace.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# DB 백업
cd ~/humamAppleTeamPreject001
docker compose exec -T db mysqldump -u musicspace -p'비밀번호' music_space_db > $BACKUP_DIR/db_$DATE.sql

# 이미지 백업
tar -czf $BACKUP_DIR/images_$DATE.tar.gz ./public/images/

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x ~/backup_musicspace.sh

# 크론잡 등록 (매일 새벽 3시 실행)
(crontab -l 2>/dev/null; echo "0 3 * * * ~/backup_musicspace.sh >> ~/backup.log 2>&1") | crontab -
```

---

## 9. 트러블슈팅

### 9.1 컨테이너가 시작되지 않음

```bash
# 로그 확인
docker compose logs

# 특정 컨테이너 로그
docker compose logs db
docker compose logs backend
docker compose logs frontend

# 완전 재시작
docker compose down
docker compose up -d --build
```

### 9.2 502 Bad Gateway

```bash
# 백엔드 상태 확인
docker compose ps backend
docker compose logs backend --tail=50

# 백엔드 재시작
docker compose restart backend
```

### 9.3 DB 연결 실패

```bash
# DB 상태 확인 (healthy 상태여야 함)
docker compose ps db

# DB 로그 확인
docker compose logs db --tail=50

# DB 컨테이너 재시작
docker compose restart db

# DB가 healthy 상태가 될 때까지 대기 후 백엔드 재시작
docker compose restart backend
```

### 9.4 포트 80 충돌

```bash
# 80번 포트 사용 프로세스 확인
sudo lsof -i :80

# Apache 사용 중인 경우
sudo systemctl stop apache2
sudo systemctl disable apache2

# 기존 Nginx 사용 중인 경우
sudo systemctl stop nginx
sudo systemctl disable nginx

# Docker 재시작
docker compose up -d
```

### 9.5 이미지가 표시되지 않음

```bash
# 이미지 디렉토리 확인
ls -la ./public/images/

# 컨테이너 내부 이미지 확인
docker compose exec backend ls -la /app/public/images/

# 권한 문제 시
sudo chown -R $USER:$USER ./public/images/
chmod -R 755 ./public/images/

# 백엔드 재시작
docker compose restart backend
```

### 9.6 메모리 부족

```bash
# 메모리 사용량 확인
docker stats --no-stream

# 미사용 리소스 정리
docker system prune -a -f

# 스왑 메모리 추가 (RAM이 부족한 경우)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 9.7 컨테이너 완전 초기화

```bash
# 모든 컨테이너, 볼륨, 이미지 삭제 (주의: 데이터 손실)
docker compose down -v --rmi all

# 재빌드
docker compose up -d --build
```

---

## 10. 모니터링

### 10.1 리소스 사용량

```bash
# 실시간 모니터링
docker stats

# 한 번만 확인
docker stats --no-stream
```

### 10.2 디스크 사용량

```bash
# Docker 디스크 사용량
docker system df

# 미사용 리소스 정리
docker system prune -f
```

### 10.3 로그 용량 관리

```bash
# Docker 로그 파일 위치 확인
docker inspect --format='{{.LogPath}}' musicspace-backend

# 로그 용량 확인
sudo du -sh /var/lib/docker/containers/*/
```

---

## 빠른 시작 체크리스트

```bash
# 1. Docker 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2. 프로젝트 클론
cd ~ && git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git
cd humamAppleTeamPreject001

# 3. 환경변수 설정
cp .env.docker .env
nano .env  # API 키, 비밀번호 설정

# 4. 이미지 디렉토리 준비
mkdir -p public/images/{artists,covers,tracks}

# 5. 빌드 및 실행
docker compose up -d --build

# 6. 확인
docker compose ps
curl http://localhost/api/health

# 7. 방화벽 설정
sudo ufw allow 80/tcp
```

---

## 배포 완료 체크리스트

- [ ] Docker & Docker Compose 설치 완료
- [ ] 프로젝트 클론 완료
- [ ] `.env` 파일 생성 및 설정 완료
- [ ] `docker compose up -d --build` 실행 완료
- [ ] 모든 컨테이너 running 상태 확인
- [ ] `curl http://localhost/api/health` 응답 확인
- [ ] 브라우저에서 `http://서버IP` 접속 확인
- [ ] 방화벽 80 포트 개방 완료
- [ ] 백업 스크립트 설정 (선택)

---

**문서 버전**: 3.0
**최종 수정일**: 2026-01-29
**Docker Compose 버전**: 3.8
**테스트 환경**: Ubuntu 22.04 LTS, Docker 24.x
