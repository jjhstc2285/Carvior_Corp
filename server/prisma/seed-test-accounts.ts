/**
 * 테스트용 계정 시드 — 관리자 1개 + 일반 직원 1개.
 *
 * 임직원 명단 시드(seed.ts)와 별개로, 화면을 돌려보기 위한 계정만 만든다.
 * 직원 계정도 아이디/비밀번호로 로그인된다(소셜 연동 없이 바로 확인 가능).
 *
 *   npm run seed:test            # admin / 00700!  ,  staff / 00700!
 *   ADMIN_LOGIN_ID=qa ADMIN_PASSWORD='...' STAFF_LOGIN_ID=qa2 npm run seed:test
 *
 * 이미 있으면 비밀번호를 다시 맞춰준다(비밀번호를 잊었을 때도 이 명령 한 번이면 복구).
 *
 * ⚠️ 기본 비밀번호는 테스트 편의를 위한 값이다. 외부에서 접근 가능한 서버에 올렸다면
 *    로그인 후 POST /api/auth/password 로 반드시 바꾸거나, 계정을 지워야 한다.
 */
import * as bcrypt from 'bcrypt';
import { AuthProvider, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

interface TestAccount {
  loginId: string;
  password: string;
  name: string;
  position: string;
  role: Role;
}

const ACCOUNTS: TestAccount[] = [
  {
    loginId: process.env.ADMIN_LOGIN_ID ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? '00700!',
    name: process.env.ADMIN_NAME ?? '테스트관리자',
    position: process.env.ADMIN_POSITION ?? '대표',
    role: Role.ADMIN,
  },
  {
    loginId: process.env.STAFF_LOGIN_ID ?? 'staff',
    password: process.env.STAFF_PASSWORD ?? '00700!',
    name: process.env.STAFF_NAME ?? '테스트직원',
    position: process.env.STAFF_POSITION ?? '매니저',
    role: Role.EMPLOYEE,
  },
];

async function main() {
  for (const account of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 12);

    await prisma.employee.upsert({
      where: { loginId: account.loginId },
      create: {
        name: account.name,
        position: account.position,
        role: account.role,
        active: true,
        provider: AuthProvider.LOCAL,
        loginId: account.loginId,
        passwordHash,
      },
      // 테스트 전용이라 돌릴 때마다 비밀번호·권한·활성 상태를 알려진 값으로 되돌린다.
      update: { role: account.role, active: true, passwordHash },
    });

    const label = account.role === Role.ADMIN ? '관리자' : '일반 직원';
    console.log(`[seed:test] ${label} — 아이디 "${account.loginId}" / 비밀번호 "${account.password}" (${account.name})`);
  }

  console.log('[seed:test] 테스트가 끝나면 비밀번호를 바꾸거나 계정을 삭제하세요.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
