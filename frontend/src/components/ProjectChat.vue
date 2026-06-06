<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import type { Socket } from 'socket.io-client';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/auth';
import { useNotificationsStore } from '../stores/notifications';

const props = defineProps<{ projectId: string }>();

interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string;
  clientId?: string; // 낙관적 전송 추적용(서버 에코로 정합)
  pending?: boolean; // 전송 중
  failed?: boolean; // 전송 실패(재시도 가능)
}

const auth = useAuthStore();
const notify = useNotificationsStore();
const myId = computed(() => auth.user?.id ?? '');
const myName = computed(() => auth.user?.name ?? '나');

const messages = ref<ChatMessage[]>([]);
const seen = new Set<string>(); // 서버 id 기준 중복 방지
const draft = ref('');
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = ref(false);
const connected = ref(false);
const atBottom = ref(true);
const unseenNew = ref(0);
const typingNames = ref<string[]>([]);

const listEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
let socket: Socket | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
const typingUsers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>(); // clientId → 전송 실패 판정 타이머
let joinedOnce = false; // 최초 연결 이후의 'connect' 는 재연결 → catch-up 수행
let seq = 0;

const PAGE = 50;
const MAX_LEN = 2000;
const nearLimit = computed(() => draft.value.length > MAX_LEN - 200);

