#!/usr/bin/env bash
#
# MySQL 외부 접속 허용 — 지정한 IP 한 곳에서만.
#
#   sudo ./deploy/enable-mysql-remote.sh 61.254.166.61
#
# ⚠️ 3306을 인터넷에 여는 것은 위험합니다. 공개된 MySQL은 자동화 봇의 주요 표적이고,
#    비밀번호만으로 버티는 구조가 됩니다.
#
#    MySQL Workbench는 SSH 터널을 기본 지원합니다(Connection Method → Standard TCP/IP over SSH).
#    그 방식은 서버 설정을 아예 안 건드리고 포트도 안 열립니다. 그 편을 먼저 검토하세요.
#    이 스크립트는 그래도 직접 열어야 할 때만 쓰는 용도입니다.
#
# 되돌리기: ./deploy/enable-mysql-remote.sh --revert

set -euo pipefail

CNF=/etc/mysql/mysql.conf.d/mysqld.cnf
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/server/.env"

DB_NAME="${DB_NAME:-anyone_motors}"
DB_USER="${DB_USER:-anyone}"

log() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { echo "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root로 실행하세요. 예: sudo $0 61.254.166.61"

# ── 되돌리기 ────────────────────────────────────────────
if [ "${1:-}" = "--revert" ]; then
  log "bind-address를 127.0.0.1로 되돌리는 중"
  sed -i -E 's/^bind-address[[:space:]]*=.*/bind-address = 127.0.0.1/' "$CNF"
  systemctl restart mysql
  command -v ufw >/dev/null 2>&1 && ufw delete allow 3306/tcp || true
  echo "완료. 외부 접속용으로 만든 MySQL 계정은 아래처럼 직접 지우세요:"
  echo "  sudo mysql -e \"DROP USER '${DB_USER}'@'허용했던IP';\""
  echo "EC2 보안 그룹의 3306 인바운드 규칙도 콘솔에서 지워주세요."
  exit 0
fi

ALLOW_IP="${1:-}"
[ -n "$ALLOW_IP" ] || die "허용할 IP를 인자로 주세요. 예: sudo $0 61.254.166.61"

# 전체 개방은 막는다 — 이 스크립트의 존재 이유가 '한 곳만 여는 것'이다.
case "$ALLOW_IP" in
  '%'|'0.0.0.0'|'0.0.0.0/0'|'::/0')
    die "전체 개방은 이 스크립트로 하지 않습니다. 접속할 사무실의 고정 IP를 지정하세요."
    ;;
esac

[ -f "$ENV_FILE" ] || die "$ENV_FILE 이 없습니다. 서버에서 실행하는 게 맞는지 확인하세요."

# DATABASE_URL="mysql://user:pass@host:3306/db" 에서 비밀번호만 꺼낸다.
# 새로 만드는 외부용 계정도 앱과 같은 비밀번호를 쓰게 해서 관리 포인트를 늘리지 않는다.
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
# .env 값은 따옴표로 감싸여 있을 수 있다 — 앞뒤 한 겹만 벗긴다.
DB_URL="${DB_URL%\"}"; DB_URL="${DB_URL#\"}"
DB_URL="${DB_URL%\'}"; DB_URL="${DB_URL#\'}"
# 호스트 앞 '마지막' @ 를 기준으로 자른다([^@]* 로 하면 비밀번호에 @가 있을 때 잘려나간다).
# 비밀번호가 퍼센트 인코딩(%40 등)돼 있으면 자동 해석이 안 되므로 DB_PASS로 직접 넘기면 된다.
DB_PASS="${DB_PASS:-$(printf '%s' "$DB_URL" | sed -E 's#^mysql://[^:]+:(.*)@[^@]*$#\1#')}"
[ -n "$DB_PASS" ] && [ "$DB_PASS" != "$DB_URL" ] || die "server/.env 의 DATABASE_URL 에서 비밀번호를 읽지 못했습니다. DB_PASS='...' 로 직접 넘겨주세요."
case "$DB_PASS" in
  *%[0-9A-Fa-f][0-9A-Fa-f]*)
    echo "경고: 비밀번호가 퍼센트 인코딩된 것 같습니다. 접속이 안 되면 DB_PASS='실제비밀번호' sudo -E $0 $ALLOW_IP 로 다시 실행하세요." >&2
    ;;
esac

log "MySQL이 외부 인터페이스도 듣도록 설정 ($CNF)"
cp -n "$CNF" "$CNF.bak.$(date +%Y%m%d%H%M%S)" || true
# mysqlx-bind-address 는 건드리면 안 되므로 줄 시작이 정확히 bind-address 인 것만 바꾼다.
if grep -qE '^bind-address' "$CNF"; then
  sed -i -E 's/^bind-address[[:space:]]*=.*/bind-address = 0.0.0.0/' "$CNF"
else
  printf '\nbind-address = 0.0.0.0\n' >> "$CNF"
fi
grep -E '^bind-address' "$CNF"

log "'${DB_USER}'@'${ALLOW_IP}' 계정 생성 / 권한 부여"
mysql <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'${ALLOW_IP}' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'${ALLOW_IP}' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${ALLOW_IP}';
FLUSH PRIVILEGES;
SQL

log "MySQL 재시작"
systemctl restart mysql
systemctl --no-pager --lines=3 status mysql || true

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  log "ufw에 3306 허용 규칙 추가 (${ALLOW_IP} 에서만)"
  ufw allow from "$ALLOW_IP" to any port 3306 proto tcp
fi

cat <<EOF

────────────────────────────────────────────────────────
서버 쪽 설정은 끝났습니다. 남은 건 AWS 콘솔에서 하셔야 합니다:

  EC2 → 인스턴스 → 보안 → 보안 그룹 → 인바운드 규칙 편집
    유형: MySQL/Aurora   포트: 3306
    소스: ${ALLOW_IP}/32      ← 반드시 이 IP만. 0.0.0.0/0 로 열지 마세요.

그다음 Workbench에서:
    Hostname: skv1motors.com    Port: 3306
    Username: ${DB_USER}        Password: (server/.env 의 값)

사무실 공인 IP가 바뀌면 다시 안 붙습니다. 그때는 이 스크립트를 새 IP로 다시 실행하고
보안 그룹 규칙도 함께 바꾸세요.

쓸 일이 끝나면 반드시 닫으세요:  sudo $0 --revert
────────────────────────────────────────────────────────
EOF
