<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import {
  brandingApi,
  type SiteBranding,
  type BrandingImageMode,
} from '../../services/brandingApi';
import { useNotificationsStore } from '../../stores/notifications';

// 관리자 — 메인(첫 진입) 화면 브랜딩 편집(배너 이미지·헤드라인·보조문구).

const toast = useNotificationsStore();

const headline = ref('');
const subtext = ref('');
const darkHeadline = ref(''); // 하단 검은색 영역 — 헤드라인
const darkSubtext = ref(''); // 하단 검은색 영역 — 설명 문구
const darkCta = ref(''); // 하단 검은색 영역 — 버튼 라벨
const currentImageUrl = ref<string | null>(null);
const removeImage = ref(false);
const imageScale = ref(100); // 배너 이미지 표시 배율(%) 30~150
const imageMode = ref<BrandingImageMode>('banner'); // 표시 방식 — 배너(상단) | 배경 전체

const file = ref<File | null>(null);
const localPreview = ref<string | null>(null); // 선택한 새 파일의 미리보기

// 하단 검은색 영역 이미지 상태(히어로와 동일 구조)
const darkCurrentImageUrl = ref<string | null>(null);
const removeDarkImage = ref(false);
const darkImageScale = ref(100);
const darkImageMode = ref<BrandingImageMode>('banner');
const darkFile = ref<File | null>(null);
const darkLocalPreview = ref<string | null>(null);

const loading = ref(true);
const saving = ref(false);

// 미리보기에 보일 이미지: 새로 고른 파일 > (제거 안 했으면) 현재 이미지 > 없음
const previewUrl = computed(() => {
  if (localPreview.value) return localPreview.value;
  if (removeImage.value) return null;
  return currentImageUrl.value;
});

// 미리보기 배너 크기 — 기본(폭 100%·최대높이 220px)에 배율을 곱한다.
const previewBannerStyle = computed(() => ({
  width: `${imageScale.value}%`,
  maxHeight: `${Math.round(220 * (imageScale.value / 100))}px`,
}));

const isBackground = computed(() => imageMode.value === 'background');

// 배경 전체 모드일 때 미리보기 히어로 카드에 깔 배경 이미지.
const previewHeroStyle = computed(() =>
  isBackground.value && previewUrl.value
    ? { backgroundImage: `url("${previewUrl.value}")` }
    : {},
);

// --- 하단 검은색 영역 이미지 미리보기 (히어로와 동일 로직) ---
const darkPreviewUrl = computed(() => {
  if (darkLocalPreview.value) return darkLocalPreview.value;
  if (removeDarkImage.value) return null;
  return darkCurrentImageUrl.value;
});
const darkPreviewBannerStyle = computed(() => ({
  width: `${darkImageScale.value}%`,
  maxHeight: `${Math.round(180 * (darkImageScale.value / 100))}px`,
}));
const darkIsBackground = computed(() => darkImageMode.value === 'background');
const darkPreviewCardStyle = computed(() =>
  darkIsBackground.value && darkPreviewUrl.value
    ? { backgroundImage: `url("${darkPreviewUrl.value}")` }
    : {},
);

function applyBranding(b: SiteBranding) {
  headline.value = b.headline ?? '';
  subtext.value = b.subtext ?? '';
  darkHeadline.value = b.darkHeadline ?? '';
  darkSubtext.value = b.darkSubtext ?? '';
  darkCta.value = b.darkCta ?? '';
  currentImageUrl.value = b.imageUrl;
  imageScale.value = b.imageScale ?? 100;
  imageMode.value = b.imageMode ?? 'banner';
  darkCurrentImageUrl.value = b.darkImageUrl;
  darkImageScale.value = b.darkImageScale ?? 100;
  darkImageMode.value = b.darkImageMode ?? 'banner';
}

async function load() {
  loading.value = true;
  try {
    applyBranding(await brandingApi.get());
  } catch (e) {
    toast.error((e as { detail?: string }).detail ?? '브랜딩 설정을 불러오지 못했습니다.');
  } finally {
    loading.value = false;
  }
}

function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0] ?? null;
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    toast.error('이미지 파일만 선택할 수 있습니다.');
    input.value = '';
    return;
  }
  file.value = f;
  removeImage.value = false;
  if (localPreview.value) URL.revokeObjectURL(localPreview.value);
  localPreview.value = URL.createObjectURL(f);
}