// --- 메시지 컬렉션 헬퍼 ---
function findByClient(clientId: string): ChatMessage | undefined {
  return messages.value.find((m) => m.clientId === clientId);
}
function maxRealId(): number {
  let max = 0;
  for (const m of messages.value) {
    if (m.pending || m.failed) continue;
    const n = Number(m.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
function pushMessage(m: ChatMessage, toEnd = true) {
  if (!m.pending && seen.has(m.id)) return;
  if (!m.pending) seen.add(m.id);
  if (toEnd) messages.value.push(m);
  else messages.value.unshift(m);
}
// 서버 확정본으로 낙관적 메시지를 교체(정합). clientId 매칭 없으면 신규로 추가.
function reconcile(real: ChatMessage) {
  const temp = real.clientId ? findByClient(real.clientId) : undefined;
  if (temp) {
    const t = pendingTimers.get(real.clientId!);
    if (t) {
      clearTimeout(t);
      pendingTimers.delete(real.clientId!);
    }
    temp.id = real.id;
    temp.createdAt = real.createdAt;
    temp.name = real.name;
    temp.pending = false;
    temp.failed = false;
    seen.add(real.id);
  } else {
    pushMessage(real);
  }
}
function markFailed(clientId: string) {
  const m = findByClient(clientId);
  if (m) {
    m.pending = false;
    m.failed = true;
  }
  pendingTimers.delete(clientId);
}

// --- 스크롤 ---
async function scrollToBottom(smooth = false) {
  await nextTick();
  const el = listEl.value;
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  atBottom.value = true;
  unseenNew.value = 0;
}
function isNearBottom(): boolean {
  const el = listEl.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}
function onScroll() {
  const el = listEl.value;
  if (!el) return;
  if (el.scrollTop < 40) void loadMore();
  atBottom.value = isNearBottom();
  if (atBottom.value) unseenNew.value = 0;
}

// --- 로드 ---
async function loadInitial() {
  loading.value = true;
  try {
    const { data } = await api.get<ChatMessage[]>(`/projects/${props.projectId}/messages`, {
      params: { limit: PAGE },
    });
    messages.value = [];
    seen.clear();
    for (const m of data) pushMessage(m);
    hasMore.value = data.length === PAGE;
    await scrollToBottom();
  } finally {
    loading.value = false;
  }
}
async function loadMore() {
  if (loadingMore.value || !hasMore.value || messages.value.length === 0) return;
  loadingMore.value = true;
  const el = listEl.value;
  const prevHeight = el?.scrollHeight ?? 0;
  try {
    const oldest = messages.value.find((m) => !m.pending)?.id;
    if (!oldest) return;
    const { data } = await api.get<ChatMessage[]>(`/projects/${props.projectId}/messages`, {
      params: { before: oldest, limit: PAGE },
    });
    for (let i = data.length - 1; i >= 0; i--) pushMessage(data[i], false);
    hasMore.value = data.length === PAGE;
    await nextTick();
    if (el) el.scrollTop = el.scrollHeight - prevHeight; // 위로 더 불러왔을 때 점프 방지
  } finally {
    loadingMore.value = false;
  }
}
// 재연결 시 끊긴 동안 놓친 메시지 따라잡기
async function catchUp() {
  const after = maxRealId();
  try {
    const { data } = await api.get<ChatMessage[]>(`/projects/${props.projectId}/messages`, {
      params: { after, limit: 100 },
    });
    if (!data.length) return;
    const stick = isNearBottom();
    for (const m of data) pushMessage(m);
    if (stick) await scrollToBottom();
    else unseenNew.value += data.length;
  } catch {
    /* 무시 — 다음 기회에 재시도 */
  }
}

// --- 소켓 ---
function connect() {
  socket = getSocket();
  const join = () => {
    connected.value = true;
    socket?.emit('room:join', props.projectId, (res: { ok: boolean }) => {
      if (!res?.ok) connected.value = false;
    });
    if (joinedOnce) void catchUp(); // 재연결 → 누락분 복구
    joinedOnce = true;
  };
  if (socket.connected) join();
  socket.on('connect', join);
  socket.on('disconnect', () => {
    connected.value = false;
  });

  socket.on('message:new', async (m: ChatMessage) => {
    if (m.projectId !== props.projectId) return;
    // 내가 보낸 메시지의 에코면 낙관적 메시지를 확정본으로 교체
    if (m.clientId && findByClient(m.clientId)) {
      reconcile(m);
      if (isNearBottom()) await scrollToBottom(true);
      return;
    }
    const mine = m.userId === myId.value;
    const stick = isNearBottom() || mine;
    pushMessage(m);
    clearTyping(m.userId);
    if (stick) await scrollToBottom(true);
    else unseenNew.value += 1;
  });

  socket.on('typing', (p: { userId: string; typing: boolean }) => {
    if (p.userId === myId.value) return;
    if (p.typing) {
      const prev = typingUsers.get(p.userId);
      if (prev) clearTimeout(prev);
      typingUsers.set(
        p.userId,
        setTimeout(() => clearTyping(p.userId), 4000),
      );
    } else {
      clearTyping(p.userId);
    }
    refreshTypingNames();
  });
}
function clearTyping(userId: string) {
  const t = typingUsers.get(userId);
  if (t) clearTimeout(t);
  typingUsers.delete(userId);
  refreshTypingNames();
}
function refreshTypingNames() {
  typingNames.value = [...typingUsers.keys()].map(
    (uid) => messages.value.find((m) => m.userId === uid)?.name ?? '팀원',
  );
}

// --- 입력/전송 ---
let lastTypingSent = 0;
function onInput() {
  autoGrow();
  const now = Date.now();
  if (now - lastTypingSent > 1000) {
    socket?.emit('typing', { projectId: props.projectId, typing: true });
    lastTypingSent = now;
  }
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket?.emit('typing', { projectId: props.projectId, typing: false });
    lastTypingSent = 0;
  }, 1500);
}
function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

async function send() {
  const body = draft.value.trim();
  if (!body) return;
  draft.value = '';
  await nextTick();
  autoGrow();
  if (typingTimer) clearTimeout(typingTimer);
  socket?.emit('typing', { projectId: props.projectId, typing: false });
  lastTypingSent = 0;

  // 낙관적 추가 — 즉시 화면에 표시(전송 중 상태)
  const clientId = `c${Date.now()}-${++seq}`;
  pushMessage({
    id: clientId,
    clientId,
    projectId: props.projectId,
    userId: myId.value,
    name: myName.value,
    body,
    createdAt: new Date().toISOString(),
    pending: true,
  });
  await scrollToBottom(true);
  deliver(clientId, body);
}

function deliver(clientId: string, body: string) {
  const m = findByClient(clientId);
  if (m) {
    m.pending = true;
    m.failed = false;
  }
  if (socket?.connected) {
    // 소켓 경로 — ack 또는 broadcast 에코 중 먼저 오는 것으로 정합. REST 중복 없음.
    socket.emit(
      'message:send',
      { projectId: props.projectId, body, clientId },
      (res: { ok: boolean; message?: ChatMessage; error?: string }) => {
        if (res?.ok && res.message) reconcile(res.message);
        else if (res && !res.ok) {
          markFailed(clientId);
          if (res.error) notify.error(res.error);
        }
      },
    );
    const prev = pendingTimers.get(clientId);
    if (prev) clearTimeout(prev);
    pendingTimers.set(
      clientId,
      setTimeout(() => {
        const cur = findByClient(clientId);
        if (cur?.pending) markFailed(clientId); // 8초 내 무응답 → 실패
      }, 8000),
    );
  } else {
    // 소켓 미연결 → REST 폴백
    void sendViaRest(clientId, body);
  }
}

async function sendViaRest(clientId: string, body: string) {
  try {
    const { data } = await api.post<ChatMessage>(`/projects/${props.projectId}/messages`, { body });
    data.clientId = clientId; // 응답엔 clientId 가 없으므로 직접 매칭
    reconcile(data);
    await scrollToBottom(true);
  } catch {
    markFailed(clientId);
    notify.error('메시지 전송에 실패했어요. 메시지를 눌러 다시 시도할 수 있어요.');
  }
}

function retry(m: ChatMessage) {
  if (!m.failed || !m.clientId) return;
  m.failed = false;
  m.pending = true;
  deliver(m.clientId, m.body);
}

// --- 표시 헬퍼 ---
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function showDay(idx: number): boolean {
  if (idx === 0) return true;
  return !sameDay(messages.value[idx - 1].createdAt, messages.value[idx].createdAt);
}
function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '오늘';
  if (d.toDateString() === yest.toDateString()) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}
