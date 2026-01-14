#!/bin/bash

# ALPHA TEAM Deployment Script
# 사용법: ./deploy.sh

echo "🚀 ALPHA TEAM 배포 시작..."
echo "================================"

# 변수 설정
APP_DIR="/var/www/alpha-team"
REPO_URL="https://github.com/imorangepie20/humamAppleTeamPreject001.git"

# 폴더 확인 및 생성
if [ ! -d "$APP_DIR" ]; then
    echo "📁 앱 디렉토리 생성..."
    sudo mkdir -p $APP_DIR
    cd /var/www
    sudo git clone $REPO_URL alpha-team
fi

cd $APP_DIR

# 최신 코드 가져오기
echo "📥 최신 코드 가져오기..."
sudo git pull origin main

# 의존성 설치
echo "📦 의존성 설치..."
sudo npm install

# 프로덕션 빌드
echo "🔨 프로덕션 빌드..."
sudo npm run build

# 권한 설정
echo "🔐 권한 설정..."
sudo chown -R www-data:www-data dist
sudo chmod -R 755 dist

# Nginx 설정 확인 및 재시작
echo "🔄 Nginx 재시작..."
sudo nginx -t && sudo systemctl reload nginx

echo "================================"
echo "✅ 배포 완료!"
echo "🌐 http://your-server-ip/ 에서 확인하세요."
