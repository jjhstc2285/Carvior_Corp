import { useEffect, useState } from 'react';

// 브라우저에서 접속 공인 IP를 확인 — 프론트엔드 전용 데모라 외부 IP 조회 서비스(ipify)를 쓴다.
// 주의: 이 값은 클라이언트가 스스로 보고하는 값이라 서버가 검증하는 게 아니므로 실제 보안
// 경계가 아니다(우회 가능). 진짜 IP 제한이 필요하면 백엔드에서 요청의 실제 소스 IP를 검사해야 함.
export function useCurrentIp() {
  const [ip, setIp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then((data: { ip: string }) => {
        if (!cancelled) {
          setIp(data.ip);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('현재 IP를 확인할 수 없습니다. 네트워크 연결을 확인해주세요.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { ip, loading, error };
}
