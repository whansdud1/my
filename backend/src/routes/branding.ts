import { Router } from 'express';
import { existsSync, unlink } from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthedRequest } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { brandingUploadFields, uploadsRoot } from '../middlewares/upload.js';
import { ok, Errors } from '../lib/envelope.js';
import * as Branding from '../repositories/branding.js';
import { audit } from '../services/audit.js';
import { logger } from '../lib/logger.js';

// 로그인 화면 브랜딩 — 비로그인 사용자도 보는 GET 은 공개, 편집(PUT)은 관리자 전용.

export const brandingRouter = Router();

// 배너 이미지 표시 배율(%)을 허용 범위(30~150)로 클램프. 숫자가 아니면 fallback.
function clampScale(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(150, Math.max(30, Math.round(n)));
}

// 표시 방식 — 허용된 값만 통과, 그 외엔 fallback.
function normMode(v: unknown, fallback: Branding.BrandingImageMode): Branding.BrandingImageMode {
  return v === 'banner' || v === 'background' ? v : fallback;
}

// 저장된 브랜딩 이미지를 가리키는 공개 URL. 캐시 무효화를 위해 updated_at 을 버전으로 붙인다.
function imageUrl(path: 'image' | 'dark-image', updatedAt: Date): string {
  return `/api/v1/branding/login/${path}?v=${updatedAt.getTime()}`;
}

// 브랜딩 응답 직렬화 — GET/PUT 공통.
function serialize(row: Branding.LoginBrandingRow) {
  return {
    headline: row.headline,
    subtext: row.subtext,
    darkHeadline: row.dark_headline,
    darkSubtext: row.dark_subtext,
    darkCta: row.dark_cta,
    imageUrl: row.image_key ? imageUrl('image', row.updated_at) : null,
    imageScale: row.image_scale,
    imageMode: row.image_mode,
    darkImageUrl: row.dark_image_key ? imageUrl('dark-image', row.updated_at) : null,
    darkImageScale: row.dark_image_scale,
    darkImageMode: row.dark_image_mode,
  };
}