function clearImage() {
  file.value = null;
  if (localPreview.value) {
    URL.revokeObjectURL(localPreview.value);
    localPreview.value = null;
  }
  // 현재 저장된 이미지가 있으면 "제거" 플래그를 세운다.
  removeImage.value = !!currentImageUrl.value;
}

function onPickDarkFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0] ?? null;
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    toast.error('이미지 파일만 선택할 수 있습니다.');
    input.value = '';
    return;
  }
  darkFile.value = f;
  removeDarkImage.value = false;
  if (darkLocalPreview.value) URL.revokeObjectURL(darkLocalPreview.value);
  darkLocalPreview.value = URL.createObjectURL(f);
}

function clearDarkImage() {
  darkFile.value = null;
  if (darkLocalPreview.value) {
    URL.revokeObjectURL(darkLocalPreview.value);
    darkLocalPreview.value = null;
  }
  removeDarkImage.value = !!darkCurrentImageUrl.value;
}

async function save() {
  saving.value = true;
  try {
    const updated = await brandingApi.update({
      headline: headline.value,
      subtext: subtext.value,
      darkHeadline: darkHeadline.value,
      darkSubtext: darkSubtext.value,
      darkCta: darkCta.value,
      image: file.value,
      removeImage: removeImage.value,
      imageScale: imageScale.value,
      imageMode: imageMode.value,
      darkImage: darkFile.value,
      removeDarkImage: removeDarkImage.value,
      darkImageScale: darkImageScale.value,
      darkImageMode: darkImageMode.value,
    });
    applyBranding(updated);
    // 로컬 임시 상태 정리
    file.value = null;
    if (localPreview.value) {
      URL.revokeObjectURL(localPreview.value);
      localPreview.value = null;
    }
    removeImage.value = false;
    darkFile.value = null;
    if (darkLocalPreview.value) {
      URL.revokeObjectURL(darkLocalPreview.value);
      darkLocalPreview.value = null;
    }
    removeDarkImage.value = false;
    toast.success('메인 화면을 저장했습니다.');
  } catch (e) {
    toast.error((e as { detail?: string }).detail ?? '저장에 실패했습니다.');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="page">
    <h1>메인 화면 편집</h1>
    <p class="hint">
      사이트에 처음 들어오면 보이는 메인 화면의 배너 이미지와 문구를 설정합니다. 저장하면 즉시 반영됩니다.
    </p>

    <div v-if="loading" class="empty">불러오는 중…</div>

    <div v-else class="grid">
      <!-- 편집 폼 -->
      <form class="form card" @submit.prevent="save">
        <label class="field">
          <span>배너 이미지</span>
          <input type="file" accept="image/*" @change="onPickFile" />
          <small class="muted">권장: 가로형 이미지 · 최대 8MB</small>
        </label>

        <button v-if="previewUrl" type="button" class="btn ghost" @click="clearImage">
          이미지 제거
        </button>

        <fieldset v-if="previewUrl" class="field modes">
          <span>표시 방식</span>
          <label class="radio">
            <input type="radio" value="banner" v-model="imageMode" />
            <span>배너 — 문구 위에 가로형 이미지로 표시</span>
          </label>
          <label class="radio">
            <input type="radio" value="background" v-model="imageMode" />
            <span>배경 전체 — 화면을 꽉 채우고 문구를 그 위에 표시</span>
          </label>
        </fieldset>

        <label v-if="previewUrl && imageMode === 'banner'" class="field">
          <span>이미지 크기 — {{ imageScale }}%</span>
          <input
            class="range"
            type="range"
            min="30"
            max="150"
            step="5"
            v-model.number="imageScale"
          />
          <small class="muted">슬라이더를 움직이면 오른쪽 미리보기에 즉시 반영됩니다 (30~150%).</small>
        </label>

        <label class="field">
          <span>헤드라인</span>
          <input class="input" v-model="headline" maxlength="120" placeholder="예: UniTeam에 오신 것을 환영합니다" />
        </label>

        <label class="field">
          <span>보조 문구</span>
          <input class="input" v-model="subtext" maxlength="300" placeholder="예: 대학생 팀 프로젝트, 더 합리적인 매칭으로." />
        </label>

        <hr class="sep" />
        <p class="section-title">하단 검은색 영역</p>

        <label class="field">
          <span>헤드라인</span>
          <textarea
            class="input"
            v-model="darkHeadline"
            maxlength="120"
            rows="2"
            placeholder="최적의 팀을&#10;단 5초에."
          ></textarea>
          <small class="muted">줄바꿈(Enter)은 화면에 그대로 반영됩니다.</small>
        </label>

        <label class="field">
          <span>설명 문구</span>
          <textarea
            class="input"
            v-model="darkSubtext"
            maxlength="400"
            rows="3"
            placeholder="전공·일정·협업 성향·평가 이력을 종합한 6축 가중치로&#10;가장 잘 어울리는 팀원을 추천합니다."
          ></textarea>
        </label>

        <label class="field">
          <span>버튼 문구</span>
          <input class="input" v-model="darkCta" maxlength="40" placeholder="예: 매칭 시작 ›" />
        </label>

        <label class="field">
          <span>이미지</span>
          <input type="file" accept="image/*" @change="onPickDarkFile" />
          <small class="muted">권장: 가로형 이미지 · 최대 8MB</small>
        </label>

        <button v-if="darkPreviewUrl" type="button" class="btn ghost" @click="clearDarkImage">
          이미지 제거
        </button>

        <fieldset v-if="darkPreviewUrl" class="field modes">
          <span>표시 방식</span>
          <label class="radio">
            <input type="radio" value="banner" v-model="darkImageMode" />
            <span>배너 — 문구 위에 가로형 이미지로 표시</span>
          </label>
          <label class="radio">
            <input type="radio" value="background" v-model="darkImageMode" />
            <span>배경 전체 — 영역을 꽉 채우고 문구를 그 위에 표시</span>
          </label>
        </fieldset>

        <label v-if="darkPreviewUrl && darkImageMode === 'banner'" class="field">
          <span>이미지 크기 — {{ darkImageScale }}%</span>
          <input
            class="range"
            type="range"
            min="30"
            max="150"
            step="5"
            v-model.number="darkImageScale"
          />
          <small class="muted">슬라이더를 움직이면 오른쪽 미리보기에 즉시 반영됩니다 (30~150%).</small>
        </label>

        <button class="btn primary" :disabled="saving">
          {{ saving ? '저장 중…' : '저장' }}
        </button>
      </form>

      <!-- 미리보기 (실제 메인 화면 히어로와 유사하게) -->
      <div class="preview">
        <span class="preview-label">미리보기</span>
        <div class="hero-card" :class="{ 'hero-card--bg': isBackground && previewUrl }" :style="previewHeroStyle">
          <img
            v-if="previewUrl && !isBackground"
            :src="previewUrl"
            alt=""
            class="hero-banner"
            :style="previewBannerStyle"
          />
          <h2>{{ headline || 'UniTeam.' }}</h2>
          <p class="lead-sm muted">{{ subtext || '대학생 팀 프로젝트, 더 합리적인 매칭으로.' }}</p>
          <div class="fake-ctas">
            <div class="fake-btn primary">시작하기</div>
            <div class="fake-btn ghost">로그인 ›</div>
          </div>
        </div>

        <!-- 하단 검은색 영역 미리보기 -->
        <div
          class="dark-card"
          :class="{ 'dark-card--bg': darkIsBackground && darkPreviewUrl }"
          :style="darkPreviewCardStyle"
        >
          <img
            v-if="darkPreviewUrl && !darkIsBackground"
            :src="darkPreviewUrl"
            alt=""
            class="dark-banner"
            :style="darkPreviewBannerStyle"
          />
          <h2 class="dark-h">{{ darkHeadline || '최적의 팀을\n단 5초에.' }}</h2>
          <p class="dark-sub">{{
            darkSubtext ||
            '전공·일정·협업 성향·평가 이력을 종합한 6축 가중치로\n가장 잘 어울리는 팀원을 추천합니다.'
          }}</p>
          <div class="fake-btn primary">{{ darkCta || '매칭 시작 ›' }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  max-width: 920px;
}
.hint {
  color: var(--c-ink-muted-80, #6b7280);
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-xl, 24px);
  align-items: start;
  margin-top: var(--s-lg, 16px);
}
.card {
  border: 1px solid var(--c-hairline, #e5e7eb);
  border-radius: var(--r-lg, 16px);
  padding: var(--s-xl, 24px);
  background: var(--c-canvas, #fff);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-md, 12px);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > span {
  font-size: 14px;
  color: var(--c-ink-muted-80, #374151);
}
.btn.primary {
  width: 100%;
  margin-top: var(--s-xs, 4px);
}
.btn.ghost {
  align-self: flex-start;
  background: transparent;
  border: 1px solid var(--c-hairline, #e5e7eb);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.85rem;
}

/* ---- 미리보기 ---- */
.preview-label {
  display: block;
  font-size: 12px;
  letter-spacing: -0.12px;
  color: var(--c-ink-muted-80, #6b7280);
  margin-bottom: 8px;
}
.preview .hero-card {
  background: var(--c-canvas, #fff);
  border-radius: var(--r-lg, 16px);
  padding: var(--s-xxl, 32px);
  border: 1px solid var(--c-hairline, #e5e7eb);
  text-align: center;
}
/* 배경 전체 모드 — 이미지를 카드 전체에 깔고 흰 스크림 위에 문구를 올린다. */
.preview .hero-card--bg {
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.preview .hero-card--bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.55); /* 가독성 스크림 */
}
.preview .hero-card--bg > * {
  position: relative; /* 문구·버튼을 스크림 위로 */
}
.hero-banner {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: var(--r-md, 12px);
  margin: 0 auto var(--s-lg, 16px); /* 축소 시 가운데 정렬 */
}
.range {
  width: 100%;
  accent-color: var(--c-primary, #2563eb);
}
.modes {
  border: 0;
  padding: 0;
  margin: 0;
}
.modes > span {
  font-size: 14px;
  color: var(--c-ink-muted-80, #374151);
  margin-bottom: 4px;
}
.radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--c-ink-muted-80, #374151);
  cursor: pointer;
}
.radio input {
  accent-color: var(--c-primary, #2563eb);
}
.preview h2 {
  font-size: 28px;
  margin-bottom: var(--s-xs, 4px);
}
.lead-sm {
  font-size: 15px;
  margin-bottom: var(--s-lg, 16px);
  color: var(--c-ink-muted-48, #6b7280);
}
.fake-ctas {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.fake-btn {
  height: 40px;
  padding: 0 18px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
}
.fake-btn.primary {
  background: var(--c-primary, #2563eb);
  color: #fff;
}
.fake-btn.ghost {
  background: transparent;
  border: 1px solid var(--c-hairline, #e5e7eb);
  color: var(--c-ink-muted-80, #374151);
}

/* 폼 — 검은색 영역 구획 */
.sep {
  border: 0;
  border-top: 1px solid var(--c-hairline, #e5e7eb);
  margin: var(--s-sm, 8px) 0;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-ink-muted-80, #374151);
  margin: 0;
}
.form textarea.input {
  font: inherit;
  resize: vertical;
  white-space: pre-wrap;
}

/* 미리보기 — 하단 검은색 영역 */
.preview .dark-card {
  margin-top: var(--s-md, 12px);
  background: #111418;
  border-radius: var(--r-lg, 16px);
  padding: var(--s-xxl, 32px);
  text-align: center;
}
.dark-card .dark-h {
  color: #fff;
  font-size: 24px;
  margin: 0 0 var(--s-sm, 8px);
  white-space: pre-line;
}
.dark-card .dark-sub {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin: 0 0 var(--s-lg, 16px);
  white-space: pre-line;
}
.dark-card .dark-banner {
  display: block;
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: var(--r-md, 12px);
  margin: 0 auto var(--s-lg, 16px);
}
/* 배경 전체 모드 — 이미지를 카드 전체에 깔고 어두운 스크림 위에 문구를 올린다. */
.preview .dark-card--bg {
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.preview .dark-card--bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5); /* 가독성 스크림(어두운 영역이므로 검은색) */
}
.preview .dark-card--bg > * {
  position: relative; /* 문구·버튼을 스크림 위로 */
}

@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
