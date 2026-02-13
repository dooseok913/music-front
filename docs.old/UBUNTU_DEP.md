OS: ubuntu
Domain: imaiplan.sytes.net
SSL: OK
project file location: 
/home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001
/home/mibeen/music_space_place/Final_team_project/2TeamFinalProject-BE
/home/mibeen/music_space_place/Final_team_project/FAST_API

빌드 디렉토리
/home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001/dist
----------------------------------------------------------------------------

## 1. 시스템 요구사항

- Ubuntu 20.04+ LTS
- Docker & Docker Compose
- Nginx
- Let's Encrypt SSL 인증서

## 2. Docker 컨테이너 구성

| 컨테이너 | 포트 | 설명 |
|---------|------|------|
| musicspace-frontend | 3000:80 | React 프론트엔드 (Nginx) |
| musicspace-spring-backend | 8080:8080 | Spring Boot API |
| musicspace-fastapi | 8000:8000 | FastAPI AI/ML 서버 |
| musicspace-backend | 3001:3001 | Node.js (Spotify Browser) |
| musicspace-db | 3306:3306 | MariaDB 데이터베이스 |
| musicspace-redis | 6379:6379 | Redis (JWT 토큰) |

## 3. Nginx 설정

### 3.1 설정 파일 복사
```bash
sudo cp imaiplan.sytes.net.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/imaiplan.sytes.net.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 3.2 설정 테스트 및 적용
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3.3 Nginx 프록시 구조
```
클라이언트 (HTTPS:443)
    │
    ▼
Nginx (호스트)
    ├── /           → localhost:3000 (Frontend)
    ├── /api/       → localhost:8080 (Spring Boot)
    ├── /ai/        → localhost:8000 (FastAPI)
    ├── /node/      → localhost:3001 (Node.js)
    ├── /images/    → 정적 파일 서빙
    └── /uploads/   → 정적 파일 서빙
```

## 4. Docker Compose 설정 (우분투용)

### 4.1 포트 변경 (중요!)
`docker-compose.yml`에서 frontend 포트 변경:
```yaml
frontend:
  ports:
    - "3000:80"  # 80:80 → 3000:80 (호스트 Nginx와 충돌 방지)
```

### 4.2 Docker Compose 실행
```bash
cd /home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001
docker-compose up -d --build
```

### 4.3 컨테이너 상태 확인
```bash
docker-compose ps
docker-compose logs -f
```

## 5. 환경 변수 (.env)

```bash
# Database
DB_ROOT_PASSWORD=musicspace123
DB_NAME=music_space_db
DB_USER=musicspace
DB_PASSWORD=musicspace123

# JWT Secret
JWT_SECRET=musicspace_jwt_secret_key_2024

# API Keys (각자 설정)
TIDAL_CLIENT_ID=xxx
TIDAL_CLIENT_SECRET=xxx
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
YOUTUBE_KEY=xxx
```

## 6. SSL 인증서 (Let's Encrypt)

### 6.1 인증서 경로
```
/etc/letsencrypt/live/imaiplan.sytes.net/fullchain.pem
/etc/letsencrypt/live/imaiplan.sytes.net/privkey.pem
```

### 6.2 인증서 갱신
```bash
sudo certbot renew --dry-run
```

## 7. 정적 파일 경로

| 경로 | 위치 |
|------|------|
| /images/ | /home/mibeen/music_space_place/humanAppleTeamPreject001/public/images/ |
| /uploads/ | /home/mibeen/music_space_place/humanAppleTeamPreject001/public/uploads/ |

## 8. Docker Hub 배포 (권장)

### 8.1 Docker Hub 정보
- **Repository**: `johae201/music_space_place`
- **Images**:
  - `johae201/music_space_place:frontend`
  - `johae201/music_space_place:spring-backend`
  - `johae201/music_space_place:fastapi`
  - `johae201/music_space_place:node-backend`

### 8.2 Windows에서 빌드 & 푸시
```batch
# 전체 빌드 & 푸시
docker-build-push.bat all

# 개별 빌드
docker-build-push.bat frontend
docker-build-push.bat spring
docker-build-push.bat fastapi
docker-build-push.bat node
```

### 8.3 Ubuntu에서 배포
```bash
# 방법 1: 스크립트 사용
chmod +x deploy-ubuntu.sh
./deploy-ubuntu.sh

# 방법 2: 수동 배포
cd /home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### 8.4 배포 파일
- `docker-compose.prod.yml` - Ubuntu용 (Docker Hub 이미지 사용)
- `docker-compose.yml` - 로컬 개발용 (빌드 방식)

## 9. 로컬 빌드 배포 (대안)

```bash
# 1. 프로젝트 업데이트
cd /home/mibeen/music_space_place/Final_team_project
git pull origin main

# 2. 프론트엔드 빌드
cd humanAppleTeamPreject001
npm install
npm run build

# 3. Docker 컨테이너 재시작
docker-compose down
docker-compose up -d --build

# 4. Nginx 재시작 (필요시)
sudo systemctl reload nginx
```

## 10. 트러블슈팅

### 10.1 502 Bad Gateway
- Docker 컨테이너 실행 확인: `docker-compose ps`
- 포트 확인: `netstat -tlnp | grep -E '3000|8080|8000|3001'`

### 10.2 DB 연결 오류
- 컨테이너 로그 확인: `docker-compose logs db`
- DB 접속 테스트: `docker exec -it musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db`

### 10.3 SSL 인증서 오류
- 인증서 상태 확인: `sudo certbot certificates`
- Nginx 설정 확인: `sudo nginx -t`

## 11. 유용한 명령어

```bash
# 전체 로그 확인
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f spring-backend

# 컨테이너 재시작
docker-compose restart spring-backend

# DB 백업
docker exec musicspace-db mariadb-dump -u musicspace -pmusicspace123 music_space_db > backup_$(date +%Y%m%d).sql

# DB 복원
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < backup.sql
```