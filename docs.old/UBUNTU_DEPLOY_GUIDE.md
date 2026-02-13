# MusicSpace Ubuntu 배포 가이드

## 서버 정보
- **OS**: Ubuntu 20.04+ LTS
- **Domain**: imaiplan.sytes.net
- **SSL**: Let's Encrypt
- **배포 경로**: `/home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001`

---

## 1. 사전 준비 (Ubuntu)

### 1.1 Docker 설치 확인
```bash
docker --version
docker compose version
```

### 1.2 호스트 서비스 중지 (필수)
Docker 컨테이너와 포트 충돌 방지:
```bash
sudo systemctl stop nginx
sudo systemctl stop redis-server
sudo systemctl stop mariadb
sudo systemctl stop mysql

# 영구 비활성화 (선택)
sudo systemctl disable nginx redis-server mariadb mysql
```

### 1.3 SSL 인증서 확인
```bash
sudo certbot certificates
# 인증서 경로: /etc/letsencrypt/live/imaiplan.sytes.net/
```

---

## 2. 프로젝트 구조

```
humanAppleTeamPreject001/
├── docker-compose.prod.yml    # Ubuntu 배포용
├── nginx-docker/
│   └── nginx.conf             # Nginx SSL 설정
├── docs/
│   └── dbSchema.sql           # DB 초기화 스크립트
├── public/
│   ├── images/                # 정적 이미지
│   └── uploads/               # 업로드 파일
└── .env                       # 환경 변수 (선택)
```

---

## 3. Docker 컨테이너 구성

| 컨테이너 | 이미지 | 내부 포트 | 외부 포트 | 설명 |
|---------|--------|----------|----------|------|
| musicspace-nginx | nginx:alpine | 80, 443 | 80, 443 | SSL 리버스 프록시 |
| musicspace-frontend | johae201/music_space_place:frontend | 80 | - | React 앱 |
| musicspace-spring-backend | johae201/music_space_place:spring-backend | 8080 | - | Spring Boot API |
| musicspace-fastapi | johae201/music_space_place:fastapi | 8000 | - | AI/ML 서버 |
| musicspace-backend | johae201/music_space_place:node-backend | 3001 | - | Node.js (Spotify) |
| musicspace-db | mariadb:10.11 | 3306 | 3306 | MariaDB |
| musicspace-redis | redis:7-alpine | 6379 | 6379 | Redis (JWT) |

---

## 4. 배포 순서

### 4.1 프로젝트 클론/업데이트
```bash
cd /home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001
git pull origin main
```

### 4.2 필수 폴더 생성
```bash
mkdir -p public/images public/uploads nginx-docker
```

### 4.3 nginx.conf 확인
`nginx-docker/nginx.conf` 파일이 있는지 확인:
```bash
cat nginx-docker/nginx.conf
```

없으면 생성 (아래 내용 복사):
```bash
cat > nginx-docker/nginx.conf << 'EOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    client_max_body_size 50M;
    sendfile on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    server {
        listen 80;
        server_name imaiplan.sytes.net;
        location / { return 301 https://$server_name$request_uri; }
    }

    server {
        listen 443 ssl http2;
        server_name imaiplan.sytes.net;

        ssl_certificate /etc/letsencrypt/live/imaiplan.sytes.net/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/imaiplan.sytes.net/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        location / {
            proxy_pass http://frontend:80;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/ {
            proxy_pass http://spring-backend:8080;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }

        location /ai/ {
            proxy_pass http://fastapi:8000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 600s;
        }

        location /node/ {
            proxy_pass http://backend:3001/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF
```

### 4.4 기존 컨테이너 정리
```bash
docker compose -f docker-compose.prod.yml down
docker rm -f $(docker ps -aq) 2>/dev/null || true
```

### 4.5 이미지 Pull
```bash
docker compose -f docker-compose.prod.yml pull
```

