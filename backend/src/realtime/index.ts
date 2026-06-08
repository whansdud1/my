import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { verifyAccess } from '../services/auth/tokens.js';
import * as Chat from '../services/chat/index.js';
import { setIo, projectRoom } from './io.js';

// 팀 채팅 실시간 계층 — socket.io 를 HTTP 서버에 부착한다.
// 경로는 '/api/socket.io' 로 둬서 Nginx 의 /api/ (WebSocket Upgrade 허용) 와
// Vite dev proxy(/api) 를 그대로 탄다. 별도 인프라 변경 불필요.

interface SocketUser {
  id: number;
  email: string;
  role: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
}

export function initRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: { origin: config.cors.origins, credentials: true },
  });

  // 핸드셰이크 인증 — 클라이언트가 auth.token 으로 액세스 JWT 전달.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccess(String(token));
      socket.data.user = {
        id: Number(payload.sub),
        email: payload.email,
        role: payload.role,
      } satisfies SocketUser;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // 소켓 전송 플러드 방지 — 소켓당 슬라이딩 윈도우(REST 경로는 apiRateLimit 가 별도로 보호).
  const RATE_MAX = 8;
  const RATE_WINDOW_MS = 3000;

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    let sendTimestamps: number[] = [];

    // 프로젝트 채팅방 입장 — ACCEPTED 멤버만 허용.
    socket.on('room:join', async (projectId: unknown, ack?: (r: unknown) => void) => {
      const pid = Number(projectId);
      try {
        await Chat.assertMember(pid, user.id);
        await socket.join(projectRoom(pid));
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.on('room:leave', (projectId: unknown) => {
      void socket.leave(projectRoom(Number(projectId)));
    });

    // 메시지 전송 — 영속 + 같은 room 전체에 message:new 브로드캐스트(발신자 포함).
    socket.on(
      'message:send',
      async (
        payload: { projectId?: unknown; body?: unknown; clientId?: unknown },
        ack?: (r: unknown) => void,
      ) => {
        try {
          const now = Date.now();
          sendTimestamps = sendTimestamps.filter((t) => now - t < RATE_WINDOW_MS);
          if (sendTimestamps.length >= RATE_MAX) {
            ack?.({ ok: false, error: '메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.' });
            return;
          }
          sendTimestamps.push(now);

          const dto = await Chat.postMessage(
            Number(payload?.projectId),
            user.id,
            String(payload?.body ?? ''),
            payload?.clientId ? String(payload.clientId) : undefined,
          );
          ack?.({ ok: true, message: dto });
        } catch (e) {
          ack?.({ ok: false, error: (e as Error).message });
        }
      },
    );

    // 읽음 처리 — 커서 전진 + room 에 read 브로드캐스트(다른 멤버 읽음표시 갱신).
    socket.on('read', async (payload: { projectId?: unknown; messageId?: unknown }) => {
      try {
        await Chat.markRead(Number(payload?.projectId), user.id, Number(payload?.messageId));
      } catch {
        /* 비멤버/유효하지 않은 id — 무시 */
      }
    });

    // 타이핑 표시 — 본인 제외 같은 room 에만 중계(영속 없음).
    socket.on('typing', (payload: { projectId?: unknown; typing?: unknown }) => {
      const room = projectRoom(Number(payload?.projectId));
      socket.to(room).emit('typing', {
        userId: String(user.id),
        typing: !!payload?.typing,
      });
    });
  });

  setIo(io);
  logger.info('realtime(socket.io) initialized at /api/socket.io');
  return io;
}
