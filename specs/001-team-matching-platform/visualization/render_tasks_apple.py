"""
UniTeam tasks.md — Apple-inspired visualization

Design tokens from /Users/pioneer18/mis2601/DESIGN.md (getdesign@latest apple):
  - Action Blue       #0066cc    single accent for the storyline
  - Ink               #1d1d1f    headlines + body
  - Ink Muted 80      #333333    secondary copy
  - Ink Muted 48      #7a7a7a    fine print
  - Canvas            #ffffff    light tile
  - Canvas Parchment  #f5f5f7    alternating tile (the signature Apple off-white)
  - Hairline          #e0e0e0    1px utility-card border
  - Surface Tile 1    #272729    near-black band for the dark "tile" panel

Skill guidance from .agents/skills/data-visualization/SKILL.md:
  - Insight-first titles ("X grew Y%", not "X by Y")
  - Highlight the story: one accent color (Action Blue), grey the rest
  - Bar charts start at zero, sorted by value (not alphabetical)
  - No chart junk (no gridlines, no borders that don't carry info)
  - Accessibility: differentiate by label/position, not color alone

Brand rules respected:
  - Exactly one accent color (Action Blue) — no second brand color
  - No drop shadows on chart chrome (Apple reserves shadow for product imagery)
  - No decorative gradients
  - Edge-to-edge "tile" rhythm: light parchment panel ↔ near-black panel
"""
from __future__ import annotations

import re
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib import font_manager
import pandas as pd

# ---------------------------------------------------------------------------
# Apple design tokens
# ---------------------------------------------------------------------------
ACTION_BLUE      = "#0066cc"
SKY_LINK_BLUE    = "#2997ff"   # primary-on-dark
INK              = "#1d1d1f"
INK_MUTED_80     = "#333333"
INK_MUTED_48     = "#7a7a7a"
CANVAS           = "#ffffff"
CANVAS_PARCHMENT = "#f5f5f7"
HAIRLINE         = "#e0e0e0"
SURFACE_TILE_1   = "#272729"
BODY_ON_DARK     = "#ffffff"
BODY_MUTED_DARK  = "#cccccc"

# Story palette: single Action Blue highlight, everything else muted
GREY_MUTED   = "#d2d2d7"   # surface-chip-translucent — quiet bars
GREY_DEEPER  = "#86868b"   # mid-grey for non-highlight on light tiles

# ---------------------------------------------------------------------------
# Fonts: SF Pro is proprietary. Use Helvetica Neue (closest macOS native) +
# AppleGothic for Korean glyphs. The DESIGN.md substitute guidance.
# ---------------------------------------------------------------------------
_HELVETICA_NEUE = "/System/Library/Fonts/HelveticaNeue.ttc"
_APPLE_GOTHIC = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
for _p in (_HELVETICA_NEUE, _APPLE_GOTHIC):
    if Path(_p).exists():
        font_manager.fontManager.addfont(_p)
_KO_FONT = font_manager.FontProperties(fname=_APPLE_GOTHIC).get_name()

# ---------------------------------------------------------------------------
# Parse tasks.md
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
TASKS_MD = ROOT / "tasks.md"
OUT_DIR = Path(__file__).resolve().parent

phase_re = re.compile(r"^## Phase (\d+)\s+—\s+(.+)$")
row_re = re.compile(
    r"^\|\s+\*\*T(\d{3})\*\*\s+\|\s+\[(\w+)\](?:\[[^\]]+\])?\s+\|(.+?)\|(.+?)\|(.*)\|$"
)

records: list[dict] = []
current_phase: int | None = None
current_title: str | None = None
with TASKS_MD.open(encoding="utf-8") as f:
    for line in f:
        m = phase_re.match(line.strip())
        if m:
            current_phase = int(m.group(1))
            current_title = m.group(2).strip()
            continue
        m = row_re.match(line.rstrip())
        if m and current_phase is not None:
            records.append({
                "task": f"T{m.group(1)}",
                "phase": current_phase,
                "phase_title": current_title,
                "area": m.group(2),
                "parallel": "[P]" in m.group(5),
            })

df = pd.DataFrame(records)
# Strip emoji / non-ASCII decorative glyphs from phase titles to avoid font warnings
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF]"
)
df["phase_title"] = df["phase_title"].str.replace(_EMOJI_RE, "", regex=True).str.strip()

