<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api } from '../services/api';

// 채팅 메시지의 단일 첨부(사진/파일) 렌더.
// 보안: 첨부는 멤버십 검증이 걸린 인증 API 로만 접근 가능하므로 <img src> 직접 지정이 불가능.
//  → 이미지: 마운트 시 blob 으로 받아 objectURL 로 표시(썸네일·확대 보기).
//  → 파일:   칩으로 즉시 표시하고, 다운로드 클릭 시에만 blob 을 받아 저장.
// localUrl 이 있으면(=내가 방금 올린 낙관적 메시지) 네트워크 없이 그대로 사용.

interface Attachment {
  id: string;
  kind: 'image' | 'file';
  name: string;
  mime: string;
  size: number;
  url: string; // 인증 필요 — api 인스턴스로 fetch
  localUrl?: string; // 업로드 직후 미리보기용 objectURL(있으면 fetch 생략)
}

const props = defineProps<{ att: Attachment }>();

const imgUrl = ref<string | null>(props.att.localUrl ?? null);
const loading = ref(false);
const failed = ref(false);
let createdObjectUrl: string | null = null; // 우리가 만든 것만 revoke(localUrl 은 부모 소유)
let downloading = false;

async function fetchBlob(): Promise<Blob> {
  const { data } = await api.get<Blob>(props.att.url, { responseType: 'blob' });
  return data;
}

onMounted(async () => {
  if (props.att.kind !== 'image' || imgUrl.value) return;
  loading.value = true;
  try {
    const blob = await fetchBlob();
    createdObjectUrl = URL.createObjectURL(blob);
    imgUrl.value = createdObjectUrl;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
});

function openImage() {
  if (imgUrl.value) window.open(imgUrl.value, '_blank', 'noopener');
}

// 파일 다운로드 — blob 을 받아 a[download] 로 저장(원본 파일명 유지).
async function download() {
  if (downloading) return;
  downloading = true;
  try {
    let href = props.att.localUrl ?? null;
    let temp: string | null = null;
    if (!href) {
      const blob = await fetchBlob();
      temp = URL.createObjectURL(blob);
      href = temp;
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = props.att.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (temp) setTimeout(() => URL.revokeObjectURL(temp!), 4000);
  } catch {
    failed.value = true;
  } finally {
    downloading = false;
  }
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
// 확장자 라벨(파일 칩 아이콘 안)
function extLabel(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return (m?.[1] ?? 'FILE').toUpperCase().slice(0, 4);
}
</script>

<template>
  <!-- 이미지 첨부 -->
  <div v-if="att.kind === 'image'" class="att-img" :class="{ loading }">
    <img
      v-if="imgUrl"
      :src="imgUrl"
      :alt="att.name"
      loading="lazy"
      @click="openImage"
      :title="`${att.name} · ${fmtSize(att.size)}`"
    />
    <div v-else-if="failed" class="att-broken" :title="att.name">이미지를 불러오지 못했어요</div>
    <div v-else class="att-skeleton" aria-label="이미지 불러오는 중"></div>
  </div>

  <!-- 파일 첨부 -->
  <button v-else type="button" class="att-file" @click="download" :disabled="downloading">
    <span class="ic">{{ extLabel(att.name) }}</span>
    <span class="meta">
      <span class="nm" :title="att.name">{{ att.name }}</span>
      <span class="sz">{{ downloading ? '내려받는 중…' : fmtSize(att.size) }}</span>
    </span>
    <span class="dl" aria-hidden="true">⤓</span>
  </button>
</template>

<style scoped>
.att-img {
  border-radius: var(--r-md, 12px);
  overflow: hidden;
  max-width: 240px;
  line-height: 0;
}
.att-img img {
  display: block;
  max-width: 240px;
  max-height: 280px;
  width: auto;
  height: auto;
  object-fit: cover;
  cursor: zoom-in;
  background: color-mix(in srgb, currentColor 6%, transparent);
}
.att-skeleton {
  width: 200px;
  height: 140px;
  border-radius: var(--r-md, 12px);
  background: linear-gradient(
    100deg,
    color-mix(in srgb, currentColor 8%, transparent) 30%,
    color-mix(in srgb, currentColor 16%, transparent) 50%,
    color-mix(in srgb, currentColor 8%, transparent) 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite linear;
}
@keyframes shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
.att-broken {
  width: 200px;
  padding: 18px 12px;
  text-align: center;
  font-size: 0.78rem;
  color: var(--c-ink-muted-48, #888);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-md, 12px);
  line-height: 1.4;
}

/* 파일 칩 */
.att-file {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 260px;
  padding: 8px 12px 8px 8px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-md, 12px);
  background: var(--c-canvas);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.att-file:hover:not(:disabled) {
  border-color: var(--c-primary, #0066cc);
  background: color-mix(in srgb, var(--c-primary, #0066cc) 5%, var(--c-canvas));
}
.att-file:disabled {
  opacity: 0.6;
  cursor: progress;
}
.att-file .ic {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fff;
  background: var(--c-primary, #0066cc);
}
.att-file .meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.att-file .nm {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-ink, var(--c-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}
.att-file .sz {
  font-size: 0.72rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
}
.att-file .dl {
  margin-left: auto;
  font-size: 1.05rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
}

/* 내 메시지(파란 버블) 안에서의 파일 칩 — 어두운 배경 대비 */
:global(.row.mine) .att-file {
  background: color-mix(in srgb, #fff 88%, var(--c-primary, #0066cc));
}
</style>