// 저장된 이미지 파일을 스트리밍(경로 조작 방지 후 sendFile). 키가 없으면 404.
function streamImage(
  res: import('express').Response,
  next: (e?: unknown) => void,
  imageKey: string | null,
  imageMime: string | null,
): void {
  if (!imageKey) return next(Errors.NotFound('등록된 이미지가 없습니다'));
  // 경로 조작 방지 — 저장 키를 절대경로화한 뒤 업로드 루트 밖이면 거부.
  const absPath = path.resolve(uploadsRoot, imageKey);
  if (!absPath.startsWith(uploadsRoot + path.sep)) {
    return next(Errors.NotFound('이미지를 찾을 수 없습니다'));
  }
  res.sendFile(
    absPath,
    {
      headers: {
        'Content-Type': imageMime ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    },
    (err) => {
      if (err && !res.headersSent) next(Errors.NotFound('이미지를 읽을 수 없습니다'));
    },
  );
}

// --- GET /branding/login — 공개. 로그인 페이지가 렌더에 사용. ---
brandingRouter.get('/branding/login', async (_req, res, next) => {
  try {
    res.json(ok(serialize(await Branding.getLoginBranding())));
  } catch (e) {
    next(e);
  }
});

// --- GET /branding/login/image — 공개. 히어로(상단) 이미지를 스트리밍. ---
brandingRouter.get('/branding/login/image', async (_req, res, next) => {
  try {
    const row = await Branding.getLoginBranding();
    streamImage(res, next, row.image_key, row.image_mime);
  } catch (e) {
    next(e);
  }
});

// --- GET /branding/login/dark-image — 공개. 하단 검은색 영역 이미지를 스트리밍. ---
brandingRouter.get('/branding/login/dark-image', async (_req, res, next) => {
  try {
    const row = await Branding.getLoginBranding();
    streamImage(res, next, row.dark_image_key, row.dark_image_mime);
  } catch (e) {
    next(e);
  }
});

// 저장된 이전 이미지 파일을 비동기 삭제(실패해도 흐름 막지 않음).
function deleteStoredImage(imageKey: string | null): void {
  if (!imageKey) return;
  const absPath = path.resolve(uploadsRoot, imageKey);
  if (!absPath.startsWith(uploadsRoot + path.sep) || !existsSync(absPath)) return;
  unlink(absPath, (err) => {
    if (err) logger.warn({ err, imageKey }, 'failed to delete old branding image');
  });
}

// --- PUT /admin/branding/login — 관리자 전용. 이미지/문구 편집. ---
// multipart/form-data:
//   image           (선택) 새 히어로 배너 이미지 파일
//   removeImage     (선택) 'true' 면 기존 히어로 이미지 제거
//   imageScale      (선택) 히어로 이미지 표시 배율(%) 30~150
//   imageMode       (선택) 히어로 표시 방식 'banner' | 'background'
//   headline        (선택) 헤드라인 텍스트
//   subtext         (선택) 보조 문구
//   darkHeadline    (선택) 하단 검은색 영역 헤드라인
//   darkSubtext     (선택) 하단 검은색 영역 설명 문구
//   darkCta         (선택) 하단 검은색 영역 버튼 라벨
//   darkImage       (선택) 새 하단 검은색 영역 이미지 파일
//   removeDarkImage (선택) 'true' 면 기존 하단 이미지 제거
//   darkImageScale  (선택) 하단 이미지 표시 배율(%) 30~150
//   darkImageMode   (선택) 하단 표시 방식 'banner' | 'background'
brandingRouter.put(
  '/admin/branding/login',
  requireAuth,
  requireRole('ADMIN'),
  brandingUploadFields([{ name: 'image' }, { name: 'darkImage' }]),
  async (req: AuthedRequest, res, next) => {
    try {
      const current = await Branding.getLoginBranding();
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const isTrue = (v: unknown) => v === 'true' || v === '1';

      // 업로드 파일/제거 요청에 따라 이미지 키·MIME 을 결정(새 파일 > 제거 > 기존 유지).
      // 교체/제거된 기존 파일은 디스크에서 정리한다.
      const resolveImage = (
        file: Express.Multer.File | undefined,
        remove: boolean,
        curKey: string | null,
        curMime: string | null,
      ): { key: string | null; mime: string | null } => {
        if (file) {
          deleteStoredImage(curKey);
          return { key: path.relative(uploadsRoot, file.path), mime: file.mimetype };
        }
        if (remove) {
          deleteStoredImage(curKey);
          return { key: null, mime: null };
        }
        return { key: curKey, mime: curMime };
      };

      const hero = resolveImage(
        files?.image?.[0],
        isTrue(req.body?.removeImage),
        current.image_key,
        current.image_mime,
      );
      const dark = resolveImage(
        files?.darkImage?.[0],
        isTrue(req.body?.removeDarkImage),
        current.dark_image_key,
        current.dark_image_mime,
      );

      // 텍스트: 필드가 오면 trim 후 빈 문자열은 null 로 저장, 안 오면 기존 유지.
      const norm = (v: unknown, fallback: string | null): string | null => {
        if (typeof v !== 'string') return fallback;
        const t = v.trim();
        return t === '' ? null : t;
      };
      const headline = norm(req.body?.headline, current.headline);
      const subtext = norm(req.body?.subtext, current.subtext);
      const darkHeadline = norm(req.body?.darkHeadline, current.dark_headline);
      const darkSubtext = norm(req.body?.darkSubtext, current.dark_subtext);
      const darkCta = norm(req.body?.darkCta, current.dark_cta);
      const imageScale =
        req.body?.imageScale === undefined
          ? current.image_scale
          : clampScale(req.body.imageScale, current.image_scale);
      const imageMode =
        req.body?.imageMode === undefined
          ? current.image_mode
          : normMode(req.body.imageMode, current.image_mode);
      const darkImageScale =
        req.body?.darkImageScale === undefined
          ? current.dark_image_scale
          : clampScale(req.body.darkImageScale, current.dark_image_scale);
      const darkImageMode =
        req.body?.darkImageMode === undefined
          ? current.dark_image_mode
          : normMode(req.body.darkImageMode, current.dark_image_mode);

      await Branding.updateLoginBranding({
        imageKey: hero.key,
        imageMime: hero.mime,
        imageScale,
        imageMode,
        headline,
        subtext,
        darkHeadline,
        darkSubtext,
        darkCta,
        darkImageKey: dark.key,
        darkImageMime: dark.mime,
        darkImageScale,
        darkImageMode,
        updatedBy: req.user!.id,
      });

      await audit({
        actorId: req.user!.id,
        action: 'LOGIN_BRANDING_UPDATE',
        targetType: 'login_branding',
        targetId: 1,
        meta: {
          hasImage: hero.key !== null,
          imageScale,
          imageMode,
          headline,
          subtext,
          darkHeadline,
          darkSubtext,
          darkCta,
          hasDarkImage: dark.key !== null,
          darkImageScale,
          darkImageMode,
        },
      });

      res.json(ok(serialize(await Branding.getLoginBranding())));
    } catch (e) {
      next(e);
    }
  },
);
