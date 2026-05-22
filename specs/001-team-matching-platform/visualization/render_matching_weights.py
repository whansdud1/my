"""매칭 알고리즘 6축 가중치 시각화 — data-visualization SKILL 적용.

생성:
  1) weights_pie_alt.png — 도넛 차트 (가중치 비율) — Apple 컬러
  2) weights_breakdown.png — 후보 3명에 대한 score breakdown 스택 막대
  3) overlap_heatmap.png — 7×24 (요일×시간) 시간 겹침 히트맵 데모

SKILL.md 가이드: "Pie 차트는 6개 이하 카테고리·정확비율 덜 중요할 때만". 6축 ↔ 합 100% ↔
구성 비교 → 도넛 사용 가능. 대안으로 가로 막대도 같이 제공.
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.colors as mcolors
import numpy as np
from pathlib import Path

# Apple tokens
APPLE_INK = "#1d1d1f"
APPLE_INK_MUTED = "#7a7a7a"
APPLE_PRIMARY = "#0066cc"
APPLE_PRIMARY_DARK = "#0071e3"
APPLE_SKY = "#2997ff"
APPLE_CANVAS = "#ffffff"
APPLE_PARCHMENT = "#f5f5f7"
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
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.color": APPLE_INK_MUTED,
    "ytick.color": APPLE_INK,
    "grid.color": APPLE_HAIRLINE,
    "grid.linewidth": 0.6,
    "font.family": [
        "Apple SD Gothic Neo",
        "Pretendard",
        "Noto Sans CJK KR",
        "Hiragino Sans",
        "SF Pro Display",
        "Helvetica Neue",
        "sans-serif",
    ],
    "font.size": 12,
})

OUT = Path(__file__).parent

# weights from backend/src/services/matching/weights.ts WEIGHTS const
WEIGHTS = {
    "Role 균형": 0.30,
    "시간 겹침": 0.25,
    "협업 성향": 0.15,
    "평점": 0.15,
    "다양성": 0.10,
    "신뢰": 0.05,
}

# Apple 컬러 팔레트 — Action Blue 명도 단계
PALETTE = [
    APPLE_PRIMARY,
    APPLE_PRIMARY_DARK,
    APPLE_SKY,
    "#4ba3e0",
    "#8cc4ea",
    "#bcd9ed",
]

# ============================================================================
# Chart 1: 도넛 차트
# ============================================================================
fig, ax = plt.subplots(figsize=(8, 6.5))
fig.subplots_adjust(top=0.88, bottom=0.04, left=0.05, right=0.95)

labels = list(WEIGHTS.keys())
sizes = list(WEIGHTS.values())
wedges, _, autotexts = ax.pie(
    sizes,
    colors=PALETTE,
    startangle=90,
    counterclock=False,
    autopct=lambda p: f"{p:.0f}%",
    pctdistance=0.78,
    wedgeprops={"width": 0.36, "edgecolor": APPLE_CANVAS, "linewidth": 2},
    textprops={"color": "white", "fontsize": 11, "fontweight": "semibold"},
)

# 중앙 라벨
ax.text(0, 0.1, "100", ha="center", va="center",
        fontsize=42, fontweight="semibold", color=APPLE_INK,
        family="SF Pro Display")
ax.text(0, -0.18, "weighted score", ha="center", va="center",
        fontsize=12, color=APPLE_INK_MUTED)

# legend with 비중
legend_handles = [
    mpatches.Patch(color=PALETTE[i], label=f"{lbl}  ·  {sizes[i]*100:.0f}%")
    for i, lbl in enumerate(labels)
]
ax.legend(handles=legend_handles, loc="center left", bbox_to_anchor=(1.02, 0.5),
          frameon=False, fontsize=11)

ax.set_title("매칭 알고리즘 — 가중치 구성 (FR-F1)", loc="left", pad=24)

fig.savefig(OUT / "weights_donut.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ weights_donut.png")

# ============================================================================
# Chart 2: 후보 3명 score breakdown — 스택 막대
# ============================================================================
candidates = ["김민서", "박지원", "이재형"]
breakdowns = np.array([
    [78, 82, 70, 85, 60, 70],   # 김민서
    [62, 90, 65, 75, 85, 80],   # 박지원
    [85, 55, 80, 60, 50, 65],   # 이재형
])  # rows = candidate, cols = (role, overlap, style, rating, diversity, trust)

weights_arr = np.array([0.30, 0.25, 0.15, 0.15, 0.10, 0.05])
contribs = breakdowns * weights_arr  # 각 가중 contribution (0~100*weight)
totals = contribs.sum(axis=1)

fig, ax = plt.subplots(figsize=(10.5, 5.5))
fig.subplots_adjust(left=0.10, right=0.78, top=0.86, bottom=0.16)

y_pos = np.arange(len(candidates))[::-1]
left = np.zeros(len(candidates))
for k, lbl in enumerate(labels):
    ax.barh(y_pos, contribs[:, k], left=left, color=PALETTE[k],
            edgecolor=APPLE_CANVAS, linewidth=1.5, height=0.55, label=lbl)
    left += contribs[:, k]

# total at end
for y, t in zip(y_pos, totals):
    ax.text(t + 1, y, f"{t:.1f}", va="center", ha="left",
            color=APPLE_INK, fontsize=13, fontweight="semibold")

ax.set_yticks(y_pos)
ax.set_yticklabels(candidates, fontsize=13)
ax.set_xlim(0, 110)
ax.set_xlabel("Match Score (0-100)")
ax.set_title("후보별 점수 분해 — 추천 결과 breakdown", loc="left")

ax.legend(loc="center left", bbox_to_anchor=(1.02, 0.5), frameon=False, fontsize=11)
ax.spines["bottom"].set_visible(False)
ax.xaxis.set_visible(False)
ax.tick_params(left=False)

fig.savefig(OUT / "weights_breakdown.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ weights_breakdown.png")

# ============================================================================
# Chart 3: 7×24 시간 겹침 히트맵
# ============================================================================
# 모의 데이터 — 4명 팀의 가능 시간 교집합 (1=가능, 0=불가)
# 평일 야간(18-23시) + 토 오후 + 일요일 종일 패턴
rng = np.random.default_rng(seed=42)
DAYS = ["월", "화", "수", "목", "금", "토", "일"]
HOURS = list(range(24))

team = np.zeros((7, 24), dtype=float)
# 평일 야간
for d in range(0, 5):
    for h in range(18, 23):
        team[d, h] = rng.uniform(0.7, 1.0)
# 토요일 오후
for h in range(13, 20):
    team[5, h] = rng.uniform(0.5, 0.95)
# 일요일 종일
for h in range(10, 22):
    team[6, h] = rng.uniform(0.6, 0.95)
# 노이즈
team += rng.normal(0, 0.05, team.shape)
team = np.clip(team, 0, 1)

# Apple Action Blue 단계 colormap
cmap = mcolors.LinearSegmentedColormap.from_list(
    "apple_blue",
    [APPLE_PARCHMENT, "#cee0f5", "#7fb1e3", APPLE_PRIMARY, APPLE_DARK],
    N=256,
)

fig, ax = plt.subplots(figsize=(11, 4.2))
fig.subplots_adjust(left=0.06, right=0.94, top=0.86, bottom=0.18)

im = ax.imshow(team, cmap=cmap, aspect="auto", vmin=0, vmax=1)

ax.set_yticks(np.arange(7))
ax.set_yticklabels(DAYS, fontsize=12)
ax.set_xticks(np.arange(0, 24, 2))
ax.set_xticklabels([f"{h:02d}" for h in range(0, 24, 2)], fontsize=10)
ax.set_xlabel("Hour of day")
ax.set_title("팀 가용시간 교집합 — overlap score 입력 (4인 팀 예시)", loc="left")
ax.tick_params(top=False, bottom=False, left=False)

# colorbar
cbar = fig.colorbar(im, ax=ax, fraction=0.022, pad=0.02)
cbar.set_label("overlap density", color=APPLE_INK_MUTED, fontsize=10)
cbar.outline.set_visible(False)
cbar.ax.tick_params(colors=APPLE_INK_MUTED, length=0)

fig.savefig(OUT / "overlap_heatmap.png", dpi=150, bbox_inches="tight",
            facecolor=APPLE_CANVAS)
plt.close(fig)
print("✓ overlap_heatmap.png")
print(f"\nAll charts saved → {OUT}")