// 같은 사람이 5분 이내 연속으로 보낸 메시지면 아바타·이름 생략
function isGrouped(idx: number): boolean {
  if (idx === 0 || showDay(idx)) return false;
  const prev = messages.value[idx - 1];
  const cur = messages.value[idx];
  if (prev.userId !== cur.userId) return false;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
}
// 시간은 연속 묶음의 마지막(다음이 다른 사람/다른 분/없음)에만 표시
function showTime(idx: number): boolean {
  const cur = messages.value[idx];
  const next = messages.value[idx + 1];
  if (!next) return true;
  if (next.userId !== cur.userId) return true;
  const a = new Date(cur.createdAt);
  const b = new Date(next.createdAt);
  return a.getHours() !== b.getHours() || a.getMinutes() !== b.getMinutes();
}
function initial(name: string): string {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}
function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
  return `hsl(${h}deg 52% 62%)`;
}

onMounted(async () => {
  await loadInitial();
  connect();
});
onBeforeUnmount(() => {
  if (typingTimer) clearTimeout(typingTimer);
  for (const t of typingUsers.values()) clearTimeout(t);
  for (const t of pendingTimers.values()) clearTimeout(t);
  if (socket) {
    socket.emit('room:leave', props.projectId);
    socket.off('connect');
    socket.off('disconnect');
    socket.off('message:new');
    socket.off('typing');
  }
});
watch(
  () => props.projectId,
  async () => {
    joinedOnce = false;
    await loadInitial();
    socket?.emit('room:join', props.projectId);
  },
);
</script>