def band(p: int) -> str:
    if p in (1, 2): return "Setup"
    if p in (3, 4, 5, 6): return "P1 MVP"
    if p in (7, 8, 9): return "P2"
    if p in (10, 11, 12): return "P3"
    return "Polish"

df["band"] = df["phase"].apply(band)

# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------
pivot_phase_area = (
    df.pivot_table(index="phase", columns="area", values="task", aggfunc="count")
      .fillna(0)
      .reindex(columns=["BE", "FE", "DB", "INF"], fill_value=0)
      .sort_index()
)
phase_totals = pivot_phase_area.sum(axis=1)
band_totals = df.groupby("band").size().reindex(
    ["Setup", "P1 MVP", "P2", "P3", "Polish"]
)
area_totals = df["area"].value_counts().reindex(["BE", "FE", "DB", "INF"])
mvp_share = band_totals["P1 MVP"] / band_totals.sum() * 100
parallel_share = df["parallel"].mean() * 100

# ---------------------------------------------------------------------------
# Matplotlib style — Apple tight tracking is faked via small font-size
# adjustments + low-saturation rcParams. SF Pro substitutes set globally.
# ---------------------------------------------------------------------------
plt.rcParams.update({
    "font.family": ["Helvetica Neue", _KO_FONT, "sans-serif"],
    "font.size": 11,                       # body 17px → scaled to 11pt for chart
    "axes.titlesize": 17,                  # display-md proportion
    "axes.titleweight": 600,
    "axes.labelsize": 11,
    "axes.labelcolor": INK,
    "axes.edgecolor": HAIRLINE,
    "axes.linewidth": 0.6,
    "axes.titlecolor": INK,
    "xtick.color": INK_MUTED_80,
    "ytick.color": INK_MUTED_80,
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
    "axes.unicode_minus": False,
    "figure.dpi": 160,
    "savefig.dpi": 200,
    "savefig.facecolor": CANVAS,
    "figure.facecolor": CANVAS,
})

# ---------------------------------------------------------------------------
# Figure: 3 stacked "tiles" — alternating light → dark → parchment
# Each tile occupies one viewport-band, edge-to-edge, no gap (Apple rhythm).
# ---------------------------------------------------------------------------
fig = plt.figure(figsize=(13, 18), facecolor=CANVAS)
gs = fig.add_gridspec(
    nrows=3, ncols=1,
    height_ratios=[1.10, 0.82, 1.15],
    hspace=0.34,               # Apple section padding (no edge-to-edge — titles need air)
    top=0.880, bottom=0.045, left=0.28, right=0.95,
)

# === Tile 1 (Light canvas) — Phase × total, sorted bar, single accent =======
ax1 = fig.add_subplot(gs[0])
ax1.set_facecolor(CANVAS)

order = phase_totals.sort_values(ascending=True).index.tolist()
totals = [phase_totals[p] for p in order]

def _short_title(p: int) -> str:
    raw = df[df.phase==p].phase_title.iloc[0]
    # Drop trailing "(P1)" / "MVP" tail markers — band color already encodes priority
    raw = re.sub(r"\s*\(P[1-3]\).*$", "", raw).strip()
    if len(raw) > 22:
        raw = raw[:21] + "…"
    return f"P{p}  ·  {raw}"

labels = [_short_title(p) for p in order]
# Highlight the MVP band (Phases 3–6) in Action Blue; everything else muted.
bar_colors = [ACTION_BLUE if p in (3, 4, 5, 6) else GREY_MUTED for p in order]

# Reserve top ~22% of the tile for an in-tile title (Apple tile rhythm)
ax1.set_ylim(-0.6, len(labels) - 0.4)
ax1.set_xlim(0, max(totals) * 1.22)
ax1.barh(labels, totals, color=bar_colors, edgecolor=CANVAS, linewidth=0, height=0.62)
for i, v in enumerate(totals):
    ax1.text(
        v + 0.4, i, f"{int(v)}",
        va="center", ha="left",
        color=INK if bar_colors[i] == ACTION_BLUE else INK_MUTED_80,
        fontsize=10, fontweight=600 if bar_colors[i] == ACTION_BLUE else 400,
    )

