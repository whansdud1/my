import { mkdirSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { Errors } from '../lib/envelope.js';

// 채팅 첨부 업로드 — 로컬 디스크 저장(multer). 저장 키는 추측 불가능한 nanoid + 원본 확장자.
// 실제 접근은 GET /projects/:id/attachments/:attId(멤버십 검증 후 스트리밍)로만 가능 —
// 디스크 경로는 외부에 직접 노출하지 않는다.

// 업로드 루트(없으면 생성). config.uploads.dir 가 상대경로면 프로세스 CWD 기준으로 절대화.
export const uploadsRoot = path.isAbsolute(config.uploads.dir)
  ? config.uploads.dir
  : path.resolve(process.cwd(), config.uploads.dir);
const chatDir = path.join(uploadsRoot, 'chat');
mkdirSync(chatDir, { recursive: true });

// 로그인 화면 브랜딩 이미지 저장 디렉터리(관리자 전용 업로드).
const brandingDir = path.join(uploadsRoot, 'branding');
mkdirSync(brandingDir, { recursive: true });

// 안전한 확장자만 보존(경로 조작 방지). 알 수 없으면 확장자 없이 저장.
function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatDir),
  filename: (_req, file, cb) => cb(null, `${nanoid(20)}${safeExt(file.originalname)}`),
});

// 실행 파일류는 거부(자료 공유 목적엔 불필요 + 안전). 그 외 이미지/문서/압축 등은 허용.
const BLOCKED_EXT = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.cpl',
  '.jar', '.sh', '.app', '.deb', '.dmg',
]);

export const chatUpload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: config.uploads.maxFiles },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      cb(Errors.Validation(`허용되지 않는 파일 형식입니다: ${ext}`));
      return;
    }
    cb(null, true);
  },
});

// --- 로그인 화면 브랜딩 이미지 업로드 ---
// 관리자만 사용. 단일 이미지 파일(최대 8MB)만 허용한다.
const BRANDING_MAX_BYTES = 8 * 1024 * 1024;

const brandingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, brandingDir),
  filename: (_req, file, cb) => cb(null, `${nanoid(20)}${safeExt(file.originalname)}`),
});

const brandingUpload = multer({
  storage: brandingStorage,
  // 히어로(image) + 하단(darkImage) 두 필드를 한 번에 받을 수 있게 최대 2개 허용(필드별 1개).
  limits: { fileSize: BRANDING_MAX_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(Errors.Validation('이미지 파일만 업로드할 수 있습니다'));
      return;
    }
    cb(null, true);
  },
});

// multer 의 브랜딩 업로드 에러(용량 초과 등)를 도메인 에러로 변환하는 공통 래퍼.
function wrapBrandingHandler(
  handler: (req: unknown, res: unknown, cb: (err?: unknown) => void) => void,
) {
  return (req: unknown, res: unknown, next: (e?: unknown) => void) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = Math.round(BRANDING_MAX_BYTES / (1024 * 1024));
          return next(Errors.Validation(`이미지가 너무 큽니다(최대 ${mb}MB)`));
        }
        return next(Errors.Validation(`업로드 오류: ${err.message}`));
      }
      next(err);
    });
  };
}

// 단일 브랜딩 이미지 업로드.
export function brandingUploadSingle(field: string) {
  return wrapBrandingHandler(
    brandingUpload.single(field) as Parameters<typeof wrapBrandingHandler>[0],
  );
}

// 여러 브랜딩 이미지 필드 업로드(예: 히어로 image + 하단 darkImage). 각 필드 최대 1개.
export function brandingUploadFields(fields: { name: string; maxCount?: number }[]) {
  return wrapBrandingHandler(
    brandingUpload.fields(fields.map((f) => ({ name: f.name, maxCount: f.maxCount ?? 1 }))) as Parameters<
      typeof wrapBrandingHandler
    >[0],
  );
}

// multer 의 에러(용량 초과 등)를 도메인 에러로 변환하는 래퍼.
export function chatUploadArray(field: string) {
  const handler = chatUpload.array(field, config.uploads.maxFiles);
  return (req: Parameters<typeof handler>[0], res: Parameters<typeof handler>[1], next: (e?: unknown) => void) => {
    handler(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const mb = Math.round(config.uploads.maxBytes / (1024 * 1024));
          return next(Errors.Validation(`파일이 너무 큽니다(최대 ${mb}MB)`));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(Errors.Validation(`파일은 한 번에 최대 ${config.uploads.maxFiles}개까지 보낼 수 있어요`));
        }
        return next(Errors.Validation(`업로드 오류: ${err.message}`));
      }
      next(err);
    });
  };
}
