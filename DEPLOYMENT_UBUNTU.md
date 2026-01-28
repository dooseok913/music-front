# MusicSpace Ubuntu Server 배포 가이드

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Ubuntu Server                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Nginx     │    │   Node.js   │    │   MariaDB   │     │
│  │  (Port 80)  │───▶│  (Port 3001)│───▶│ (Port 3306) │     │
│  │  Frontend   │    │   Backend   │    │   Database  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│        │                   │                               │
│        │         ┌─────────┴─────────┐                     │
│        │         │  /public/images/  │                     │
│        └────────▶│  artists/covers/  │                     │
│                  │     tracks/       │                     │
│                  └───────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

**포트 구성:**
- `80` - Nginx (프론트엔드 + 리버스 프록시)
- `3001` - Node.js 백엔드 API
- `3306` - MariaDB 데이터베이스

---

## 1. 시스템 요구사항

- Ubuntu 22.04 LTS 이상
- RAM: 최소 2GB (권장 4GB)
- 디스크: 최소 20GB
- Node.js 20.x
- MariaDB 10.11+
- Nginx

---

## 2. 기본 패키지 설치

```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 필수 패키지 설치
sudo apt install -y curl wget git build-essential

# Node.js 20.x 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Node.js 버전 확인
node -v  # v20.x.x
npm -v   # 10.x.x

# Nginx 설치
sudo apt install -y nginx

# MariaDB 설치
sudo apt install -y mariadb-server mariadb-client

# PM2 설치 (Node.js 프로세스 매니저)
sudo npm install -g pm2
```

---

## 3. MariaDB 설정

### 3.1 보안 설정

```bash
# MariaDB 보안 설정
sudo mysql_secure_installation
```

프롬프트 응답:
- Enter current password for root: (Enter 키)
- Switch to unix_socket authentication: `n`
- Change the root password: `Y` → 비밀번호 설정
- Remove anonymous users: `Y`
- Disallow root login remotely: `Y`
- Remove test database: `Y`
- Reload privilege tables: `Y`

### 3.2 데이터베이스 및 사용자 생성

```bash
sudo mysql -u root -p
```

```sql
-- 데이터베이스 생성
CREATE DATABASE music_space_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 사용자 생성 및 권한 부여
CREATE USER 'musicspace'@'localhost' IDENTIFIED BY 'your_secure_password_here';
GRANT ALL PRIVILEGES ON music_space_db.* TO 'musicspace'@'localhost';
FLUSH PRIVILEGES;

-- 확인
SHOW DATABASES;
SELECT User, Host FROM mysql.user;

EXIT;
```

### 3.3 데이터베이스 스키마 및 데이터 가져오기

```bash
# 프로젝트 클론 후 덤프 파일로 복원
mysql -u musicspace -p music_space_db < /var/www/musicspace/music_space_db_dump.sql
```

---

## 4. 프로젝트 배포

### 4.1 프로젝트 클론

```bash
# 배포 디렉토리 생성
sudo mkdir -p /var/www/musicspace
cd /var/www

# Git 클론
sudo git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git musicspace
cd musicspace

# 권한 설정
sudo chown -R $USER:$USER /var/www/musicspace
```

### 4.2 프론트엔드 빌드

```bash
cd /var/www/musicspace

# 의존성 설치
npm install

# 프로덕션 빌드
npm run build

# 빌드 결과 확인
ls -la dist/
```

### 4.3 백엔드 설정

```bash
cd /var/www/musicspace/server

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
nano .env
```

**.env 파일 내용:**

```env
# Server
PORT=3001

# Database (MariaDB)
DB_HOST=localhost
DB_PORT=3306
DB_USER=musicspace
DB_PASSWORD=your_secure_password_here
DB_NAME=music_space_db

# JWT Secret (랜덤 문자열 생성: openssl rand -base64 32)
JWT_SECRET=your_jwt_secret_here

# Tidal API
TIDAL_CLIENT_ID=your_tidal_client_id
TIDAL_CLIENT_SECRET=your_tidal_client_secret

# Spotify API
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# YouTube API
YOUTUBE_KEY=your_youtube_api_key

# Last.fm API
LASTFM_API_KEY=your_lastfm_api_key
```