ax1.set_title(
    f"MVP 단계(P3–P6)가 전체 {len(df)}개 태스크 중 {int(band_totals['P1 MVP'])}개 — {mvp_share:.0f}%를 점유",
    loc="left", pad=28, color=INK, fontsize=17, fontweight=600,
)
ax1.text(
    0.0, 1.025,
    "Phase 별 태스크 수 · 정렬: 적은 순 · 강조: Action Blue · 그 외: Translucent Chip Gray",
    transform=ax1.transAxes, ha="left", va="bottom",
    color=INK_MUTED_48, fontsize=10,
)

ax1.set_xlabel("")
ax1.tick_params(axis="x", length=0, labelbottom=False)
ax1.tick_params(axis="y", length=0)
for spine in ax1.spines.values():
    spine.set_visible(False)
ax1.grid(False)

# === Tile 2 (Near-black) — Area composition, dark "product" tile ============
ax2 = fig.add_subplot(gs[1])
ax2.set_facecolor(SURFACE_TILE_1)

areas = area_totals.index.tolist()
vals = area_totals.values
# On dark surface, Sky Link Blue (#2997ff) is the legible accent.
# Highlight BE (largest), grey the rest with Body Muted Dark.
area_colors = [SKY_LINK_BLUE if a == "BE" else BODY_MUTED_DARK for a in areas]

be_share = area_totals["BE"] / area_totals.sum() * 100

ax2.set_ylim(0, max(vals) * 1.70)  # headroom for in-tile title above bars
bars = ax2.bar(areas, vals, color=area_colors, edgecolor=SURFACE_TILE_1, linewidth=0, width=0.5)
for bar, v in zip(bars, vals):
    ax2.text(
        bar.get_x() + bar.get_width() / 2, v + 1.6, f"{int(v)}",
        ha="center", va="bottom",
        color=BODY_ON_DARK, fontsize=13, fontweight=600,
    )

# Title rendered inside the dark tile (white ink) using ax.text at top padding.
ax2.text(
    0.02, 0.96,
    f"백엔드가 {int(area_totals['BE'])}개 — 전체의 {be_share:.0f}%로 지배적",
    transform=ax2.transAxes, ha="left", va="top",
    color=BODY_ON_DARK, fontsize=17, fontweight=600,
)
ax2.text(
    0.02, 0.89,
    "영역별 태스크 수 · 강조: Sky Link Blue (dark-surface 전용 · #2997ff)",
    transform=ax2.transAxes, ha="left", va="top",
    color=BODY_MUTED_DARK, fontsize=10,
)

ax2.set_xlabel("")
ax2.tick_params(axis="x", length=0, colors=BODY_ON_DARK, labelsize=12)
ax2.tick_params(axis="y", length=0, labelleft=False)
for spine in ax2.spines.values():
    spine.set_visible(False)
ax2.grid(False)

# Sub-label rows under x-ticks (Apple "lead-airy" small copy)
sublabels = {"BE": "Express · mysql2 · adapters",
             "FE": "Vue 3 · Pinia · Vite",
             "DB": "knex · 마이그레이션",
             "INF": "Docker · Nginx · CI"}
for i, a in enumerate(areas):
    ax2.text(
        i, -max(vals) * 0.04, sublabels[a],
        ha="center", va="top", color=BODY_MUTED_DARK, fontsize=10,
    )

# === Tile 3 (Parchment) — Phase × Area stacked, breakdown detail ============
ax3 = fig.add_subplot(gs[2])
ax3.set_facecolor(CANVAS_PARCHMENT)

phase_order = pivot_phase_area.index.tolist()
x_positions = list(range(len(phase_order)))
# Storyline coloring: Action Blue for BE, mid-grey for everything else.
# We keep a single accent — area distinction by label, not by hue.
stack_colors = {
    "BE": ACTION_BLUE,
    "FE": GREY_DEEPER,
    "DB": "#b5b5ba",
    "INF": "#d2d2d7",
}

bottom = [0.0] * len(phase_order)
for area in ["BE", "FE", "DB", "INF"]:
    vals = pivot_phase_area[area].values
    ax3.bar(
        x_positions, vals,
        bottom=bottom,
        color=stack_colors[area],
        edgecolor=CANVAS_PARCHMENT, linewidth=0.8,
        width=0.62,
        label=area,
    )
    for i, v in enumerate(vals):
        if v > 1:
            ax3.text(
                x_positions[i], bottom[i] + v / 2, int(v),
                ha="center", va="center",
                color=CANVAS if area == "BE" else INK,
                fontsize=8.5, fontweight=600 if area == "BE" else 400,
            )
    bottom = [b + v for b, v in zip(bottom, vals)]

