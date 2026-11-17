/**
 * 테스트용 관리자 계정 시드.
 *
 * 임직원 명단 시드(seed.ts)와 별개로, 화면을 돌려보기 위한 관리자 계정 하나만 만든다.
 *
 *   npm run seed:admin                                  # admin / 00700!
 *   ADMIN_LOGIN_ID=qa ADMIN_PASSWORD='...' npm run seed:admin
 *
 * 이미 있으면 비밀번호를 다시 맞춰준다(비밀번호를 잊었을 때도 이 명령 한 번이면 복구).
 *
 * ⚠️ 기본 비밀번호는 테스트 편의를 위한 값이다. 외부에서 접근 가능한 서버에 올렸다면
 *    로그인 후 POST /api/auth/password 로 반드시 바꾸거나, 계정을 지워야 한다.
 */
// ts-node로 직접 돌리는 스크립트는 .env를 알아서 읽지 않는다 — PrismaClient가
// 만들어지기 전에 먼저 읽어 둔다(없으면 "Environment variable not found: DATABASE_URL").
import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { AuthProvider, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const LOGIN_ID = process.env.ADMIN_LOGIN_ID ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '00700!';
const NAME = process.env.ADMIN_NAME ?? '테스트관리자';
const POSITION = process.env.ADMIN_POSITION ?? '대표';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const account = await prisma.employee.upsert({
    where: { loginId: LOGIN_ID },
    create: {
      name: NAME,
      position: POSITION,
      role: Role.ADMIN,
      active: true,
      provider: AuthProvider.LOCAL,
      loginId: LOGIN_ID,
      passwordHash,
    },
    // 이 계정은 테스트 전용이라, 돌릴 때마다 비밀번호·활성 상태를 알려진 값으로 되돌린다.
    update: { role: Role.ADMIN, active: true, passwordHash },
  });

  console.log(`[seed:admin] 준비 완료 — 아이디 "${LOGIN_ID}" / 비밀번호 "${PASSWORD}" (${account.name})`);
  console.log('[seed:admin] 테스트가 끝나면 비밀번호를 바꾸거나 계정을 삭제하세요.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
