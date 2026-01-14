# Ubuntu Server Deployment Guide

## 2026.01.15 ALPHA TEAM 프로젝트 배포 가이드

---

## 1. 사전 요구사항

Ubuntu 서버에 Node.js와 Nginx가 설치되어 있어야 합니다.

```bash
# Node.js 설치 (20.x LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx 설치
sudo apt-get update
sudo apt-get install -y nginx

# Git 설치 (없는 경우)
sudo apt-get install -y git
```

---

## 2. 프로젝트 배포

### 2.1 GitHub에서 클론

```bash
cd /var/www
sudo git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git alpha-team
cd alpha-team
```

### 2.2 의존성 설치 및 빌드

```bash
sudo npm install
sudo npm run build
```

빌드 완료 후 `dist` 폴더가 생성됩니다.

---

## 3. Nginx 설정

### 3.1 Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/alpha-team
```

아래 내용 입력:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 또는 서버 IP

    root /var/www/alpha-team/dist;
    index index.html;

    # Gzip 압축
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA 라우팅 지원
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 정적 파일 캐싱
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3.2 사이트 활성화

```bash
sudo ln -s /etc/nginx/sites-available/alpha-team /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. 빠른 배포 스크립트

서버에서 직접 실행할 수 있는 일괄 배포 스크립트입니다.

```bash
#!/bin/bash

# deploy.sh
echo "🚀 ALPHA TEAM 배포 시작..."

cd /var/www/alpha-team

# 최신 코드 가져오기
git pull origin main

# 의존성 설치
npm install

# 프로덕션 빌드
npm run build

# Nginx 재시작
sudo systemctl reload nginx

echo "✅ 배포 완료!"
```

스크립트 생성 및 실행:

```bash
cd /var/www/alpha-team
sudo nano deploy.sh
sudo chmod +x deploy.sh
./deploy.sh
```

---

## 5. HTTPS 설정 (Let's Encrypt)

```bash
# Certbot 설치
sudo apt-get install -y certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

---

## 6. 방화벽 설정

```bash
# UFW 활성화
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## 7. 로컬에서 dist 폴더 업로드 (Git 없이)

Windows에서 빌드 후 직접 업로드하는 방법:

```powershell
# PowerShell에서 SCP로 업로드
scp -r dist/* username@your-server:/var/www/alpha-team/dist/
```

---

## 배포 확인

브라우저에서 서버 IP 또는 도메인에 접속하여 확인합니다.

```
http://your-server-ip/
```

---

## 트러블슈팅

### 403 Forbidden
```bash
sudo chown -R www-data:www-data /var/www/alpha-team/dist
sudo chmod -R 755 /var/www/alpha-team/dist
```

### 페이지 새로고침 시 404
Nginx의 `try_files` 설정이 올바른지 확인하세요.

---

## 요약

| 단계 | 명령어 |
|------|--------|
| 클론 | `git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git` |
| 빌드 | `npm install && npm run build` |
| Nginx | `/etc/nginx/sites-available/alpha-team` 설정 |
| 재시작 | `sudo systemctl reload nginx` |