# Phase totals on top
for i, total in enumerate(phase_totals.values):
    ax3.text(
        x_positions[i], total + 0.7, int(total),
        ha="center", va="bottom",
        color=INK, fontsize=10, fontweight=600,
    )

ax3.set_xticks(x_positions)
ax3.set_xticklabels([f"P{p}" for p in phase_order], color=INK_MUTED_80, fontsize=11)
ax3.set_xlabel("Phase", color=INK_MUTED_80, labelpad=8)
ax3.set_ylim(0, phase_totals.max() * 1.40)  # headroom for in-tile title

ax3.set_title(
    f"각 Phase 의 영역 구성 — 병렬 가능 태스크 {df['parallel'].sum()}개({parallel_share:.0f}%)로 동시 진행 여지가 큼",
    loc="left", pad=28, color=INK, fontsize=17, fontweight=600,
)
ax3.text(
    0.0, 1.025,
    "Phase × 영역 누적 막대 · 강조: Action Blue (BE) · 그 외: 중성 회색 계열",
    transform=ax3.transAxes, ha="left", va="bottom",
    color=INK_MUTED_48, fontsize=10,
)

ax3.tick_params(axis="x", length=0)
ax3.tick_params(axis="y", length=0, labelleft=False)
for spine in ax3.spines.values():
    spine.set_visible(False)
ax3.grid(False)

# Pill-style legend (Apple pill grammar)
handles = [
    mpatches.Patch(facecolor=stack_colors[a], edgecolor="none", label=a)
    for a in ["BE", "FE", "DB", "INF"]
]
legend = ax3.legend(
    handles=handles, loc="upper right",
    frameon=True, fancybox=True, framealpha=1.0,
    edgecolor=HAIRLINE, labelcolor=INK,
    fontsize=10, title="영역", title_fontsize=10,
    handlelength=1.2, handleheight=1.0, borderpad=0.8,
)
legend.get_frame().set_linewidth(0.8)
legend.get_title().set_color(INK)

# Highlight Slice A (Phase 1)
slice_a_x = phase_order.index(1)
ax3.annotate(
    "이번 세션 구현 범위 (Slice A · Setup)",
    xy=(slice_a_x, phase_totals[1] + 0.4),
    xytext=(slice_a_x + 0.9, phase_totals[1] + 5.5),
    fontsize=10, color=ACTION_BLUE, fontweight=600,
    arrowprops=dict(arrowstyle="-", color=ACTION_BLUE, lw=1.0),
)

# ---------------------------------------------------------------------------
# Frame chrome: hero head + footer source (Apple global-nav + footer rhythm)
# ---------------------------------------------------------------------------
fig.text(
    0.06, 0.965,
    "UniTeam · Tasks 분포",
    fontsize=30, fontweight=600, color=INK,
    ha="left", va="top",
)
fig.text(
    0.06, 0.925,
    "T001 – T133  ·  13 Phases  ·  Apple-inspired data tiles",
    fontsize=12, color=INK_MUTED_48,
    ha="left", va="top",
)
fig.text(
    0.06, 0.015,
    "Source · specs/001-team-matching-platform/tasks.md     ·     2026-05-22     ·     getdesign apple  ×  skill data-visualization",
    fontsize=9, color=INK_MUTED_48,
    ha="left", va="bottom",
)

out_png = OUT_DIR / "tasks_apple.png"
plt.savefig(out_png, dpi=200, facecolor=CANVAS)
print(f"saved: {out_png}")

# Console summary
print("\n=== Apple-styled chart: insight ledger ===")
print(f"Total tasks:        {len(df)}")
print(f"MVP (P3–P6):        {int(band_totals['P1 MVP'])} ({mvp_share:.1f}%)")
print(f"Backend share:      {int(area_totals['BE'])}/{len(df)} ({be_share:.1f}%)")
print(f"Parallel-marked:    {df['parallel'].sum()}/{len(df)} ({parallel_share:.1f}%)")
print(f"Slice A (Phase 1):  {int(phase_totals[1])} tasks")
