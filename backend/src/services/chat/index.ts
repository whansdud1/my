import { Errors } from '../../lib/envelope.js';
import * as Members from '../../repositories/projectMembers.js';
import * as Messages from '../../repositories/projectMessages.js';
import { emitToProject } from '../../realtime/io.js';

// 팀 채팅 도메인 로직 — socket 핸들러와 REST 라우트가 공유한다.
// 권한: project_members.state = 'ACCEPTED' 인 멤버(=팀장 포함)만 읽기/쓰기 가능.

export interface ChatMessageDto {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
  clientId?: string; // 보낸 클라이언트의 임시 id(낙관적 UI 정합용) — 영속 안 함, 에코로만 전달
}

const MAX_LEN = 2000;

// ACCEPTED 멤버인지 확인. 아니면 403.
export async function assertMember(projectId: number, userId: number): Promise<void> {
  if (!Number.isFinite(projectId)) throw Errors.Validation('잘못된 프로젝트 id');
  const member = await Members.findOne(projectId, userId);
  if (!member || member.state !== 'ACCEPTED') {
    throw Errors.Forbidden('이 프로젝트의 팀원만 채팅에 참여할 수 있습니다');
  }
}

function toDto(row: Messages.MessageRow): ChatMessageDto {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    name: row.name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

// 메시지 전송: 멤버십 검증 → 저장 → 같은 room 에 실시간 브로드캐스트 → DTO 반환.
// clientId 가 있으면 브로드캐스트/반환 DTO 에 에코해 보낸 쪽의 낙관적 메시지와 1:1 매칭시킨다.
export async function postMessage(
  projectId: number,
  userId: number,
  bodyRaw: string,
  clientId?: string,
): Promise<ChatMessageDto> {
  const body = (bodyRaw ?? '').trim();
  if (!body) throw Errors.Validation('메시지가 비어 있습니다');
  if (body.length > MAX_LEN) throw Errors.Validation(`메시지가 너무 깁니다(최대 ${MAX_LEN}자)`);

  await assertMember(projectId, userId);
  const row = await Messages.insert(projectId, userId, body);
  const dto = toDto(row);
  if (clientId) dto.clientId = clientId;
  emitToProject(projectId, 'message:new', dto);
  return dto;
}

// 히스토리 조회(시간 오름차순). beforeId=더 과거 / afterId=재연결 catch-up.
export async function listMessages(
  projectId: number,
  userId: number,
  opts: { beforeId?: number; afterId?: number; limit?: number } = {},
): Promise<ChatMessageDto[]> {
  await assertMember(projectId, userId);
  const rows = await Messages.listByProject(projectId, opts);
  return rows.map(toDto);
}
