#!/usr/bin/env bash
#
# 배포 스크립트 — EC2에서 실행한다.
#
#   cd ~/anyone-motors && ./deploy.sh
#
# 하는 일: git pull → (변경 시)의존성 설치 → 프론트 빌드·배포 → DB 마이그레이션 → API 빌드·재시작
#
# 옵션:
#   ./deploy.sh --skip-pull     이미 pull 했을 때 건너뛰기
#   ./deploy.sh --front         프론트만 배포
#   ./deploy.sh --api           백엔드만 배포

set -euo pipefail

WEB_ROOT=/var/www/skv1motors
PM2_APP=anyone-api
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

SKIP_PULL=0
DO_FRONT=1
DO_API=1

for arg in "$@"; do
  case "$arg" in
    --skip-pull) SKIP_PULL=1 ;;
    --front) DO_API=0 ;;
    --api) DO_FRONT=0 ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

# root로 실행 중이면 sudo가 없어도 되게
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

# package-lock이 바뀌었을 때만 npm ci를 돌린다(매번 돌리면 1분씩 날아감)
hash_of() { [ -f "$1" ] && sha1sum "$1" | cut -d' ' -f1 || echo none; }

FRONT_LOCK_BEFORE=$(hash_of package-lock.json)
API_LOCK_BEFORE=$(hash_of server/package-lock.json)

if [ "$SKIP_PULL" -eq 0 ]; then
  log "코드 받는 중"
  git pull --ff-only
fi

FRONT_LOCK_AFTER=$(hash_of package-lock.json)
API_LOCK_AFTER=$(hash_of server/package-lock.json)

if [ "$DO_FRONT" -eq 1 ]; then
  if [ "$FRONT_LOCK_BEFORE" != "$FRONT_LOCK_AFTER" ] || [ ! -d node_modules ]; then
    log "프론트 의존성 설치"
    npm ci
  fi

  log "프론트 빌드"
  npm run build

  log "프론트 배포 → $WEB_ROOT"
  $SUDO mkdir -p "$WEB_ROOT"
  if command -v rsync >/dev/null 2>&1; then
    # --delete로 예전 해시 파일이 쌓이지 않게 정리한다
    $SUDO rsync -a --delete dist/ "$WEB_ROOT/"
  else
    $SUDO find "$WEB_ROOT" -mindepth 1 -delete
    $SUDO cp -r dist/. "$WEB_ROOT/"
  fi
  $SUDO chmod -R 755 "$WEB_ROOT"
fi

if [ "$DO_API" -eq 1 ]; then
  cd server

  if [ ! -f .env ]; then
    echo "server/.env 가 없습니다. .env.example 을 복사해 먼저 채워주세요." >&2
    exit 1
  fi

  if [ "$API_LOCK_BEFORE" != "$API_LOCK_AFTER" ] || [ ! -d node_modules ]; then
    log "API 의존성 설치"
    npm ci
  fi

  log "Prisma 클라이언트 생성 / 마이그레이션"
  npx prisma generate
  npx prisma migrate deploy

  log "API 빌드"
  npm run build

  log "API 재시작"
  if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    pm2 restart "$PM2_APP" --update-env
  else
    pm2 start ecosystem.config.js
  fi
  pm2 save >/dev/null

  cd "$ROOT_DIR"
fi

log "완료"
pm2 list 2>/dev/null || true
echo
echo "확인: https://skv1motors.com  (브라우저에서 Ctrl+Shift+R 로 강력 새로고침)"