<template>
  <div class="chat">
    <div class="chat-head">
      <span class="dot" :class="{ on: connected }" aria-hidden="true"></span>
      <span class="state">{{ connected ? '실시간 연결됨' : '연결 중…' }}</span>
    </div>

    <div class="viewport">
      <div
        ref="listEl"
        class="msgs"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="팀 채팅 메시지"
        @scroll="onScroll"
      >
        <p v-if="loadingMore" class="hint">이전 메시지 불러오는 중…</p>
        <p v-else-if="!hasMore && messages.length" class="hint">대화의 시작이에요.</p>

        <template v-if="loading">
          <p class="hint">불러오는 중…</p>
        </template>
        <template v-else-if="messages.length === 0">
          <p class="empty">아직 대화가 없어요.<br />첫 메시지를 남겨보세요 👋</p>
        </template>

        <template v-for="(m, i) in messages" :key="m.clientId || m.id">
          <div v-if="showDay(i)" class="daysep"><span>{{ fmtDay(m.createdAt) }}</span></div>
          <div class="row" :class="{ mine: m.userId === myId, grouped: isGrouped(i) }">
            <!-- 상대 메시지: 아바타(연속이면 자리만 유지) -->
            <template v-if="m.userId !== myId">
              <div
                v-if="!isGrouped(i)"
                class="avatar"
                :style="{ background: avatarColor(m.userId) }"
                :title="m.name"
              >
                {{ initial(m.name) }}
              </div>
              <div v-else class="avatar spacer" aria-hidden="true"></div>
            </template>

            <div class="bubble-wrap">
              <div v-if="m.userId !== myId && !isGrouped(i)" class="who">{{ m.name }}</div>
              <div class="line">
                <div class="bubble" :class="{ pending: m.pending, failed: m.failed }">{{ m.body }}</div>
                <span v-if="m.pending" class="time st">전송 중…</span>
                <button v-else-if="m.failed" type="button" class="retry" @click="retry(m)">
                  ⚠ 재전송
                </button>
                <span v-else-if="showTime(i)" class="time">{{ fmtTime(m.createdAt) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 맨 아래로 / 새 메시지 -->
      <button
        v-if="!atBottom"
        type="button"
        class="jump"
        :class="{ has: unseenNew > 0 }"
        @click="scrollToBottom(true)"
      >
        <span v-if="unseenNew > 0">새 메시지 {{ unseenNew }} ↓</span>
        <span v-else>맨 아래로 ↓</span>
      </button>
    </div>

    <div class="typing" v-if="typingNames.length">
      <span class="tdots" aria-hidden="true"><i></i><i></i><i></i></span>
      {{ typingNames.join(', ') }} 님이 입력 중…
    </div>

    <form class="composer" @submit.prevent="send">
      <textarea
        ref="inputEl"
        v-model="draft"
        class="input"
        rows="1"
        :maxlength="MAX_LEN"
        placeholder="메시지를 입력하세요  (Enter 전송 · Shift+Enter 줄바꿈)"
        aria-label="메시지 입력"
        @input="onInput"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <span v-if="nearLimit" class="count">{{ draft.length }}/{{ MAX_LEN }}</span>
      <button class="btn primary send" :disabled="!draft.trim()" aria-label="보내기">보내기</button>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 62vh;
  min-height: 440px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--c-canvas);
}
.chat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px var(--s-md);
  border-bottom: 1px solid var(--c-divider-soft, var(--c-border));
  font-size: 0.82rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--c-ink-muted-48, #9aa0a6);
  transition: background 0.2s;
}
.dot.on {
  background: var(--c-success, #34a853);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-success, #34a853) 22%, transparent);
}

/* 메시지 영역 */
.viewport {
  position: relative;
  flex: 1;
  min-height: 0;
}
.msgs {
  height: 100%;
  overflow-y: auto;
  padding: var(--s-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--c-canvas-parchment, #f5f5f7);
  scroll-behavior: smooth;
}
.hint,
.empty {
  text-align: center;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  font-size: 0.85rem;
  margin: 6px 0;
  line-height: 1.5;
}
.empty {
  margin: auto 0;
}
.daysep {
  text-align: center;
  margin: 12px 0 8px;
}
.daysep span {
  background: color-mix(in srgb, var(--c-ink, #1d1d1f) 8%, transparent);
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 12px;
  border-radius: 999px;
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
  animation: pop 0.18s ease-out;
}
.row.grouped {
  margin-top: 2px;
}
.row.mine {
  justify-content: flex-end;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  user-select: none;
}
.avatar.spacer {
  background: none !important;
}
.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 76%;
  min-width: 0;
}
.who {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  margin: 0 0 3px 2px;
}
.line {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.row.mine .line {
  flex-direction: row-reverse;
}
.bubble {
  background: var(--c-canvas);
  border: 1px solid var(--c-border);
  border-radius: 4px var(--r-md) var(--r-md) var(--r-md);
  padding: 8px 12px;
  font-size: 0.95rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.row.grouped:not(.mine) .bubble {
  border-top-left-radius: var(--r-md);
}
.row.mine .bubble {
  background: var(--c-primary, #0066cc);
  border-color: var(--c-primary, #0066cc);
  color: var(--c-on-dark, #fff);
  border-radius: var(--r-md) 4px var(--r-md) var(--r-md);
}
.row.mine.grouped .bubble {
  border-top-right-radius: var(--r-md);
}
.bubble.pending {
  opacity: 0.6;
}
.bubble.failed {
  border-color: var(--c-danger, #b00020);
  background: color-mix(in srgb, var(--c-danger, #b00020) 8%, var(--c-primary, #0066cc));
}
.time {
  flex-shrink: 0;
  font-size: 0.66rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  margin-bottom: 2px;
}
.time.st {
  font-style: italic;
}
.retry {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--c-danger, #b00020);
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin-bottom: 2px;
}

/* 맨 아래로 버튼 */
.jump {
  position: absolute;
  right: 14px;
  bottom: 12px;
  border: 1px solid var(--c-border);
  background: var(--c-canvas);
  color: var(--c-ink, var(--c-fg));
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}
.jump.has {
  background: var(--c-primary, #0066cc);
  border-color: var(--c-primary, #0066cc);
  color: var(--c-on-dark, #fff);
}

/* 타이핑 표시 */
.typing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px var(--s-md);
  font-size: 0.76rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
}
.tdots {
  display: inline-flex;
  gap: 3px;
}
.tdots i {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--c-ink-muted-48, #9aa0a6);
  animation: tdot 1.2s infinite ease-in-out;
}
.tdots i:nth-child(2) {
  animation-delay: 0.18s;
}
.tdots i:nth-child(3) {
  animation-delay: 0.36s;
}
@keyframes tdot {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* 입력 */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px var(--s-md);
  border-top: 1px solid var(--c-divider-soft, var(--c-border));
  background: var(--c-canvas);
}
.composer .input {
  flex: 1;
  resize: none;
  max-height: 120px;
  min-height: 40px;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.4;
}
.composer .count {
  font-size: 0.72rem;
  color: var(--c-warning, #d97706);
  align-self: center;
  white-space: nowrap;
}
.composer .send {
  flex-shrink: 0;
}
@media (max-width: 560px) {
  .bubble-wrap {
    max-width: 82%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .row {
    animation: none;
  }
  .tdots i {
    animation: none;
  }
}
</style>