### 4.4 이미지 디렉토리 권한 설정

```bash
# 이미지 디렉토리 권한
sudo chown -R $USER:www-data /var/www/musicspace/public/images
sudo chmod -R 775 /var/www/musicspace/public/images
```

---

## 5. PM2로 백엔드 실행

### 5.1 PM2 설정 파일 생성

```bash
nano /var/www/musicspace/ecosystem.config.cjs
```

```javascript
module.exports = {
  apps: [{
    name: 'musicspace-api',
    cwd: '/var/www/musicspace/server',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/var/log/pm2/musicspace-error.log',
    out_file: '/var/log/pm2/musicspace-out.log',
    log_file: '/var/log/pm2/musicspace-combined.log',
    time: true
  }]
};
```

### 5.2 PM2 실행

```bash
# 로그 디렉토리 생성
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# PM2 시작
cd /var/www/musicspace
pm2 start ecosystem.config.cjs

# 상태 확인
pm2 status
pm2 logs musicspace-api

# 시스템 부팅 시 자동 시작
pm2 startup
pm2 save
```

### 5.3 PM2 주요 명령어

```bash
pm2 status              # 상태 확인
pm2 logs musicspace-api # 로그 확인
pm2 restart musicspace-api  # 재시작
pm2 stop musicspace-api     # 중지
pm2 delete musicspace-api   # 삭제
pm2 monit               # 모니터링 대시보드
```

---

## 6. Nginx 설정

