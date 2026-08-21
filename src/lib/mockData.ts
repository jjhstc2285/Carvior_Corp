import dayjs from 'dayjs';
import type { AppNotification, AppState, AttendanceRecord, AttendanceRequest, BrokerageSettlement, ConsultationRecord, CorrectionRequest, Employee, ParkingVehicle, PurchaseSettlement, SettlementRecord, VehiclePost } from '../types';
import { brokerageSaleProfit, purchasePrepTotal } from '../types';
import { VEHICLE_POST_SITES } from '../types';
import { isWorkday } from './attendance';
import { PARKING_LOTS, PARKING_SLOTS } from './parkingLayout';

const VEHICLE_MODELS = ['아반떼 CN7', '쏘나타 DN8', '그랜저 GN7', '싼타페 MX5', '카니발 KA4', 'K5 DL3', 'K8', '스포티지 NQ5'];
const CUSTOMER_NAMES = ['김철수', '박영희', '이민수', '최수진', '정다은', '한지훈', '오세영', '윤가영', '장현우', '조은비'];
const CONSULT_NOTES = [
  '차량 상태 및 옵션 문의, 다음 주 방문 상담 예정.',
  '가격 협상 중, 견적서 발송함.',
  '계약 조건 조율 완료, 서류 준비 요청.',
  '보류 요청 — 가족과 상의 후 재연락 예정.',
  '타 매물과 비교 중이라 추가 정보 요청함.',
];

const EMPLOYEES: Employee[] = [
  { id: 'e1', name: '김민준', department: '개발팀', position: '사원' },
  { id: 'e2', name: '이서연', department: '개발팀', position: '대리' },
  { id: 'e3', name: '박도윤', department: '마케팅팀', position: '사원' },
  { id: 'e4', name: '최지우', department: '마케팅팀', position: '팀장' },
  { id: 'e5', name: '정하은', department: '인사팀', position: '사원' },
  { id: 'e6', name: '강태양', department: '인사팀', position: '대리' },
  { id: 'e7', name: '오유진', department: '영업팀', position: '사원' },
  { id: 'e8', name: '한소율', department: '영업팀', position: '팀장' },
];

// 시드 고정 의사난수 — 매번 새로고침해도 같은 목업 패턴이 나오게(데모 일관성)
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function randomPlate(rand: () => number): string {
  return `${12 + Math.floor(rand() * 88)}${['가', '나', '다', '라'][Math.floor(rand() * 4)]}${1000 + Math.floor(rand() * 8999)}`;
}

