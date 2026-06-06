import type { Server } from 'socket.io';

// socket.io Server 싱글턴 보관소. realtime/index.initRealtime 가 설정하고,
// 서비스/라우트(예: REST 폴백 전송)는 emitToProject 로 같은 room 에 브로드캐스트한다.
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

export function projectRoom(projectId: number): string {
  return `project:${projectId}`;
}

// io 가 아직 없으면(테스트 등) 조용히 무시 — 영속은 이미 끝난 상태이므로 안전.
export function emitToProject(projectId: number, event: string, payload: unknown): void {
  io?.to(projectRoom(projectId)).emit(event, payload);
}