### 6.1 Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/musicspace
```

```nginx
server {
    listen 80;
    server_name your_domain.com;  # 또는 서버 IP

    # 프론트엔드 정적 파일
    root /var/www/musicspace/dist;
    index index.html;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # API 프록시 (백엔드)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # 이미지 정적 파일 (백엔드에서 서빙)
    location /images/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # 이미지 캐싱
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # 정적 파일 캐싱 (프론트엔드 빌드 파일)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA 라우팅 (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 에러 페이지
    error_page 404 /index.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

### 6.2 사이트 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/musicspace /etc/nginx/sites-enabled/

# 기본 사이트 비활성화 (선택)
sudo rm /etc/nginx/sites-enabled/default

# 설정 검증
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 7. 방화벽 설정

```bash
# UFW 활성화
sudo ufw enable

# 포트 허용
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 상태 확인
sudo ufw status verbose
```

---

## 8. SSL 인증서 (HTTPS) - 선택사항

### Let's Encrypt 무료 SSL

```bash
# Certbot 설치
sudo apt install -y certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d your_domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

---

## 9. 배포 자동화 스크립트

```bash
nano /var/www/musicspace/deploy.sh
```

```bash
#!/bin/bash
set -e

echo "=========================================="
echo "  MusicSpace 배포 시작"
echo "=========================================="

cd /var/www/musicspace

# Git 업데이트
echo "📥 Git pull..."
git pull origin main

# 프론트엔드 빌드
echo "🔨 프론트엔드 빌드..."
npm install
npm run build

# 백엔드 업데이트
echo "📦 백엔드 의존성 설치..."
cd server
npm install
cd ..

# PM2 재시작
echo "🔄 백엔드 재시작..."
pm2 restart musicspace-api

# Nginx 재시작
echo "🔄 Nginx 재시작..."
sudo systemctl reload nginx

echo "=========================================="
echo "  ✅ 배포 완료!"
echo "=========================================="
echo "  프론트엔드: http://서버IP"
echo "  API 헬스체크: http://서버IP/api/health"
echo "=========================================="
```

```bash
chmod +x /var/www/musicspace/deploy.sh
```

---

## 10. 헬스체크 및 모니터링

### 10.1 서비스 상태 확인

```bash
# 모든 서비스 상태 확인
echo "=== Nginx ===" && sudo systemctl status nginx --no-pager
echo "=== MariaDB ===" && sudo systemctl status mariadb --no-pager
echo "=== PM2 ===" && pm2 status
```

### 10.2 API 헬스체크

```bash
curl http://localhost/api/health
# 예상 응답: {"status":"ok","timestamp":"2026-01-28T..."}
```

### 10.3 로그 확인

```bash
# Nginx 접근 로그
sudo tail -f /var/log/nginx/access.log

# Nginx 에러 로그
sudo tail -f /var/log/nginx/error.log

# PM2 로그
pm2 logs musicspace-api --lines 100

# MariaDB 로그
sudo tail -f /var/log/mysql/error.log
```

---

## 11. 트러블슈팅

### 문제: 502 Bad Gateway

```bash
# PM2 상태 확인
pm2 status

# 백엔드가 실행 중인지 확인
curl http://localhost:3001/api/health

# PM2 재시작
pm2 restart musicspace-api
```

### 문제: 403 Forbidden

```bash
# 권한 확인 및 수정
sudo chown -R www-data:www-data /var/www/musicspace/dist
sudo chmod -R 755 /var/www/musicspace/dist
```

### 문제: 이미지가 안 보임

```bash
# 이미지 디렉토리 확인
ls -la /var/www/musicspace/public/images/

# 권한 수정
sudo chown -R $USER:www-data /var/www/musicspace/public/images
sudo chmod -R 775 /var/www/musicspace/public/images

# Nginx 재시작
sudo systemctl restart nginx
```

### 문제: DB 연결 실패

```bash
# MariaDB 상태 확인
sudo systemctl status mariadb

# 연결 테스트
mysql -u musicspace -p -e "SELECT 1;"

# .env 파일 확인
cat /var/www/musicspace/server/.env | grep DB_
```

### 문제: 포트가 이미 사용 중

```bash
# 포트 사용 확인
sudo lsof -i :3001
sudo lsof -i :80

# 프로세스 종료
sudo kill -9 <PID>
```

---

## 12. 백업

### 12.1 데이터베이스 백업

```bash
# 백업 스크립트
nano /var/www/musicspace/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/musicspace"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# DB 백업
mysqldump -u musicspace -p'your_password' music_space_db > $BACKUP_DIR/db_$DATE.sql

# 이미지 백업
tar -czf $BACKUP_DIR/images_$DATE.tar.gz /var/www/musicspace/public/images/

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -type f -mtime +7 -delete

echo "백업 완료: $DATE"
```

```bash
chmod +x /var/www/musicspace/backup.sh

# 크론탭에 등록 (매일 새벽 3시)
crontab -e
# 추가: 0 3 * * * /var/www/musicspace/backup.sh >> /var/log/musicspace-backup.log 2>&1
```

---

## 13. 빠른 명령어 요약

| 작업 | 명령어 |
|------|--------|
| 전체 배포 | `./deploy.sh` |
| PM2 상태 | `pm2 status` |
| PM2 로그 | `pm2 logs musicspace-api` |
| PM2 재시작 | `pm2 restart musicspace-api` |
| Nginx 재시작 | `sudo systemctl restart nginx` |
| MariaDB 재시작 | `sudo systemctl restart mariadb` |
| 에러 로그 | `sudo tail -f /var/log/nginx/error.log` |
| API 테스트 | `curl http://localhost/api/health` |
| DB 접속 | `mysql -u musicspace -p music_space_db` |

---

## 14. 최종 체크리스트

- [ ] Node.js 20.x 설치됨
- [ ] MariaDB 설치 및 보안 설정 완료
- [ ] 데이터베이스 및 사용자 생성됨
- [ ] DB 덤프 파일 복원됨
- [ ] 프로젝트 클론됨
- [ ] 프론트엔드 빌드 완료
- [ ] 백엔드 .env 설정됨
- [ ] PM2로 백엔드 실행 중
- [ ] Nginx 설정 완료
- [ ] 방화벽 포트 열림 (80, 443)
- [ ] 헬스체크 응답 확인
- [ ] 이미지 로딩 확인
- [ ] (선택) SSL 인증서 설치됨

---

**작성일:** 2026-01-28
**버전:** 1.0
