# 애니원모터스 API (NestJS)

NestJS + Prisma + **MySQL 8** + Redis. 프론트엔드(`../src`)가 쓰는 REST API입니다.

## 1. MySQL 설치 (Ubuntu)

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo systemctl status mysql
```

### DB와 계정 만들기

```bash
sudo mysql
```

```sql
CREATE DATABASE anyone_motors CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'anyone'@'localhost' IDENTIFIED BY '여기에_강한_비밀번호';
GRANT ALL PRIVILEGES ON anyone_motors.* TO 'anyone'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> `utf8mb4`로 만들어야 한글과 이모지가 안 깨집니다. `utf8`(3바이트)로 만들면
> 나중에 이모지 들어간 메모를 저장할 때 에러가 납니다.

접속 확인:

```bash
mysql -u anyone -p anyone_motors -e "SELECT 1;"
```

## 2. Redis 설치

```bash
sudo apt install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping        # PONG 나오면 정상
```

> Redis는 기본 설정에서 127.0.0.1만 듣습니다. 그대로 두세요.
> 외부에 열면 비밀번호 없이 누구나 접근할 수 있어 위험합니다.

## 3. 환경변수

```bash
cp .env.example .env
nano .env
```

`JWT_SECRET`은 반드시 새로 만들어 넣으세요:

```bash
openssl rand -base64 48
```

## 4. 설치 / 마이그레이션 / 시드

```bash
npm ci
npx prisma migrate deploy     # 개발 중엔: npx prisma migrate dev --name init
npm run build
```

### 임직원 시드

실제 명단(실명·휴대폰번호)은 **개인정보라 저장소에 올리지 않습니다.**
`prisma/employees.json`은 `.gitignore` 처리되어 있고, 저장소에는 가짜 번호가 든
`prisma/employees.example.json`만 들어 있습니다.

서버에서 실제 명단을 넣으려면:

```bash
cp prisma/employees.example.json prisma/employees.json
nano prisma/employees.json      # 실제 명단으로 교체
ADMIN_DEFAULT_PASSWORD='초기비밀번호' npm run seed
```

`role: "ADMIN"`인 사람만 아이디/비밀번호 로그인이 만들어집니다.
현재 기준 **유진욱 대표님, 안원용 본부장님**이 관리자입니다.

> 시드는 이름으로 찾아 있으면 갱신, 없으면 생성하므로 여러 번 돌려도 중복이 안 생깁니다.
> 이미 비밀번호를 바꿔 쓰는 계정의 비밀번호는 덮어쓰지 않습니다.
> **첫 로그인 후 `POST /api/auth/password`로 비밀번호를 바꾸세요.**

## 5. 실행

```bash
# 개발
npm run start:dev

# 운영 (pm2)
sudo npm i -g pm2
pm2 start ecosystem.config.js
pm2 startup && pm2 save     # 재부팅해도 자동 실행
pm2 logs anyone-api
```

API는 **127.0.0.1:3000**에서만 듣습니다. 외부 접근은 Apache 프록시(`/api`)를 통해서만 이루어집니다.
Apache 설정은 [`../deploy/apache-skv1motors.conf`](../deploy/apache-skv1motors.conf) 참고.

## 현재 구현된 API

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/auth/login` | 공개 | 관리자 아이디/비밀번호 로그인 |
| POST | `/api/auth/social` | 공개 | 카카오/네이버 로그인 (미연결 계정이면 `pendingToken` 반환) |
| POST | `/api/auth/link` | 공개 | 소셜 계정 ↔ 사내 직원 연결 |
| GET | `/api/auth/me` | 로그인 | 내 정보 |
| POST | `/api/auth/password` | 로그인 | 비밀번호 변경 |
| GET | `/api/employees` | 로그인 | 임직원 목록 (Redis 5분 캐시) |
| GET | `/api/employees/:id` | 로그인 | 임직원 단건 |
| POST | `/api/employees` | 관리자 | 임직원 추가 |
| PATCH | `/api/employees/:id` | 관리자 | 임직원 수정 |
| DELETE | `/api/employees/:id` | 관리자 | 퇴사 처리(비활성화, 이력 보존) |

기본이 **로그인 필요**이고 `@Public()`을 붙인 엔드포인트만 열려 있습니다.
새 API를 추가할 때 인증을 깜빡해서 뚫리는 일을 막기 위한 구조입니다.

## 아직 안 만든 것

DB 테이블은 전부 정의돼 있고, 아래 모듈의 컨트롤러/서비스가 남았습니다:

- 출퇴근 (출퇴근 기록, 정정요청, 연차/외근 신청, 알림, IP 화이트리스트)
- 알선 상담
- 정산 3종 (간편 / 알선 / 매입)
- 주차장
- 매물 사진 (파일 업로드 포함)

그리고 프론트엔드의 `localStorage` + 목업 데이터를 이 API 호출로 교체하는 작업이 남았습니다.
