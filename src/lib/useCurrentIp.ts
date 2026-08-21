import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * 서버가 보는 내 IP를 가져온다.
 *
 * 예전엔 외부 서비스(ipify)로 조회했는데, 화이트리스트가 실제로 검사하는 값은
 * 서버에 도달한 요청의 소스 IP다. 둘이 다르면(IPv6/IPv4, 프록시 경유 등)
 * 화면에 보이는 IP를 등록해도 출근이 막히는 일이 생긴다. 그래서 서버 값을 그대로 쓴다.
 */
export function useCurrentIp() {
  const [ip, setIp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ ip: string }>('/attendance/my-ip')
      .then((data) => {
        if (!cancelled) setIp(data.ip);
      })
      .catch(() => {
        if (!cancelled) setError('현재 IP를 확인할 수 없습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ip, loading, error };
}
