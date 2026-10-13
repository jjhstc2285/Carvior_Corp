import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

const LIST_CACHE_KEY = 'employees:list';
const LIST_CACHE_TTL = 300; // 5분 — 명단은 거의 안 바뀌어서 캐시 효과가 크다

export interface EmployeeView {
  id: string;
  name: string;
  position: string;
  department: string | null;
  phones: string[];
  role: Role;
  active: boolean;
  /** 지금 상태 — 본인이 적는다. 안 적었으면 전부 null */
  statusEmoji: string | null;
  statusText: string | null;
  statusAt: string | null;
  /** 알선팀 타이틀 — LEADER / PRO / JUNIOR. 비어 있으면 알선팀이 아니다 */
  referralTitle: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private readonly select = {
    id: true,
    name: true,
    position: true,
    department: true,
    role: true,
    active: true,
    // 알선팀 타이틀 — 이름 옆에 붙어 누가 팀장인지 한눈에 보이게 한다
    referralTitle: true,
    statusEmoji: true,
    statusText: true,
    statusAt: true,
    phones: { select: { number: true }, orderBy: { sortOrder: 'asc' as const } },
  };

  private toView(row: {
    id: string;
    name: string;
    position: string;
    department: string | null;
    role: Role;
    active: boolean;
    statusEmoji: string | null;
    statusText: string | null;
    statusAt: Date | null;
    referralTitle: string;
    phones: { number: string }[];
  }): EmployeeView {
    return {
      ...row,
      statusAt: row.statusAt?.toISOString() ?? null,
      phones: row.phones.map((p) => p.number),
    };
  }

