import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Image } from 'antd';
import { Camera } from 'lucide-react';
import { api } from '../../lib/api';

/**
 * 그 차의 상품화 사진 — 한 줄로 띄운다.
 *
 * 사진은 차량 관리 > 사진 탭에만 있다. 주차장에서 차를 누르면 번호와 자리만 뜨는데,
 * 정작 그 자리에서 궁금한 건 "이 차가 어떻게 생겼나"다 — 손님이 옆에 서서 묻는 일도
 * 거기서 생긴다. 사진을 보려고 다른 메뉴로 넘어갔다 돌아오면 고치던 값이 날아간다.
 *
 * 보여 주기만 한다. 올리고 지우는 건 사진 탭에서 한다 — 자리를 고치는 창에서 사진까지
 * 손대게 하면 무엇을 저장하는 창인지 알 수 없게 된다.
 *
 * 없으면 아무것도 안 그린다. '사진 없음'을 늘 띄우면 창만 길어진다.
 */

const SLOTS = [
  { key: 'FRONT', label: '전면' },
  { key: 'REAR', label: '후면' },
  { key: 'LEFT', label: '좌측' },
  { key: 'RIGHT', label: '우측' },
  { key: 'DASH', label: '계기판' },
  { key: 'INTERIOR', label: '실내' },
] as const;

interface PhotoSet {
  id: string;
  shotOn: string;
  memo: string;
  photos: Partial<Record<(typeof SLOTS)[number]['key'], string>>;
  daysLeft?: number;
}

export default function VehiclePhotoStrip({ vehicleNumber }: { vehicleNumber: string }) {
  const [sets, setSets] = useState<PhotoSet[]>([]);

  useEffect(() => {
    const plate = vehicleNumber.replace(/\s+/g, '').trim();
    if (!plate) {
      setSets([]);
      return;
    }
    let alive = true;
    void api<PhotoSet[]>(`/vehicle-photos?vehicleNumber=${encodeURIComponent(plate)}`)
      .then(rows => {
        // 늦게 온 답이 먼저 온 답을 덮지 않게 — 번호를 고치는 중에 여러 번 부른다
        if (alive) setSets(rows);
      })
      .catch(() => {
        // 사진을 못 받아도 자리는 고칠 수 있어야 한다 — 조용히 넘긴다
        if (alive) setSets([]);
      });
    return () => {
      alive = false;
    };
  }, [vehicleNumber]);

  // 가장 최근에 찍은 묶음 하나만. 여러 벌을 다 펼치면 창이 끝없이 길어진다
  const set = sets[0];
  const shots = set ? SLOTS.map(s => ({ ...s, url: set.photos[s.key] })).filter(s => s.url) : [];
  if (shots.length === 0) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-600">
          <Camera size={12} /> 상품화 사진
        </span>
        <span className="text-[11px] text-slate-400">{dayjs(set.shotOn).format('YY.MM.DD')} 찍음</span>
        {set.memo && <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{set.memo}</span>}
        {/* 사진은 한 달만 들고 있는다 — 언제 사라지는지 여기서도 보여 준다 */}
        {typeof set.daysLeft === 'number' && (
          <span className={`text-[11px] ${set.daysLeft <= 5 ? 'font-bold text-red-500' : 'text-slate-400'}`}>
            D-{set.daysLeft}
          </span>
        )}
      </div>

      {/* 눌러서 크게 본다. 한 장을 열면 좌우로 넘겨 나머지도 본다 */}
      <Image.PreviewGroup>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {shots.map(s => (
            <div key={s.key} className="shrink-0">
              <Image
                src={s.url}
                alt={s.label}
                width={84}
                height={63}
                className="rounded-lg object-cover"
                style={{ objectFit: 'cover' }}
              />
              <p className="mt-0.5 text-center text-[10px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </Image.PreviewGroup>
    </div>
  );
}