### 4.6 컨테이너 시작
```bash
docker compose -f docker-compose.prod.yml up -d
```

### 4.7 상태 확인
```bash
docker compose -f docker-compose.prod.yml ps
```

모든 컨테이너가 `Up` 상태인지 확인.

---

## 5. DB 스키마 확인

### 5.1 테이블 확인
```bash
docker exec musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db -e "SHOW TABLES;"
```

### 5.2 users 테이블 스키마 확인
```bash
docker exec musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db -e "DESCRIBE users;"
```

**필수 컬럼:**
- `user_role`: `ENUM('MASTER','ADMIN','USER')`
- `user_grade`: `VARCHAR(10)` DEFAULT '5'

### 5.3 스키마 수정 (필요시)
```bash
docker exec musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db -e "
ALTER TABLE users MODIFY COLUMN user_role ENUM('MASTER','ADMIN','USER') NOT NULL DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_grade VARCHAR(10) DEFAULT '5';
"
```

---

## 6. 트러블슈팅

### 6.1 포트 충돌
```bash
# 사용 중인 포트 확인
sudo netstat -tlnp | grep -E ':80|:443|:3306|:6379'

# 프로세스 종료
sudo fuser -k 80/tcp
sudo fuser -k 443/tcp
sudo fuser -k 3306/tcp
sudo fuser -k 6379/tcp
```

### 6.2 컨테이너 로그 확인
```bash
# 전체 로그
docker compose -f docker-compose.prod.yml logs -f

# 개별 서비스 로그
docker logs musicspace-spring-backend --tail 100
docker logs musicspace-nginx --tail 50
```

### 6.3 Spring Boot 크래시
```bash
# 로그 확인
docker logs musicspace-spring-backend

# 일반적인 원인:
# - DB 연결 실패: db 컨테이너 상태 확인
# - user_grade 컬럼 없음: 5.3 참고
# - user_role에 MASTER 없음: 5.3 참고
```

### 6.4 502 Bad Gateway
```bash
# 백엔드 컨테이너 상태 확인
docker ps

# nginx 로그 확인
docker logs musicspace-nginx
```

### 6.5 컨테이너 재시작
```bash
docker compose -f docker-compose.prod.yml restart spring-backend
```

---

## 7. 유용한 명령어

```bash
# 전체 재시작
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d

# DB 백업
docker exec musicspace-db mariadb-dump -u musicspace -pmusicspace123 music_space_db > backup_$(date +%Y%m%d).sql

# DB 복원
docker exec -i musicspace-db mariadb -u musicspace -pmusicspace123 music_space_db < backup.sql

# 볼륨 초기화 (주의: 데이터 삭제됨)
docker compose -f docker-compose.prod.yml down -v
```

---

## 8. 빠른 배포 스크립트

`deploy.sh`:
```bash
#!/bin/bash
set -e

cd /home/mibeen/music_space_place/Final_team_project/humanAppleTeamPreject001

echo "=== 호스트 서비스 중지 ==="
sudo systemctl stop nginx redis-server mariadb mysql 2>/dev/null || true

echo "=== Git Pull ==="
git pull

echo "=== Docker 배포 ==="
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo "=== 상태 확인 ==="
sleep 10
docker compose -f docker-compose.prod.yml ps

echo "=== 완료 ==="
echo "Site: https://imaiplan.sytes.net"
```

실행:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 9. 체크리스트

배포 전:
- [ ] 호스트 nginx 중지됨
- [ ] 호스트 redis-server 중지됨
- [ ] 호스트 mariadb/mysql 중지됨
- [ ] SSL 인증서 존재 (/etc/letsencrypt/live/imaiplan.sytes.net/)
- [ ] nginx-docker/nginx.conf 존재

배포 후:
- [ ] 모든 컨테이너 Up 상태
- [ ] https://imaiplan.sytes.net 접속 가능
- [ ] 로그인 동작
- [ ] API 호출 정상 (/api/...)
