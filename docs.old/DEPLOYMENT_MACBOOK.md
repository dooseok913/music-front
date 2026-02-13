# Music Space - MacBook 배포 가이드

## 1. 사전 준비

### 1.1 필수 설치
```bash
# Homebrew 설치 (없는 경우)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Docker Desktop 설치
brew install --cask docker

# Git 설치 (없는 경우)
brew install git
```

### 1.2 Docker Desktop 실행
- Docker Desktop 앱 실행
- 메뉴바에서 Docker 아이콘이 "Docker Desktop is running" 상태인지 확인

---

## 2. 프로젝트 클론

```bash
# 작업 디렉토리 생성
mkdir -p ~/Projects/Final_team_project
cd ~/Projects/Final_team_project

# 프론트엔드 + Docker Compose (메인 프로젝트)
git clone https://github.com/imorangepie20/humamAppleTeamPreject001.git

# FastAPI (AI 엔진)
git clone https://github.com/imorangepie20/FASE_API.git FAST_API

# Spring Boot 백엔드
git clone https://github.com/imorangepie20/2TeamFinalProject-BE.git
```

---

## 3. 디렉토리 구조 확인

```
~/Projects/Final_team_project/
├── humamAppleTeamPreject001/    # 프론트엔드 + Docker Compose
│   ├── docker-compose.yml
│   ├── nginx.conf
│   ├── src/
│   └── server/
├── FAST_API/                    # FastAPI AI 엔진
│   ├── Dockerfile
│   ├── M1/, M2/, M3/
│   └── main.py
└── 2TeamFinalProject-BE/        # Spring Boot 백엔드
    ├── Dockerfile
    └── src/
```

---

## 4. Docker Compose 설정 확인

`humamAppleTeamPreject001/docker-compose.yml`에서 경로 확인:

```yaml
services:
  fastapi:
    build:
      context: ../FAST_API    # FAST_API 폴더 경로
    # ...
    
  spring-backend:
    build:
      context: ../2TeamFinalProject-BE    # Spring Boot 폴더 경로
```

> **중요**: 세 프로젝트가 같은 부모 디렉토리에 있어야 합니다!

---

## 5. 환경 변수 설정 (선택)

### 5.1 Spring Boot 환경 변수
`2TeamFinalProject-BE/src/main/resources/application.yml` 확인:
- DB 연결 정보
- Tidal API 키
- JWT 시크릿

### 5.2 FastAPI 환경 변수
`FAST_API/.env` (필요시 생성):
```env
DB_HOST=db
DB_PORT=3306
DB_USER=musicspace
DB_PASSWORD=musicspace123
DB_NAME=music_space_db
```

---

## 6. 빌드 및 실행

```bash
cd ~/Projects/Final_team_project/humamAppleTeamPreject001

# 전체 빌드 및 실행 (첫 실행 시 시간 소요: 약 10-15분)
docker-compose up -d --build

# 로그 확인
docker-compose logs -f
```

### 6.1 개별 서비스 재시작
```bash
# FastAPI만 재빌드
docker-compose build fastapi --no-cache
docker-compose up -d fastapi

# 프론트엔드만 재빌드
docker-compose build frontend --no-cache
docker-compose up -d frontend
```

---

## 7. 서비스 확인

### 7.1 컨테이너 상태 확인
```bash
docker-compose ps
```

예상 결과:
```
NAME                        STATUS          PORTS
musicspace-db               Up (healthy)    0.0.0.0:3306->3306/tcp
musicspace-redis            Up (healthy)    0.0.0.0:6379->6379/tcp
musicspace-fastapi          Up (healthy)    0.0.0.0:8000->8000/tcp
musicspace-spring-backend   Up (healthy)    0.0.0.0:8080->8080/tcp
musicspace-backend          Up              0.0.0.0:3001->3001/tcp
musicspace-frontend         Up              0.0.0.0:80->80/tcp
```

### 7.2 서비스 URL
| 서비스 | URL | 설명 |
|--------|-----|------|
| 프론트엔드 | http://localhost | 메인 웹 앱 |
| FastAPI Docs | http://localhost:8000/docs | AI API 문서 |
| Spring Boot | http://localhost:8080 | 백엔드 API |
| Node.js Backend | http://localhost:3001 | 크롤링/이미지 서버 |

### 7.3 Health Check
```bash
# FastAPI
curl http://localhost:8000/health

# Spring Boot
curl http://localhost:8080/actuator/health
```

---

## 8. 데이터베이스 확인

```bash
# DB 컨테이너 접속
docker exec -it musicspace-db mysql -u musicspace -pmusicspace123 music_space_db

# 테이블 확인
SHOW TABLES;

# 사용자 확인
SELECT id, email, nickname FROM users;
```

---

## 9. 문제 해결

### 9.1 포트 충돌
```bash
# 사용 중인 포트 확인
lsof -i :80
lsof -i :8000
lsof -i :8080
lsof -i :3306

# 프로세스 종료
kill -9 <PID>
```

### 9.2 컨테이너 로그 확인
```bash
# 전체 로그
docker-compose logs

# 특정 서비스 로그
docker-compose logs fastapi
docker-compose logs spring-backend

# 실시간 로그
docker-compose logs -f fastapi
```

### 9.3 완전 초기화
```bash
# 모든 컨테이너, 이미지, 볼륨 삭제
docker-compose down --rmi all --volumes

# 다시 빌드
docker-compose up -d --build
```

### 9.4 M1/M2 Mac 관련
Apple Silicon (M1/M2/M3) Mac에서는 일부 이미지가 arm64로 빌드됩니다.
문제 발생 시:
```bash
# x86_64 에뮬레이션으로 빌드
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker-compose up -d --build
```

---

## 10. 개발 모드 실행 (선택)

Docker 없이 로컬에서 개발할 경우:

### 10.1 프론트엔드
```bash
cd humamAppleTeamPreject001
npm install
npm run dev
# http://localhost:5173
```

### 10.2 FastAPI
```bash
cd FAST_API
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 10.3 Spring Boot
```bash
cd 2TeamFinalProject-BE
./gradlew bootRun
```

---

## 11. 유용한 명령어 모음

```bash
# 상태 확인
docker-compose ps

# 전체 시작
docker-compose up -d

# 전체 중지
docker-compose down

# 특정 서비스 재시작
docker-compose restart fastapi

# 로그 보기
docker-compose logs -f --tail=100

# 컨테이너 쉘 접속
docker exec -it musicspace-fastapi sh
docker exec -it musicspace-db bash

# 리소스 사용량 확인
docker stats
```

---

## 12. 체크리스트

- [ ] Docker Desktop 실행 중
- [ ] 세 프로젝트 같은 디렉토리에 클론
- [ ] `docker-compose up -d --build` 실행
- [ ] 모든 컨테이너 healthy 상태
- [ ] http://localhost 접속 확인
- [ ] 회원가입 → Tidal 연동 → AI 학습 테스트

---

## 문의

문제 발생 시 로그와 함께 이슈 등록:
- Frontend: https://github.com/imorangepie20/humamAppleTeamPreject001/issues
- FastAPI: https://github.com/imorangepie20/FASE_API/issues
