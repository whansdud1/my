import { Errors } from '../../lib/envelope.js';
import * as Members from '../../repositories/projectMembers.js';
import * as Projects from '../../repositories/projects.js';
import * as Messages from '../../repositories/projectMessages.js';
import * as Reads from '../../repositories/messageReads.js';
import * as Attachments from '../../repositories/messageAttachments.js';
import { emitToProject } from '../../realtime/io.js';
import { notify } from '../notification/index.js';

// 새 메시지 알림 본문 길이 제한(미리보기) — notifications.body 컬럼 한도 내로.
const PREVIEW_LEN = 60;

// 팀 채팅 새 메시지를 팀원(발신자 제외)에게 알림으로 발행.
// 같은 채팅방의 메시지는 dedupKey(targetRef=chat:<projectId>)로 5분 버킷 묶음 처리되어
// 메시지가 쏟아져도 알림 한 건으로 그룹핑된다(group_count++).
function notifyNewMessage(projectId: number, sender: ChatMessageDto): void {
  const text = sender.body.trim();
  const preview = text
    ? text.length > PREVIEW_LEN
      ? `${text.slice(0, PREVIEW_LEN)}…`
      : text
    : sender.attachments?.length
      ? '사진/파일을 보냈습니다'
      : '';
  notify('CHAT_MESSAGE', {
    projectId,
    excludeUserId: Number(sender.userId),
    title: `${sender.name}님의 새 메시지`,
    body: preview,
    deepLink: `/projects/${projectId}`,
    targetRef: `chat:${projectId}`,
  });
}

// 팀 채팅 도메인 로직 — socket 핸들러와 REST 라우트가 공유한다.
// 권한: project_members.state = 'ACCEPTED' 인 멤버(=팀장 포함)만 읽기/쓰기 가능.

export interface AttachmentDto {
  id: string;
  kind: 'image' | 'file';
  name: string; // 원본 파일명
  mime: string;
  size: number; // bytes
  url: string; // 인증 필요 — 멤버십 검증 후 스트리밍(GET /projects/:id/attachments/:attId)
}

export interface ChatMessageDto {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
  attachments?: AttachmentDto[]; // 사진/파일 첨부(없으면 생략)
  clientId?: string; // 보낸 클라이언트의 임시 id(낙관적 UI 정합용) — 영속 안 함, 에코로만 전달
}

const MAX_LEN = 2000;

function attachmentDto(projectId: number, a: Attachments.AttachmentRow): AttachmentDto {
  return {
    id: String(a.id),
    kind: a.kind,
    name: a.original_name,
    mime: a.mime_type,
    size: a.byte_size,
    url: `/projects/${projectId}/attachments/${a.id}`,
  };
}

// 채팅 가능 조건: ① 프로젝트가 시작됨(RECRUIT 이 아님) + ② ACCEPTED 멤버. 아니면 403.
export async function assertMember(projectId: number, userId: number): Promise<void> {
  if (!Number.isFinite(projectId)) throw Errors.Validation('잘못된 프로젝트 id');
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound();
  if (project.status === 'RECRUIT') {
    throw Errors.Forbidden('프로젝트가 시작된 후에 팀 채팅을 사용할 수 있습니다');
  }
  const member = await Members.findOne(projectId, userId);
  if (!member || member.state !== 'ACCEPTED') {
    throw Errors.Forbidden('이 프로젝트의 팀원만 채팅에 참여할 수 있습니다');
  }
}

function toDto(row: Messages.MessageRow, attachments?: AttachmentDto[]): ChatMessageDto {
  const dto: ChatMessageDto = {
    id: String(row.id),
    projectId: String(row.project_id),
    userId: String(row.user_id),
    name: row.name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
  if (attachments && attachments.length) dto.attachments = attachments;
  return dto;
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
  notifyNewMessage(projectId, dto);
  return dto;
}

// 첨부(사진/파일) 메시지 전송 — 본문은 선택(첨부만 보낼 수도 있음).
// 메시지 저장 → 첨부 메타 저장 → DTO 구성(첨부 url 포함) → 브로드캐스트.
export async function postMessageWithAttachments(
  projectId: number,
  userId: number,
  bodyRaw: string,
  files: Attachments.NewAttachment[],
  clientId?: string,
): Promise<ChatMessageDto> {
  const body = (bodyRaw ?? '').trim();
  if (body.length > MAX_LEN) throw Errors.Validation(`메시지가 너무 깁니다(최대 ${MAX_LEN}자)`);
  if (files.length === 0) throw Errors.Validation('첨부할 파일이 없습니다');

  await assertMember(projectId, userId);
  const row = await Messages.insert(projectId, userId, body);
  await Attachments.insertMany(row.id, files);
  const saved = await Attachments.listByMessageIds([row.id]);
  const dto = toDto(
    row,
    saved.map((a) => attachmentDto(projectId, a)),
  );
  if (clientId) dto.clientId = clientId;
  emitToProject(projectId, 'message:new', dto);
  notifyNewMessage(projectId, dto);
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
  // 첨부를 한 번에 모아 메시지별로 묶는다(N+1 방지).
  const byMessage = new Map<number, AttachmentDto[]>();
  const attRows = await Attachments.listByMessageIds(rows.map((r) => r.id));
  for (const a of attRows) {
    const list = byMessage.get(a.message_id) ?? [];
    list.push(attachmentDto(projectId, a));
    byMessage.set(a.message_id, list);
  }
  return rows.map((r) => toDto(r, byMessage.get(r.id)));
}

export interface ReadStateDto {
  lastReads: Array<{ userId: string; lastReadId: number }>;
  memberCount: number; // ACCEPTED 멤버 총원(읽음 표시의 "모두 읽음" 판정용)
  myUnread: number;
}

// 읽음 처리 — 커서 전진 후 같은 room 에 read 이벤트 브로드캐스트(다른 멤버의 읽음 표시 갱신).
export async function markRead(
  projectId: number,
  userId: number,
  messageId: number,
): Promise<{ lastReadId: number }> {
  if (!Number.isFinite(messageId) || messageId <= 0) throw Errors.Validation('잘못된 messageId');
  await assertMember(projectId, userId);
  const lastReadId = await Reads.markRead(projectId, userId, messageId);
  emitToProject(projectId, 'read', { userId: String(userId), lastReadId });
  return { lastReadId };
}

// 채팅 초기 렌더용 읽음 상태(멤버별 커서 + 총원 + 내 안읽음).
export async function getReadState(projectId: number, userId: number): Promise<ReadStateDto> {
  await assertMember(projectId, userId);
  const [lastReads, memberCount, myUnread] = await Promise.all([
    Reads.lastReads(projectId),
    Members.countAcceptedByProject(projectId),
    Reads.unreadCount(projectId, userId),
  ]);
  return {
    lastReads: lastReads.map((r) => ({ userId: String(r.userId), lastReadId: r.lastReadId })),
    memberCount,
    myUnread,
  };
}

// 프로필/네비 배지용 — 내 모든 프로젝트의 안읽음 합계 + 프로젝트별.
export async function unreadSummary(
  userId: number,
): Promise<{ total: number; byProject: Record<string, number> }> {
  const rows = await Reads.unreadByUser(userId);
  const byProject: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (r.unread > 0) byProject[String(r.projectId)] = r.unread;
    total += r.unread;
  }
  return { total, byProject };
}
