# Ubuntu Server Deployment Guide

이 가이드는 Ubuntu 서버에 MusicSpace 프로젝트를 배포하는 방법을 설명합니다.
현재 설정에서는 **데이터베이스는 Docker**로, **Node.js 서버는 PM2**로 실행하는 하이브리드 방식을 권장합니다.

## 1. 사전 준비 (Prerequisites)

서버에 접속하여 필수 패키지를 설치합니다.

### 시스템 업데이트 및 도구 설치
```bash
sudo apt update
sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
```

### Docker 설치 (데이터베이스용)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# (로그아웃 후 재접속하여 그룹 적용)
```

### PM2 설치 (서버 무중단 실행용)
```bash
sudo npm install -g pm2
```

## 2. 프로젝트 설정

### Repository Clone
```bash
# git clone https://github.com/YOUR_USERNAME/music-space.git
cd music-space
```

### 환경 변수 설정
`server` 폴더 내에 `.env` 파일을 생성합니다.

```bash
cd server
nano .env
```

**중요**: DB 호스트를 `localhost`로 설정합니다 (Docker가 포트 포워딩을 하므로).
```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=musicspace
DB_PASSWORD=musicspace123
DB_NAME=music_space_db

# API Keys...
TIDAL_CLIENT_ID=...
```

## 3. 데이터베이스 실행 (Docker)

프로젝트 루트에서 데이터베이스 컨테이너를 실행합니다.

```bash
cd ..  # 프로젝트 루트로 이동
docker compose up -d
```

### 데이터 복구 (Dump Import)
기존 데이터 덤프(`music_space_db_dump.sql`)를 복구합니다.

```bash
# 컨테이너 이름: musicspace-db
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < music_space_db_dump.sql
```

## 4. 백엔드 서버 실행

```bash
cd server
npm install
# npm run build  <-- 백엔드는 빌드 과정이 필요 없습니다.
pm2 start src/index.js --name "musicspace-api" --watch
pm2 save
pm2 startup
```

## 5. 프론트엔드 배포 (선택 사항: Nginx)

프론트엔드 빌드 후 Nginx로 서빙합니다.

```bash
# 루트 폴더에서
npm install
npm run build
# dist 폴더가 생성됨
```

Nginx 설정 (`/etc/nginx/sites-available/musicspace`):

```nginx
server {
    listen 80;
    server_name YOUR_IP_OR_DOMAIN;

    # 프론트엔드 정적 파일
    location / {
        root /path/to/music-space/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 백엔드 API 프록시
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```