// 데모용 사진 자리표시자 — 실제 이미지 파일 없이 색만 다른 SVG를 data URL로 만들어 쓴다
function placeholderPhoto(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">` +
    `<rect width="640" height="480" fill="hsl(${hue},45%,88%)"/>` +
    `<rect x="90" y="200" width="460" height="120" rx="26" fill="hsl(${hue},40%,72%)"/>` +
    `<rect x="170" y="150" width="280" height="90" rx="24" fill="hsl(${hue},40%,78%)"/>` +
    `<circle cx="200" cy="330" r="42" fill="hsl(${hue},25%,45%)"/>` +
    `<circle cx="450" cy="330" r="42" fill="hsl(${hue},25%,45%)"/>` +
    `<text x="320" y="430" font-family="sans-serif" font-size="26" fill="hsl(${hue},25%,40%)" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function randomTimeAround(rand: () => number, baseH: number, baseM: number, spreadMin: number): string {
  const offset = Math.round((rand() - 0.5) * 2 * spreadMin);
  const total = baseH * 60 + baseM + offset;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function generateMockState(): AppState {
  const rand = seededRandom(42);
  const today = dayjs();
  const monthStart = today.startOf('month');

  const records: AttendanceRecord[] = [];
  let recId = 1;

  // 오늘 날짜는 시드에서 만들지 않는다 — 실제 출퇴근 버튼으로 직접 찍어보는 데모 플로우를
  // 막지 않기 위해(미리 채워두면 이미 "출근함" 상태로 시작해버림).
  for (let d = monthStart; d.isBefore(today, 'day'); d = d.add(1, 'day')) {
    const dateStr = d.format('YYYY-MM-DD');
    if (!isWorkday(dateStr)) continue;

    for (const emp of EMPLOYEES) {
      const roll = rand();
      let clockIn: string | null = randomTimeAround(rand, 9, 0, 5);
      let clockOut: string | null = randomTimeAround(rand, 18, 0, 10);

      if (roll < 0.06) {
        // 완전 결측(출퇴근 다 안 찍음)
        clockIn = null;
        clockOut = null;
      } else if (roll < 0.11) {
        // 퇴근만 결측
        clockOut = null;
      } else if (roll < 0.2) {
        // 지각
        clockIn = randomTimeAround(rand, 9, 20, 15);
      } else if (roll < 0.27) {
        // 조퇴
        clockOut = randomTimeAround(rand, 17, 20, 20);
      }

      records.push({
        id: `r${recId++}`,
        employeeId: emp.id,
        date: dateStr,
        clockIn,
        clockOut,
      });
    }
  }

  // 데모용 초기 정정요청 몇 건 — 이미 관리자가 처리할 대기건이 있는 상태로 시작
  const missingRecords = records.filter(r => !r.clockIn || !r.clockOut).slice(0, 4);
  const requests: CorrectionRequest[] = missingRecords.slice(0, 3).map((r, i) => ({
    id: `req${i + 1}`,
    employeeId: r.employeeId,
    date: r.date,
    reason: i === 0 ? '외근 이동 중 앱 접속이 안 돼 출근 체크를 못 했습니다.' : i === 1 ? '시스템 점검 시간과 겹쳐 퇴근 체크가 누락됐습니다.' : '개인 사정으로 정정 요청드립니다.',
    requestedClockIn: r.clockIn ?? '09:00',
    requestedClockOut: r.clockOut ?? '18:00',
    status: i === 2 ? 'approved' : 'pending',
    createdAt: dayjs(r.date).add(1, 'day').toISOString(),
    reviewedAt: i === 2 ? dayjs(r.date).add(2, 'day').toISOString() : null,
    reviewNote: i === 2 ? '확인했습니다.' : null,
  }));

  // 근태 신청(연차/외근) 목업 — 이미 승인된 과거/예정 건 + 대기중인 신청 몇 건
  const attendanceRequests: AttendanceRequest[] = [
    {
      id: 'areq1',
      employeeId: EMPLOYEES[1].id,
      date: today.subtract(6, 'day').format('YYYY-MM-DD'),
      kind: 'annualLeave',
      reason: '개인 사유로 연차 사용합니다.',
      status: 'approved',
      createdAt: today.subtract(10, 'day').toISOString(),
      reviewedAt: today.subtract(9, 'day').toISOString(),
      reviewNote: '승인합니다.',
    },
    {
      id: 'areq2',
      employeeId: EMPLOYEES[3].id,
      date: today.add(4, 'day').format('YYYY-MM-DD'),
      kind: 'annualLeave',
      reason: '가족 행사로 연차 사용합니다.',
      status: 'approved',
      createdAt: today.subtract(3, 'day').toISOString(),
      reviewedAt: today.subtract(2, 'day').toISOString(),
      reviewNote: '승인합니다.',
    },
    {
      id: 'areq3',
      employeeId: EMPLOYEES[0].id,
      date: today.add(2, 'day').format('YYYY-MM-DD'),
      kind: 'annualLeave',
      reason: '병원 진료로 연차 신청합니다.',
      status: 'pending',
      createdAt: today.subtract(1, 'day').toISOString(),
      reviewedAt: null,
      reviewNote: null,
    },
    {
      id: 'areq6',
      employeeId: EMPLOYEES[0].id,
      date: today.subtract(8, 'day').format('YYYY-MM-DD'),
      kind: 'annualLeave',
      reason: '개인 사유로 연차 사용합니다.',
      status: 'approved',
      createdAt: today.subtract(12, 'day').toISOString(),
      reviewedAt: today.subtract(11, 'day').toISOString(),
      reviewNote: '승인합니다.',
    },
    {
      id: 'areq7',
      employeeId: EMPLOYEES[0].id,
      date: today.add(7, 'day').format('YYYY-MM-DD'),
      kind: 'annualLeave',
      reason: '여행으로 연차 사용합니다.',
      status: 'approved',
      createdAt: today.subtract(2, 'day').toISOString(),
      reviewedAt: today.subtract(1, 'day').toISOString(),
      reviewNote: '승인합니다.',
    },
    {
      id: 'areq4',
      employeeId: EMPLOYEES[6].id,
      date: today.format('YYYY-MM-DD'),
      kind: 'fieldWork',
      reason: '고객사 차량 인수 외근으로 하루 종일 외근 예정입니다.',
      status: 'approved',
      createdAt: today.subtract(1, 'day').toISOString(),
      reviewedAt: today.subtract(1, 'day').toISOString(),
      reviewNote: '승인합니다.',
    },
    {
      id: 'areq5',
      employeeId: EMPLOYEES[7].id,
      date: today.add(1, 'day').format('YYYY-MM-DD'),
      kind: 'fieldWork',
      reason: '지방 출장으로 사무실 출근이 어렵습니다.',
      status: 'pending',
      createdAt: today.toISOString(),
      reviewedAt: null,
      reviewNote: null,
    },
  ];

  const notifications: AppNotification[] = [
    ...missingRecords.map((r, i) => ({
      id: `n-missing-${i}`,
      type: 'missing' as const,
      message: `${EMPLOYEES.find(e => e.id === r.employeeId)?.name}님의 ${dayjs(r.date).format('M월 D일')} 출퇴근 기록이 누락되었습니다.`,
      employeeId: r.employeeId,
      date: r.date,
      createdAt: dayjs(r.date).add(1, 'hour').toISOString(),
      read: i > 1,
    })),
    ...requests.filter(r => r.status === 'pending').map((r, i) => ({
      id: `n-req-${i}`,
      type: 'correctionRequest' as const,
      message: `${EMPLOYEES.find(e => e.id === r.employeeId)?.name}님이 ${dayjs(r.date).format('M월 D일')} 근태 수정을 요청했습니다.`,
      employeeId: r.employeeId,
      date: r.date,
      createdAt: r.createdAt,
      read: false,
    })),
    ...attendanceRequests.filter(r => r.status === 'pending').map((r, i) => ({
      id: `n-areq-${i}`,
      type: 'attendanceRequest' as const,
      message: `${EMPLOYEES.find(e => e.id === r.employeeId)?.name}님이 ${dayjs(r.date).format('M월 D일')} ${r.kind === 'annualLeave' ? '연차' : '외근/출장'}을 신청했습니다.`,
      employeeId: r.employeeId,
      date: r.date,
      createdAt: r.createdAt,
      read: false,
    })),
  ];

  // 정산 목업 — 최근 20건 정도, 순이익은 저장하지 않고 항상 계산해서 쓰지만 여기선
  // 표시용 입력값(매입가/상품화비용/판매금액/수수료)만 만들면 됨
  const settlements: SettlementRecord[] = Array.from({ length: 20 }).map((_, i) => {
    const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
    const purchaseCost = Math.round((800 + rand() * 2200) / 10) * 10; // 만원
    const prepCost = Math.round((20 + rand() * 80) / 5) * 5;
    const saleAmount = Math.round((purchaseCost + prepCost) * (1.05 + rand() * 0.15) / 10) * 10;
    const feeAmount = Math.round(saleAmount * 0.02 / 5) * 5;
    const daysAgo = Math.floor(rand() * 45);
    return {
      id: `s${i + 1}`,
      employeeId: emp.id,
      vehicleInfo: `${VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)]} (${randomPlate(rand)})`,
      purchaseCost,
      prepCost,
      saleAmount,
      feeAmount,
      status: daysAgo > 10 ? 'completed' : rand() < 0.5 ? 'completed' : 'inProgress',
      date: today.subtract(daysAgo, 'day').format('YYYY-MM-DD'),
      memo: '',
      createdAt: today.subtract(daysAgo, 'day').toISOString(),
    };
  });

  // 상담 목업 — 고객 몇 명은 여러 번 상담해서 이력 타임라인이 보이게 겹치게 만든다
  const STATUS_POOL: ConsultationRecord['status'][] = ['inProgress', 'inProgress', 'contracted', 'onHold', 'closed'];
  const consultations: ConsultationRecord[] = [];
  let consultId = 1;
  CUSTOMER_NAMES.forEach((customer) => {
    const rounds = 1 + Math.floor(rand() * 3); // 고객당 1~3회 상담
    const plate = randomPlate(rand);
    for (let i = 0; i < rounds; i++) {
      const daysAgo = Math.floor(rand() * 30) + i * 3;
      const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
      const status = STATUS_POOL[Math.floor(rand() * STATUS_POOL.length)];
      const consultDate = today.subtract(daysAgo, 'day');
      consultations.push({
        id: `c${consultId++}`,
        vehicleNumber: plate,
        customerName: customer,
        employeeId: emp.id,
        status,
        date: consultDate.format('YYYY-MM-DD'),
        time: randomTimeAround(rand, 14, 0, 180),
        content: CONSULT_NOTES[Math.floor(rand() * CONSULT_NOTES.length)],
        nextContactDate: status === 'inProgress' ? consultDate.add(3 + Math.floor(rand() * 5), 'day').format('YYYY-MM-DD') : null,
        fileNames: rand() < 0.4 ? ['차량사진.jpg'] : rand() < 0.6 ? ['계약서_스캔본.pdf'] : [],
        createdAt: consultDate.toISOString(),
      });
    }
  });

  // 주차 목업 — 요청 스크린샷의 구역 구조를 공용 설정(parkingLayout)에서 그대로 가져와 재현
  const PARKING_STATUS_POOL: ParkingVehicle['status'][] = ['전시중', '전시중', '예약중', '판매완료', '이동중'];
  const parkingVehicles: ParkingVehicle[] = [];
  let parkingId = 1;
  PARKING_LOTS.forEach(({ lot, zones }) => {
    zones.forEach(zone => {
      PARKING_SLOTS.forEach(slot => {
        if (rand() >= 0.45) return; // 빈 슬롯도 많게(실제 시트지처럼 듬성듬성)
        const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
        parkingVehicles.push({
          id: `p${parkingId++}`,
          lot,
          zone,
          slot,
          vehicleNumber: randomPlate(rand),
          vehicleModel: VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)],
          status: PARKING_STATUS_POOL[Math.floor(rand() * PARKING_STATUS_POOL.length)],
          employeeId: emp.id,
          memo: '',
          updatedAt: today.subtract(Math.floor(rand() * 10), 'day').toISOString(),
        });
      });
    });
  });

  // 알선 정산 목업 — 실제 시트지 컬럼 그대로(금액 단위: 만원)
  const brokerageSettlements: BrokerageSettlement[] = Array.from({ length: 12 }).map((_, i) => {
    const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
    const totalSaleAmount = Math.round((900 + rand() * 2600) / 10) * 10;
    const ownerDeposit = Math.round(totalSaleAmount * (0.88 + rand() * 0.07) / 10) * 10;
    const transferFee = Math.round(20 + rand() * 40);
    const daysAgo = Math.floor(rand() * 50);
    const row = {
      totalSaleAmount,
      ownerDeposit,
      transferFee,
      transferFeeBalance: Math.round(rand() * 12),
      cashCommission: Math.round(rand() * 30),
      installmentFee: Math.round(rand() * 40),
      insuranceFee: Math.round(rand() * 15),
      etcCost: Math.round(rand() * 10),
    };
    return {
      id: `bs${i + 1}`,
      date: today.subtract(daysAgo, 'day').format('YYYY-MM-DD'),
      vehicleNumber: randomPlate(rand),
      vehicleName: VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)],
      ...row,
      settlementAmount: brokerageSaleProfit(row),
      employeeId: emp.id,
      status: daysAgo > 14 ? 'completed' : rand() < 0.5 ? 'completed' : 'inProgress',
      memo: '',
      createdAt: today.subtract(daysAgo, 'day').toISOString(),
    };
  });

  // 매입 정산 목업 — 실제 시트지 컬럼 그대로(금액 단위: 만원)
  const purchaseSettlements: PurchaseSettlement[] = Array.from({ length: 12 }).map((_, i) => {
    const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
    const purchasePrice = Math.round((800 + rand() * 2400) / 10) * 10;
    const daysAgo = Math.floor(rand() * 50);
    const prep = {
      polishWashCost: Math.round(2 + rand() * 8),
      dentCost: Math.round(rand() * 40),
      performanceCost: Math.round(3 + rand() * 8),
      deliveryCost: Math.round(5 + rand() * 20),
      repairCost: Math.round(rand() * 60),
      brokerFee: Math.round(rand() * 30),
      diagnosisCost: Math.round(2 + rand() * 6),
    };
    return {
      id: `ps${i + 1}`,
      date: today.subtract(daysAgo, 'day').format('YYYY-MM-DD'),
      vehicleName: VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)],
      vehicleNumber: randomPlate(rand),
      transferFee: Math.round(20 + rand() * 45),
      purchasePrice,
      ...prep,
      settlementAmount: purchasePrice + purchasePrepTotal(prep),
      newCarName: rand() < 0.35 ? VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)] : '',
      employeeId: emp.id,
      status: daysAgo > 14 ? 'completed' : rand() < 0.5 ? 'completed' : 'inProgress',
      memo: '',
      createdAt: today.subtract(daysAgo, 'day').toISOString(),
    };
  });

  // 매물 사진 게시판 목업 — 실제 사진 대신 가벼운 SVG 플레이스홀더를 넣어둔다(용량 거의 0)
  const POST_NOTES = [
    '무사고 차량이고 실내 상태 좋습니다. 사진 참고하시고 문의 주세요.',
    '엔진오일·타이어 교체 완료했습니다. 사이트 업로드용 사진입니다.',
    '앞범퍼 미세 스크래치 있어서 사진에 같이 담았습니다. 가격 조정 가능.',
    '옵션 풀 차량입니다. 손님 방문 예정이라 오늘 중 업로드 부탁드려요.',
    '외판 도장 상태 확인 부탁드립니다. 하부 사진도 같이 올렸습니다.',
  ];
  const vehiclePosts: VehiclePost[] = Array.from({ length: 6 }).map((_, i) => {
    const emp = EMPLOYEES[Math.floor(rand() * EMPLOYEES.length)];
    const model = VEHICLE_MODELS[Math.floor(rand() * VEHICLE_MODELS.length)];
    const plate = randomPlate(rand);
    const hoursAgo = Math.floor(rand() * 120);
    const photoCount = 4 + Math.floor(rand() * 2); // 4~5장
    const created = today.subtract(hoursAgo, 'hour');
    return {
      id: `vp${i + 1}`,
      site: VEHICLE_POST_SITES[Math.floor(rand() * (VEHICLE_POST_SITES.length - 1))],
      vehicleNumber: plate,
      vehicleModel: model,
      customerPhone: `010-${1000 + Math.floor(rand() * 8999)}-${1000 + Math.floor(rand() * 8999)}`,
      content: POST_NOTES[Math.floor(rand() * POST_NOTES.length)],
      photos: Array.from({ length: photoCount }).map((__, p) => placeholderPhoto(`${model} ${p + 1}`, (i * 47 + p * 23) % 360)),
      employeeId: emp.id,
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
    };
  });

  return {
    employees: EMPLOYEES,
    records,
    requests,
    notifications,
    settlements,
    brokerageSettlements,
    purchaseSettlements,
    consultations,
    parkingVehicles,
    attendanceRequests,
    vehiclePosts,
    currentEmployeeId: EMPLOYEES[0].id,
    ipWhitelist: [],
  };
}
