"""MVP 구현 현황 시각화 — data-visualization SKILL 적용 (Apple 디자인 토큰).

생성 차트:
  1) 태스크 진행 게이지 (스택 막대 — 완료 76 / 전체 133)
  2) Phase 별 완료율 (수평 막대)
  3) Backend / Frontend 파일 수 (수평 막대 비교)

style.use 는 SKILL.md 권장 "seaborn-v0_8-whitegrid" + Apple 토큰 오버라이드.
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

# ---- Apple design tokens (from /DESIGN.md) ----
APPLE_INK = "#1d1d1f"
APPLE_INK_MUTED = "#7a7a7a"
APPLE_PRIMARY = "#0066cc"
APPLE_PARCHMENT = "#f5f5f7"
APPLE_CANVAS = "#ffffff"
APPLE_HAIRLINE = "#e0e0e0"
APPLE_DARK = "#272729"
APPLE_SUCCESS = "#34a853"

plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams.update({
    "figure.dpi": 150,
    "figure.facecolor": APPLE_CANVAS,
    "axes.facecolor": APPLE_CANVAS,
    "axes.edgecolor": APPLE_HAIRLINE,
    "axes.labelcolor": APPLE_INK,
    "axes.titlecolor": APPLE_INK,
    "axes.titlesize": 18,
    "axes.titleweight": "semibold",
    "axes.titlepad": 18,
    "axes.labelsize": 11,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.spines.left": False,
    "xtick.color": APPLE_INK_MUTED,
    "ytick.color": APPLE_INK,
    "xtick.labelsize": 11,
    "ytick.labelsize": 12,
    "grid.color": APPLE_HAIRLINE,
    "grid.linewidth": 0.8,
    # 한국어 글리프 우선 (matplotlib은 첫 글꼴부터 글리프 매칭).
    # macOS: Apple SD Gothic Neo 가 한·영 모두 커버.
    "font.family": [
        "Apple SD Gothic Neo",
        "Pretendard",
        "Noto Sans CJK KR",
        "Hiragino Sans",
        "SF Pro Display",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
    ],
    "font.size": 12,
})

OUT = Path(__file__).parent

# ============================================================================
# Chart 1: 태스크 진행 게이지 (스택 막대)
# ============================================================================
DONE = 76
TOTAL = 133
PCT = DONE / TOTAL * 100

fig, ax = plt.subplots(figsize=(11, 3.4))
fig.subplots_adjust(left=0.06, right=0.96, top=0.78, bottom=0.22)

# bar background (전체)
ax.barh([0], [TOTAL], color=APPLE_PARCHMENT, edgecolor=APPLE_HAIRLINE, linewidth=1, height=0.32)
# bar fill (완료)
ax.barh([0], [DONE], color=APPLE_PRIMARY, height=0.32)

# labels
ax.text(DONE / 2, 0, f"{DONE} / {TOTAL}", va="center", ha="center",
        color="white", fontsize=15, fontweight="semibold")
ax.text(TOTAL + 2, 0, f"{PCT:.0f}%", va="center", ha="left",
        color=APPLE_INK, fontsize=22, fontweight="semibold")

ax.set_xlim(0, TOTAL * 1.12)
ax.set_ylim(-0.5, 0.5)
ax.set_yticks([])
ax.set_title("UniTeam · MVP 구현 진척", loc="left")
ax.set_xlabel("Tasks (T001 — T133)")
ax.spines["bottom"].set_visible(False)
ax.tick_params(left=False, bottom=False)

# legend chips
legend_handles = [
    mpatches.Patch(color=APPLE_PRIMARY, label="완료 (Phase 1-6)"),
    mpatches.Patch(color=APPLE_PARCHMENT, label="미완 (US5-US10 + Polish)"),
]
ax.legend(handles=legend_handles, loc="upper left", frameon=False,
          bbox_to_anchor=(0, -0.30), ncol=2, fontsize=11)

fig.savefig(OUT / "mvp_progress.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ mvp_progress.png")

# ============================================================================
# Chart 2: Phase 별 완료율 (수평 막대 with 색상 단계)
# ============================================================================
phases = [
    ("Phase 1 · Setup",            7,  7),
    ("Phase 2 · Foundational",     17, 17),
    ("Phase 3 · US1 회원가입",     18, 18),
    ("Phase 4 · US2 프로젝트",     13, 13),
    ("Phase 5 · US3 매칭",         10, 11),
    ("Phase 6 · US4 평가",         11, 13),
    ("Phase 7 · US5 외부연동",     0,  14),
    ("Phase 8 · US6 위험신호",     0,  6),
    ("Phase 9 · US7 일정",         0,  5),
    ("Phase 10 · US8 이상평가",    0,  8),
    ("Phase 11 · US9 결제",        0,  7),
    ("Phase 12 · US10 개인정보",   0,  6),
    ("Phase 13 · Polish",          0,  8),
]

labels = [p[0] for p in phases]
dones = [p[1] for p in phases]
totals = [p[2] for p in phases]
remaining = [t - d for d, t in zip(dones, totals)]

# 색상: 완료된 phase 는 Action Blue, 미완은 옅은 회색
y_pos = range(len(labels))[::-1]   # 위에서 아래로 정렬

fig, ax = plt.subplots(figsize=(11.5, 7))
fig.subplots_adjust(left=0.30, right=0.96, top=0.92, bottom=0.08)

for i, (lbl, d, t) in enumerate(phases):
    y = list(y_pos)[i]
    # background bar
    ax.barh(y, t, color=APPLE_PARCHMENT, edgecolor=APPLE_HAIRLINE,
            linewidth=0.8, height=0.55)
    # fill
    if d > 0:
        color = APPLE_PRIMARY if d == t else APPLE_INK
        ax.barh(y, d, color=color, height=0.55)
    # 비율 표시
    pct = d / t * 100 if t else 0
    ax.text(t + 0.6, y, f"{d}/{t}  {pct:.0f}%", va="center", ha="left",
            color=APPLE_INK if d == t else APPLE_INK_MUTED,
            fontsize=11, fontweight="semibold" if d == t else "normal")

ax.set_yticks(list(y_pos))
ax.set_yticklabels(labels)
ax.set_xlim(0, max(totals) * 1.30)
ax.set_xlabel("Tasks")
ax.set_title("Phase 별 진척률 (76/133 · 57%)", loc="left")
ax.spines["bottom"].set_visible(False)
ax.tick_params(left=False, bottom=False)
ax.xaxis.set_visible(False)

fig.savefig(OUT / "phase_progress.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ phase_progress.png")

# ============================================================================
# Chart 3: BE/FE 파일 수 (수평 막대 비교)
# ============================================================================
buckets = [
    ("Migrations",           "BE", 6),
    ("Repositories",         "BE", 6),
    ("Services",             "BE", 9),
    ("Routes",               "BE", 6),
    ("Middlewares",          "BE", 6),
    ("Lib / Adapters",       "BE", 5),
    ("Config + bootstrap",   "BE", 7),
    ("Pages (Vue)",          "FE", 14),
    ("Stores (Pinia)",       "FE", 3),
    ("Router + Layout",      "FE", 2),
    ("Services + assets",    "FE", 4),
]

# 정렬: 그룹 → 큰값
buckets_sorted = sorted(buckets, key=lambda x: (x[1], -x[2]))
labels = [b[0] for b in buckets_sorted]
counts = [b[2] for b in buckets_sorted]
colors = [APPLE_PRIMARY if b[1] == "BE" else APPLE_DARK for b in buckets_sorted]

y_pos = list(range(len(labels)))[::-1]

fig, ax = plt.subplots(figsize=(10.5, 6))
fig.subplots_adjust(left=0.30, right=0.94, top=0.88, bottom=0.10)

ax.barh(y_pos, counts, color=colors, height=0.6)
for y, c in zip(y_pos, counts):
    ax.text(c + 0.3, y, str(c), va="center", ha="left",
            color=APPLE_INK, fontsize=12, fontweight="semibold")

ax.set_yticks(y_pos)
ax.set_yticklabels(labels)
ax.set_xlim(0, max(counts) * 1.18)
ax.set_title("코드 구성 — Backend 45개 · Frontend 23개", loc="left")
ax.xaxis.set_visible(False)
ax.spines["bottom"].set_visible(False)
ax.tick_params(left=False, bottom=False)

# legend
legend_handles = [
    mpatches.Patch(color=APPLE_PRIMARY, label="Backend (TypeScript)"),
    mpatches.Patch(color=APPLE_DARK, label="Frontend (TS + Vue)"),
]
ax.legend(handles=legend_handles, loc="lower right", frameon=False, fontsize=11)

fig.savefig(OUT / "code_composition.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ code_composition.png")
print(f"\nAll charts saved → {OUT}")
