// 팀 채팅 서비스 단위 테스트 — 검증 규칙 + 첨부 DTO 구성/병합.
// 리포지토리·realtime io 를 모킹해 DB 없이 도메인 로직만 검증한다(ESM: unstable_mockModule).
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- 모킹 대상(서비스가 import 하는 .js 스펙과 동일 경로) ---
const findOne = jest.fn<(p: number, u: number) => Promise<{ state: string } | null>>();
const countAcceptedByProject = jest.fn<(p: number) => Promise<number>>();
const insertMessage =
  jest.fn<
    (p: number, u: number, body: string) => Promise<{
      id: number;
      project_id: number;
      user_id: number;
      body: string;
      created_at: Date;
      name: string;
    }>
  >();
const listByProject = jest.fn<(p: number, opts: unknown) => Promise<unknown[]>>();
const insertMany = jest.fn<(messageId: number, items: unknown[]) => Promise<void>>();
const listByMessageIds = jest.fn<(ids: number[]) => Promise<unknown[]>>();
const emitToProject = jest.fn();

jest.unstable_mockModule('../../src/repositories/projectMembers.js', () => ({
  findOne,
  countAcceptedByProject,
}));
jest.unstable_mockModule('../../src/repositories/projectMessages.js', () => ({
  insert: insertMessage,
  listByProject,
}));
jest.unstable_mockModule('../../src/repositories/messageReads.js', () => ({
  markRead: jest.fn(),
  lastReads: jest.fn(),
  unreadCount: jest.fn(),
  unreadByUser: jest.fn(),
}));
jest.unstable_mockModule('../../src/repositories/messageAttachments.js', () => ({
  insertMany,
  listByMessageIds,
}));
jest.unstable_mockModule('../../src/realtime/io.js', () => ({ emitToProject }));

// 모킹 등록 후 동적 import (호이스팅 순서 보장)
const Chat = await import('../../src/services/chat/index.js');

const msgRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 10,
  project_id: 1,
  user_id: 7,
  body: '안녕',
  created_at: new Date('2026-06-08T00:00:00.000Z'),
  name: '홍길동',
  ...over,
});
const attRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 100,
  message_id: 10,
  kind: 'file' as const,
  original_name: '자료.pdf',
  mime_type: 'application/pdf',
  byte_size: 2048,
  storage_key: 'chat/abc.pdf',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  findOne.mockResolvedValue({ state: 'ACCEPTED' }); // 기본: 멤버
});

describe('postMessage 검증', () => {
  it('빈 본문은 422(Validation)', async () => {
    await expect(Chat.postMessage(1, 7, '   ')).rejects.toMatchObject({ httpStatus: 422 });
    expect(insertMessage).not.toHaveBeenCalled();
  });

  it('2000자 초과는 422', async () => {
    await expect(Chat.postMessage(1, 7, 'a'.repeat(2001))).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('ACCEPTED 멤버가 아니면 403(Forbidden)', async () => {
    findOne.mockResolvedValue({ state: 'INVITED' });
    await expect(Chat.postMessage(1, 7, '안녕')).rejects.toMatchObject({ httpStatus: 403 });
    findOne.mockResolvedValue(null);
    await expect(Chat.postMessage(1, 7, '안녕')).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('정상 전송 시 DTO 반환 + message:new 브로드캐스트', async () => {
    insertMessage.mockResolvedValue(msgRow());
    const dto = await Chat.postMessage(1, 7, '  안녕  ', 'c-1');
    expect(dto).toMatchObject({ id: '10', projectId: '1', userId: '7', name: '홍길동', body: '안녕', clientId: 'c-1' });
    expect(dto.attachments).toBeUndefined();
    expect(emitToProject).toHaveBeenCalledWith(1, 'message:new', expect.objectContaining({ id: '10' }));
  });
});

describe('postMessageWithAttachments', () => {
  it('첨부가 없으면 422', async () => {
    await expect(Chat.postMessageWithAttachments(1, 7, '', [])).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('본문이 2000자 초과면 422', async () => {
    const file = { kind: 'file' as const, originalName: 'x', mimeType: 'text/plain', byteSize: 1, storageKey: 'chat/x' };
    await expect(Chat.postMessageWithAttachments(1, 7, 'a'.repeat(2001), [file])).rejects.toMatchObject({
      httpStatus: 422,
    });
  });

  it('첨부 메시지 저장 + 첨부 메타 저장 + url 포함 DTO 브로드캐스트', async () => {
    insertMessage.mockResolvedValue(msgRow({ body: '' }));
    listByMessageIds.mockResolvedValue([
      attRow({ id: 100, kind: 'image', original_name: '사진.png', mime_type: 'image/png', byte_size: 555 }),
      attRow({ id: 101, kind: 'file', original_name: '자료.pdf', byte_size: 2048 }),
    ]);
    const files = [
      { kind: 'image' as const, originalName: '사진.png', mimeType: 'image/png', byteSize: 555, storageKey: 'chat/a.png' },
      { kind: 'file' as const, originalName: '자료.pdf', mimeType: 'application/pdf', byteSize: 2048, storageKey: 'chat/b.pdf' },
    ];
    const dto = await Chat.postMessageWithAttachments(1, 7, '', files, 'c-9');

    expect(insertMany).toHaveBeenCalledWith(10, files);
    expect(dto.clientId).toBe('c-9');
    expect(dto.attachments).toHaveLength(2);
    expect(dto.attachments?.[0]).toEqual({
      id: '100',
      kind: 'image',
      name: '사진.png',
      mime: 'image/png',
      size: 555,
      url: '/projects/1/attachments/100', // 멤버십 검증 스트리밍 경로
    });
    expect(dto.attachments?.[1]).toMatchObject({ kind: 'file', name: '자료.pdf', url: '/projects/1/attachments/101' });
    expect(emitToProject).toHaveBeenCalledWith(1, 'message:new', expect.objectContaining({ id: '10' }));
  });
});

describe('listMessages — 첨부 N+1 없이 메시지별 병합', () => {
  it('첨부를 해당 메시지에만 붙이고, 없는 메시지는 attachments 생략', async () => {
    listByProject.mockResolvedValue([msgRow({ id: 10 }), msgRow({ id: 11, body: '두번째' })]);
    listByMessageIds.mockResolvedValue([
      attRow({ id: 100, message_id: 10, kind: 'image', original_name: 's.png', mime_type: 'image/png' }),
      attRow({ id: 200, message_id: 10, kind: 'file', original_name: 'd.pdf' }),
    ]);

    const list = await Chat.listMessages(1, 7);

    // 첨부 조회는 메시지 id 묶음으로 1회만(N+1 방지)
    expect(listByMessageIds).toHaveBeenCalledTimes(1);
    expect(listByMessageIds).toHaveBeenCalledWith([10, 11]);

    const m10 = list.find((m) => m.id === '10');
    const m11 = list.find((m) => m.id === '11');
    expect(m10?.attachments).toHaveLength(2);
    expect(m10?.attachments?.map((a) => a.url)).toEqual([
      '/projects/1/attachments/100',
      '/projects/1/attachments/200',
    ]);
    expect(m11?.attachments).toBeUndefined();
  });
});