  /**
   * 지금 상태를 적는다 — "🚗 외근 중" 처럼.
   *
   * 본인 것만 고친다. 남의 상태를 대신 적어주는 건 그 사람이 말한 게 아니게 된다.
   * 비우면 상태를 내린다. 목록 캐시를 지워야 다른 사람 화면에도 바로 보인다.
   */
  async setStatus(employeeId: string, dto: { emoji?: string | null; text?: string | null }) {
    const emoji = dto.emoji?.trim() || null;
    const text = dto.text?.trim() || null;
    const cleared = !emoji && !text;

    const row = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        statusEmoji: emoji,
        statusText: text,
        statusAt: cleared ? null : new Date(),
      },
      select: this.select,
    });
    await this.redis.del(LIST_CACHE_KEY);
    return this.toView(row);
  }

  async findAll(includeInactive = false): Promise<EmployeeView[]> {
    if (!includeInactive) {
      const cached = await this.redis.get<EmployeeView[]>(LIST_CACHE_KEY);
      if (cached) return cached;
    }

    const rows = await this.prisma.employee.findMany({
      where: includeInactive ? {} : { active: true },
      select: this.select,
      orderBy: { createdAt: 'asc' },
    });
    const list = rows.map((r) => this.toView(r));

    if (!includeInactive) await this.redis.set(LIST_CACHE_KEY, list, LIST_CACHE_TTL);
    return list;
  }

  async findOne(id: string): Promise<EmployeeView> {
    const row = await this.prisma.employee.findUnique({ where: { id }, select: this.select });
    if (!row) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
    return this.toView(row);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeView> {
    const row = await this.prisma.employee.create({
      data: {
        name: dto.name,
        position: dto.position,
        department: dto.department ?? null,
        role: dto.role ?? Role.EMPLOYEE,
        active: dto.active ?? true,
        phones: { create: (dto.phones ?? []).map((number, sortOrder) => ({ number, sortOrder })) },
      },
      select: this.select,
    });
    await this.invalidate();
    return this.toView(row);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeView> {
    await this.assertExists(id);

    // 관리자를 0명으로 만들어 아무도 못 들어가는 상황을 막는다.
    if (dto.role === Role.EMPLOYEE || dto.active === false) {
      await this.assertNotLastAdmin(id);
    }

    const row = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        // 알선팀 타이틀 — 이 줄이 없으면 화면에서 골라도 아무 일도 안 일어난다
        ...(dto.referralTitle !== undefined ? { referralTitle: dto.referralTitle } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.phones
          ? { phones: { deleteMany: {}, create: dto.phones.map((number, sortOrder) => ({ number, sortOrder })) } }
          : {}),
      },
      select: this.select,
    });
    await this.invalidate();
    return this.toView(row);
  }

  /**
   * 퇴사 처리는 삭제가 아니라 active=false 로 한다.
   * 출퇴근·정산 기록이 그 직원을 참조하고 있어서 실제로 지우면 이력이 통째로 날아간다.
   */
  async deactivate(id: string): Promise<void> {
    await this.assertExists(id);
    await this.assertNotLastAdmin(id);
    await this.prisma.employee.update({ where: { id }, data: { active: false } });
    await this.invalidate();
  }

  /**
   * 아주 지운다 — 남긴 기록은 '(퇴사자)' 앞으로 넘긴다.
   *
   * 퇴사 처리는 줄을 남겨 두지만, 잘못 만든 계정이나 하루 만에 그만둔 사람까지 목록에
   * 영영 남으면 정작 누가 다니는지 세기가 어려워진다.
   *
   * 그렇다고 기록을 같이 지울 수는 없다 — 그 사람이 올린 상담·정산·매입은 회사 기록이지
   * 그 사람 것이 아니다. 담당자 칸만 비우면 될 일인데, 담당자는 빈칸을 못 넣게 돼 있다
   * (모든 줄이 사람 하나를 가리켜야 한다). 그래서 '(퇴사자)'라는 빈 자리를 하나 두고
   * 거기로 몰아넣는다 — 화면에는 담당자가 '(퇴사자)'로 보이고, 사람 줄은 사라진다.
   *
   * 빈 자리는 하나만 쓴다. 지울 때마다 새로 만들면 '(퇴사자)'가 사람 수만큼 쌓인다.
   *
   * 본인 것만 있는 줄(전화번호·출퇴근·내 알림·정정 신청)은 같이 지운다. 남의 출퇴근을
   * 물려받을 수는 없다 — 이쪽은 DB가 알아서 따라 지운다.
   *
   * 식대와 딜러 인센티브도 지운다. 그 사람 몫으로 달마다 한 줄씩 적어 둔 값이라 넘길
   * 것이 아니고, 넘기면 받는 쪽의 그 달 줄과 부딪친다.
   */
  async hardRemove(id: string): Promise<{ moved: number }> {
    await this.assertExists(id);
    await this.assertNotLastAdmin(id);

    const held = await this.heldCounts(id);
    const total = held.reduce((sum, h) => sum + h.count, 0);
    const parkedId = total > 0 ? await this.parkedEmployeeId() : id;

    const move = { employeeId: parkedId };
    const where = { employeeId: id };

    await this.prisma.$transaction([
      // 업무 기록 — 담당자만 '(퇴사자)'로 바꾼다
      this.prisma.consultation.updateMany({ where, data: move }),
      this.prisma.purchaseIntake.updateMany({ where, data: move }),
      this.prisma.purchaseSettlement.updateMany({ where, data: move }),
      this.prisma.brokerageSettlement.updateMany({ where, data: move }),
      this.prisma.settlement.updateMany({ where, data: move }),
      this.prisma.parkingVehicle.updateMany({ where, data: move }),
      this.prisma.workLog.updateMany({ where, data: move }),
      this.prisma.cleaningLog.updateMany({ where, data: move }),
      this.prisma.vehicleExpenseLog.updateMany({ where, data: move }),
      this.prisma.approvalDocument.updateMany({ where, data: move }),
      // 그 사람 몫으로 적어 둔 값 — 넘기면 받는 쪽 줄과 부딪친다
      this.prisma.settlementMeal.deleteMany({ where }),
      this.prisma.dealerIncentive.deleteMany({ where }),
      // 방문 담당 딜러는 관계가 아니라 번호만 적어 둔 칸이다 — 비운다
      this.prisma.consultation.updateMany({ where: { visitDealerId: id }, data: { visitDealerId: null } }),
      this.prisma.employee.delete({ where: { id } }),
    ]);

    await this.invalidate();
    return { moved: total };
  }

  /**
   * 담당자를 비울 자리.
   *
   * 사람이 아니라 '빈칸' 노릇을 하는 줄이다. 퇴사로 두면 목록·담당자 고르기에서 안 보이고,
   * 기록에는 '(퇴사자)'로만 남는다.
   */
  private async parkedEmployeeId(): Promise<string> {
    const name = '(퇴사자)';
    const found = await this.prisma.employee.findFirst({ where: { name }, select: { id: true } });
    if (found) return found.id;

    const made = await this.prisma.employee.create({
      data: { name, position: '퇴사', active: false, role: Role.EMPLOYEE },
      select: { id: true },
    });
    return made.id;
  }

  /** 그 사람 앞으로 걸려 있는 업무 기록이 얼마나 되나 — 넘기기 전에 보여 준다 */
  private async heldCounts(id: string): Promise<{ label: string; count: number }[]> {
    const where = { employeeId: id };
    const [consult, intake, purchase, brokerage, basic, parking, work, cleaning, expense, approval] =
      await Promise.all([
        this.prisma.consultation.count({ where }),
        this.prisma.purchaseIntake.count({ where }),
        this.prisma.purchaseSettlement.count({ where }),
        this.prisma.brokerageSettlement.count({ where }),
        this.prisma.settlement.count({ where }),
        this.prisma.parkingVehicle.count({ where }),
        this.prisma.workLog.count({ where }),
        this.prisma.cleaningLog.count({ where }),
        this.prisma.vehicleExpenseLog.count({ where }),
        this.prisma.approvalDocument.count({ where }),
      ]);

    return [
      { label: '상담', count: consult },
      { label: '매입', count: intake },
      { label: '매입 정산', count: purchase },
      { label: '알선·수출 정산', count: brokerage },
      { label: '간편 정산', count: basic },
      { label: '주차', count: parking },
      { label: '업무 일지', count: work },
      { label: '청소', count: cleaning },
      { label: '차량비용', count: expense },
      { label: '결재 문서', count: approval },
    ].filter((h) => h.count > 0);
  }

  /** 지우기 전에 — 무엇이 몇 건 걸려 있는지 */
  async heldSummary(id: string) {
    await this.assertExists(id);
    const held = await this.heldCounts(id);
    return { total: held.reduce((s, h) => s + h.count, 0), held };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('해당 직원을 찾을 수 없습니다.');
  }

  private async assertNotLastAdmin(id: string): Promise<void> {
    const target = await this.prisma.employee.findUnique({ where: { id }, select: { role: true } });
    if (target?.role !== Role.ADMIN) return;

    const adminCount = await this.prisma.employee.count({ where: { role: Role.ADMIN, active: true } });
    if (adminCount <= 1) {
      throw new BadRequestException('마지막 관리자는 권한을 내리거나 비활성화할 수 없습니다.');
    }
  }

  private async invalidate(): Promise<void> {
    await this.redis.del(LIST_CACHE_KEY);
  }
}
