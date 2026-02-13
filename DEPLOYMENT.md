# Ubuntu Server Deployment Guide (Port-Based)

## 2026.01.15 ALPHA TEAM 프로젝트 배포 가이드

**포트 기반 운영** - `http://서버IP:3000` 형태로 접근

---

## 1. 사전 요구사항

```bash
# Node.js 설치 (20.x LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx 설치
sudo apt-get update
sudo apt-get install -y nginx

# Git 설치
sudo apt-get install -y git
```

---

## 2. 프로젝트 배포

```bash
# 프로젝트 폴더 생성 및 클론
cd /var/www

# 저장소 클론 (레포명과 폴더명이 다른 경우 반드시 폴더명 변경 필요)
# | 저장소 URL                                                        | 클론 후 폴더명              |
# |------------------------------------------------------------------|---------------------------|
# | https://github.com/imorangepie20/humamAppleTeamPreject001.git    | humamAppleTeamPreject001  (그대로) |
# | https://github.com/imorangepie20/2TeamFinalProject-PB.git        | 2TeamFinalProject-BE      (변경)   |
# | https://github.com/imorangepie20/FAST_API-PB.git                 | FAST_API                  (변경)   |

sudo git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git
sudo git clone https://github.com/imorangepie20/2TeamFinalProject-PB.git      2TeamFinalProject-BE
sudo git clone https://github.com/imorangepie20/FAST_API-PB.git               FAST_API

cd humamAppleTeamPreject001
```

### DB 스키마/데이터 및 용량 초과 파일

Git에 포함되지 않는 DB 스키마, 초기 데이터, 대용량 파일은 아래 Google Drive에서 다운로드 후 직접 배치해야 합니다:

> **https://drive.google.com/drive/folders/1CgLZCJ072jbvc2mOgVJF6xkmYFO0spzH?usp=drive_link**

```bash
# 의존성 설치 및 빌드
sudo npm install
sudo npm run build

# 권한 설정
sudo chown -R www-data:www-data dist
sudo chmod -R 755 dist
```

---

## 3. Nginx 포트 기반 설정

### 3.1 포트 3000으로 설정

```bash
sudo nano /etc/nginx/sites-available/alpha-team
```

아래 내용 입력:

```nginx
server {
    listen 3000;
    server_name _;

    root /var/www/alpha-team/dist;
    index index.html;

    # Gzip 압축
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA 라우팅 지원 (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 정적 파일 캐싱
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 에러 페이지
    error_page 404 /index.html;
}
```

### 3.2 사이트 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/alpha-team /etc/nginx/sites-enabled/

# 설정 검증
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

---

## 4. 방화벽 설정 (UFW)

```bash
# 포트 3000 열기
sudo ufw allow 3000/tcp

# 상태 확인
sudo ufw status
```

---

## 5. 접속 확인

브라우저에서 접속:

```
http://서버IP:3000
```

예: `http://192.168.1.100:3000`

---

## 6. 다중 포트 운영 (여러 프로젝트)

여러 프로젝트를 다른 포트로 운영하는 예:

```nginx
# /etc/nginx/sites-available/alpha-team (포트 3000)
server {
    listen 3000;
    root /var/www/alpha-team/dist;
    # ...
}

# /etc/nginx/sites-available/project-b (포트 3001)
server {
    listen 3001;
    root /var/www/project-b/dist;
    # ...
}

# /etc/nginx/sites-available/project-c (포트 3002)
server {
    listen 3002;
    root /var/www/project-c/dist;
    # ...
}
```

---

## 7. 자동 배포 스크립트

```bash
#!/bin/bash
# /var/www/alpha-team/deploy.sh

echo "🚀 ALPHA TEAM 배포 시작..."

cd /var/www/alpha-team
sudo git pull origin main
sudo npm install
sudo npm run build
sudo chown -R www-data:www-data dist
sudo systemctl restart nginx

echo "✅ 배포 완료! http://서버IP:3000 에서 확인"
```

실행:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 8. 시스템 서비스로 등록 (부팅 시 자동 시작)

Nginx는 기본적으로 시스템 부팅 시 자동 시작됩니다:

```bash
# 자동 시작 활성화 확인
sudo systemctl enable nginx

# 상태 확인
sudo systemctl status nginx
```

---

## 빠른 명령어 요약

| 작업 | 명령어 |
|------|--------|
| 클론 | `git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git` |
| 빌드 | `npm install && npm run build` |
| Nginx 설정 | `sudo nano /etc/nginx/sites-available/alpha-team` |
| Nginx 재시작 | `sudo systemctl restart nginx` |
| 포트 열기 | `sudo ufw allow 3000/tcp` |
| 접속 | `http://서버IP:3000` |

---

## 트러블슈팅

### 403 Forbidden
```bash
sudo chown -R www-data:www-data /var/www/alpha-team/dist
sudo chmod -R 755 /var/www/alpha-team/dist
```

### 포트가 열리지 않음
```bash
# 방화벽 확인
sudo ufw status

# Nginx 에러 로그 확인
sudo tail -f /var/log/nginx/error.log
```

### 페이지 새로고침 시 404
Nginx 설정에 `try_files $uri $uri/ /index.html;` 있는지 확인

---

## 최종 확인

```bash
# Nginx 상태
sudo systemctl status nginx

# 포트 리스닝 확인
sudo netstat -tlnp | grep 3000
# 또는
sudo ss -tlnp | grep 3000
```
