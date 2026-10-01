// pm2 설정 — EC2에서 `pm2 start ecosystem.config.js` 로 띄운다.
module.exports = {
  apps: [
    {
      name: 'anyone-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,

      /*
        메모리를 좁게 쓴다.

        상자가 크지 않아 API가 400M까지 자라면 MySQL과 서로 밀어내다 스왑으로 떨어진다.
        V8에게 먼저 한도를 줘서 그 안에서 치우게 하고(안 주면 상자 메모리를 다 쓸 때까지
        늘린다), 그래도 넘치면 pm2가 재시작한다. 재시작은 마지막 수단이지 평상시 방법이
        아니다.
      */
      /*
        IPv4 로 먼저 나간다.

        텔레그램은 IPv6 주소를 같이 주는데 이 상자에는 IPv6 길이 없다. 그 주소를 먼저
        잡으면 연결이 타임아웃으로 죽는다 — curl 로는 되는데 서버만 못 나가는 꼴이다.

        코드에서도 같은 걸 켜 두었지만(main.ts), 그건 프로그램이 뜬 뒤에 걸려서 그 전에
        만들어진 연결에는 안 먹는다. 명령줄로 주면 처음부터 걸린다.
      */
      node_args: ['--dns-result-order=ipv4first', '--max-old-space-size=256'],

      /*
        재시작은 마지막 수단이다.

        평소 RSS가 220M쯤인데 한도를 340M으로 두면 조금만 몰려도 재시작이 걸린다 —
        한창 쓰는 시간에 끊기는 게 메모리를 조금 더 쓰는 것보다 나쁘다. 힙을 256M으로
        묶어 뒀으니 그 위로 크게 자랄 일이 없고, 이 값은 그래도 새는 때를 대비한 그물이다.
      */
      max_memory_restart: '400M',

      /*
        재시작 폭주를 막는다.

        뜨자마자 죽는 상태에 빠지면 pm2가 쉼 없이 다시 띄우면서 CPU를 100%로 밀어붙인다.
        조금 쉬었다 올리고, 짧은 시간에 여러 번 죽으면 멈춰 세운다 — 멈춰 있는 게
        눈에 띄어야 고친다.
      */
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        /*
          IPv4 로 먼저 나간다.

          이 상자에는 IPv6 길이 없는데 텔레그램은 IPv6 주소를 같이 준다. 그 주소를 먼저
          잡으면 연결이 타임아웃으로 죽는다 — curl -4 는 붙고 curl -6 은 2ms 만에 떨어지는
          것이 그 증거다.

          node_args 로도 줘 봤지만 실제로 뜬 프로세스에는 안 붙어 있었다(ps 로 확인).
          NODE_OPTIONS 는 노드가 뜰 때 스스로 읽으므로 누가 띄우든 걸린다.
        */
        NODE_OPTIONS: '--dns-result-order=ipv4first',
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      time: true,
    },
  ],
};
