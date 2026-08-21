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

### ① 출퇴근

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/attendance/records?month=YYYY-MM` | 로그인 | 월별 기록 (직원은 본인만) |
| GET | `/api/attendance/today` | 로그인 | 오늘 내 기록 (버튼 상태용) |
| POST | `/api/attendance/clock-in` | 로그인 | 출근 — IP 화이트리스트 검사 |
| POST | `/api/attendance/clock-out` | 로그인 | 퇴근 |
| GET/POST | `/api/attendance/corrections` | 로그인 | 근태 정정요청 조회/신청 |
| PATCH | `/api/attendance/corrections/:id/approve\|reject` | 관리자 | 승인 시 실제 기록까지 트랜잭션으로 반영 |
| GET/POST | `/api/attendance/requests` | 로그인 | 연차·외근 조회/신청 (같은 날 중복 신청 차단) |
| PATCH | `/api/attendance/requests/:id/approve\|reject` | 관리자 | 승인/반려 |
| GET | `/api/attendance/annual-leave` | 로그인 | 남은 연차 (연 15일 기준) |
| GET | `/api/attendance/notifications` | 로그인 | 내 알림 |
| PATCH | `/api/attendance/notifications/:id/read`, `/read-all` | 로그인 | 읽음 처리 |
| GET/POST/DELETE | `/api/attendance/ip-whitelist` | 관리자 | 출근 허용 IP 관리 |
| GET | `/api/attendance/my-ip` | 로그인 | 지금 내 IP |

### ② 알선 상담

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/consultations?q=&status=` | 로그인 | 목록 (직원은 본인 담당만) |
| GET | `/api/consultations/by-customer/:name` | 로그인 | 고객별 상담 이력 |
| GET | `/api/consultations/stats/conversion` | 관리자 | 담당자별 계약 전환율 |
| POST/PATCH/DELETE | `/api/consultations/:id` | 로그인 | 등록/수정/삭제 |

### ③ 정산

`basic`(간편) / `brokerage`(알선) / `purchase`(매입) 세 갈래가 같은 형태입니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/settlements/{종류}?q=&status=&month=` | 목록 — 파생값 계산해서 함께 내려줌 |
| POST | `/api/settlements/{종류}` | 등록 |
| PATCH | `/api/settlements/{종류}/:id` | 수정 |
| DELETE | `/api/settlements/{종류}/:id` | 삭제 |

파생값(`netProfit` / `profit`·`saleProfit` / `prepTotal`·`grandTotal`)은 **저장하지 않고 조회 시 계산**합니다.
계산식은 [`src/settlements/settlement.calc.ts`](src/settlements/settlement.calc.ts) 한 곳에만 있습니다.

### ④ 주차장 / ⑤ 매물 사진

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/parking?q=&lot=&status=` | 로그인 | 구역도·리스트 공용 |
| POST | `/api/parking` | 관리자 | 칸 등록/교체 (같은 차량 중복 등록 차단) |
| PATCH/DELETE | `/api/parking/:id` | 관리자 | 수정 / 칸 비우기 |
| GET | `/api/vehicle-posts?q=&site=` | 로그인 | **전 직원이 전체 글 열람** |
| POST | `/api/vehicle-posts/photos` | 로그인 | 사진 업로드(최대 5장, 8MB) → url 반환 |
| POST/PATCH | `/api/vehicle-posts/:id` | 로그인 | 글 등록/수정 |
| DELETE | `/api/vehicle-posts/:id` | 본인 or 관리자 | 삭제 (디스크 사진도 함께 정리) |

기본이 **로그인 필요**이고 `@Public()`을 붙인 엔드포인트만 열려 있습니다.
새 API를 추가할 때 인증을 깜빡해서 뚫리는 일을 막기 위한 구조입니다.

## 아직 안 한 것

- **프론트엔드 API 연동** — `localStorage` + 목업 데이터를 이 API 호출로 교체
- 카카오/네이버 실제 OAuth (지금은 프론트가 받은 프로필을 서버가 받아주는 형태까지만)
- 직원 채팅 (관리자 → 직원) — WebSocket + 대화/메시지 테이블 필요
