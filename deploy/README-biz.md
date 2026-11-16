# biz.carvior.store 올리기 — 체크리스트

carvior.store 상자에 **서브도메인으로** 올린다. 그 상자에는 이미 네 개가 돌고 있다 —
`carvior-web` · `chavata-admin` · `chavata-api` · `classify-api`. 새 서비스를 끼워 넣는
것이라, 순서대로 확인하고 들어간다.

> ⚠ 애니원모터스 서버(`skv1motors.com`)에는 **올리지 않는다.** 그 서버는 카비어 것이 아니다.

## 먼저 확인할 것 (빠뜨리면 올리다 멈춘다)

```bash
# ① 포트가 비어 있나 — Apache 설정이 3100을 가리킨다
sudo ss -ltnp | grep -E '3100|3000|4000'

# ② 디스크 — 2026-09-28에 pm2 로그 6G + yarn 캐시 4.8G로 꽉 차서
#    목록 API가 500을 뿜은 적이 있다. 새 서비스는 로그를 또 쌓는다.
df -h /
du -sh ~/.pm2/logs 2>/dev/null

# ③ 메모리 — NestJS 하나 + Redis가 더 올라간다
free -m

# ④ Redis가 있나 — carvior-back은 Redis를 쓰지 않으므로 **없을 가능성이 높다**.
#    이 제품은 쓴다(ioredis). 없으면 설치해야 한다.
redis-cli ping 2>/dev/null || echo "Redis 없음 → sudo apt install redis-server"

# ⑤ MySQL — 같은 인스턴스에 DB만 새로 만들면 된다
mysql -e "SHOW DATABASES;" 2>/dev/null | head
```

## 올리는 순서

```bash
# 1. DNS — biz.carvior.store A 레코드를 이 상자 IP로
#    (carvior.store 와 같은 IP. 전파 확인: dig +short biz.carvior.store)

# 2. 코드
cd ~ && git clone <레포 주소> carvior-biz && cd carvior-biz
npm install
cd server && npm install && cd ..

# 3. DB
mysql -e "CREATE DATABASE carvior_biz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER 'carvior_biz'@'localhost' IDENTIFIED BY '<비밀번호>';"
mysql -e "GRANT ALL ON carvior_biz.* TO 'carvior_biz'@'localhost'; FLUSH PRIVILEGES;"

# 4. server/.env — PORT는 Apache 설정(3100)과 **같아야 한다**
cat > server/.env <<'ENV'
DATABASE_URL="mysql://carvior_biz:<비밀번호>@localhost:3306/carvior_biz"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="<충분히 긴 임의 문자열>"
PORT=3100
ENV

# 5. 스키마 — 빈 DB라 migrate deploy 로 한 번에 올라간다
cd server && npx prisma generate && npx prisma migrate deploy && cd ..

# 6. 디렉토리
sudo mkdir -p /var/www/carvior-biz /var/www/carvior-biz-uploads
sudo chown -R $USER:www-data /var/www/carvior-biz-uploads

# 7. Apache
sudo cp deploy/apache-biz.conf /etc/apache2/sites-available/biz-carvior.conf
sudo a2enmod rewrite proxy proxy_http proxy_wstunnel headers
sudo a2ensite biz-carvior
sudo apache2ctl configtest && sudo systemctl reload apache2

# 8. 인증서
sudo certbot --apache -d biz.carvior.store
sudo cp deploy/apache-biz-ssl.conf /etc/apache2/sites-available/biz-carvior-le-ssl.conf
sudo apache2ctl configtest && sudo systemctl reload apache2

# 9. 배포 — WEB_ROOT/PM2_APP 기본값이 carvior-biz 쪽이라 그대로 쓰면 된다
SITE_URL=https://biz.carvior.store ./deploy.sh
```

## 서브도메인과 테넌트 — 지금은 섞지 않는다

제품 구상에는 `{상사}.도메인`으로 상사를 가르는 그림이 있었다. **지금은 하지 않는다.**

- `*.carvior.store` 와일드카드 인증서는 `biz.carvior.store`를 덮지만
  `anyone.biz.carvior.store`는 **못 덮는다** — 와일드카드는 한 단계다.
  두 단계를 쓰려면 `*.biz.carvior.store` 인증서를 따로 받아야 한다.
- 그리고 기능적으로 필요하지 않다. 상사는 **로그인한 직원의 `Employee.tenantId`**로
  이미 갈린다(`jwt.strategy.ts`). 서브도메인은 "우리 상사 프로그램처럼 보이게" 하는
  브랜딩 쪽 이야기였다.

제품명·도메인이 정해지면 그 도메인을 같은 vhost에 붙이고, 그때 `{상사}.도메인` +
`*.도메인` 와일드카드로 간다. `biz.carvior.store`로 시작해도 잠기는 것이 없다.

## 아직 상사를 늘리면 안 된다

`Tenant` 모델과 `Employee.tenantId`까지만 들어갔다. **나머지 56개 모델에는 상사 구분이
없다** — 두 번째 상사를 올리면 출퇴근·정산·상담·주차장이 전부 섞여 보인다.
`Tenant` 테이블에는 1번만 두고, 모델별 스코핑을 끝낸 다음 늘린다.
