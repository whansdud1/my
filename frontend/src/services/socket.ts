import { io, type Socket } from 'socket.io-client';
import { readAccessToken, refreshAccessToken } from './api';

// 팀 채팅 실시간 통로. 백엔드 socket.io 는 '/api/socket.io' 에 부착되어 있어
// 운영(Nginx /api/)·개발(Vite proxy /api) 모두 별도 설정 없이 동일 origin 으로 연결된다.
//
// auth 를 함수형으로 전달 — (재)연결 때마다 최신 액세스 토큰을 읽어 핸드셰이크에 싣는다.

let socket: Socket | null = null;
let recovering = false;

export function getSocket(): Socket {
  if (socket) return socket;
  const s = io({
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: readAccessToken() ?? '' }),
  });

  // 액세스 토큰 만료로 핸드셰이크가 거절되면(서버 미들웨어가 'unauthorized'),
  // refresh 로 새 토큰을 받은 뒤 재연결을 시도한다(장시간 세션에서 영구 끊김 방지).
  s.on('connect_error', async (err: Error) => {
    if (err.message !== 'unauthorized' || recovering) return;
    recovering = true;
    try {
      await refreshAccessToken();
      s.connect();
    } catch {
      /* refresh 실패(세션 만료) — API 인터셉터가 로그인으로 보낸다 */
    } finally {
      recovering = false;
    }
  });

  socket = s;
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
