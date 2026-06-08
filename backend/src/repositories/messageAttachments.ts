import { getPool } from '../db/connection.js';

export interface AttachmentRow {
  id: number;
  message_id: number;
  kind: 'image' | 'file';
  original_name: string;
  mime_type: string;
  byte_size: number;
  storage_key: string;
}

export interface NewAttachment {
  kind: 'image' | 'file';
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
}

// 한 메시지에 첨부 여러 건을 일괄 저장.
export async function insertMany(messageId: number, items: NewAttachment[]): Promise<void> {
  if (items.length === 0) return;
  const values = items.map((a) => [
    messageId,
    a.kind,
    a.originalName,
    a.mimeType,
    a.byteSize,
    a.storageKey,
  ]);
  await getPool().query(
    `INSERT INTO project_message_attachments
       (message_id, kind, original_name, mime_type, byte_size, storage_key)
     VALUES ?`,
    [values],
  );
}

// 여러 메시지의 첨부를 한 번에 조회(N+1 방지) — id 오름차순.
export async function listByMessageIds(messageIds: number[]): Promise<AttachmentRow[]> {
  if (messageIds.length === 0) return [];
  const [rows] = (await getPool().query(
    `SELECT id, message_id, kind, original_name, mime_type, byte_size, storage_key
       FROM project_message_attachments
      WHERE message_id IN (?)
      ORDER BY id ASC`,
    [messageIds],
  )) as unknown as [AttachmentRow[]];
  return rows;
}

// 단건 조회(다운로드 스트리밍용) — 소속 프로젝트 검증을 위해 message JOIN.
export interface AttachmentWithProject extends AttachmentRow {
  project_id: number;
}
export async function findWithProject(attachmentId: number): Promise<AttachmentWithProject | null> {
  const [rows] = (await getPool().query(
    `SELECT a.id, a.message_id, a.kind, a.original_name, a.mime_type, a.byte_size,
            a.storage_key, m.project_id
       FROM project_message_attachments a
       JOIN project_messages m ON m.id = a.message_id
      WHERE a.id = ?`,
    [attachmentId],
  )) as unknown as [AttachmentWithProject[]];
  return rows[0] ?? null;
}
