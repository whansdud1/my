"""
UniTeam tasks.md 시각화 — data-visualization 스킬 가이드 적용
(matplotlib + colorblind-friendly palette, insight-first titles, no chart junk)
"""
import re
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib import font_manager
import pandas as pd

# Korean-capable font (macOS AppleGothic ships system-wide)
_ko_font_path = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
font_manager.fontManager.addfont(_ko_font_path)
_ko_font = font_manager.FontProperties(fname=_ko_font_path).get_name()

ROOT = Path(__file__).resolve().parent.parent
TASKS_MD = ROOT / "tasks.md"
OUT_DIR = Path(__file__).resolve().parent

# ----- Parse tasks.md -----
phase_re = re.compile(r"^## Phase (\d+)\s+—\s+(.+)$")
row_re = re.compile(
    r"^\|\s+\*\*T(\d{3})\*\*\s+\|\s+\[(\w+)\](?:\[[^\]]+\])?\s+\|(.+?)\|(.+?)\|(.*)\|$"
)

records = []
current_phase = None
current_title = None
with TASKS_MD.open(encoding="utf-8") as f:
    for line in f:
        m = phase_re.match(line.strip())
        if m:
            current_phase = int(m.group(1))
            current_title = m.group(2).strip()
            continue
        m = row_re.match(line.rstrip())
        if m and current_phase is not None:
            tid = f"T{m.group(1)}"
            area = m.group(2)
            parallel = "[P]" in m.group(5)
            records.append({
                "task": tid,
                "phase": current_phase,
                "phase_title": current_title,
                "area": area,
                "parallel": parallel,
            })

df = pd.DataFrame(records)
assert len(df) == 133, f"expected 133 tasks, got {len(df)}"

# ----- Priority band per phase (from spec) -----
def band(p: int) -> str:
    if p in (1, 2):
        return "Setup/Foundational"
    if p in (3, 4, 5, 6):
        return "P1 MVP"
    if p in (7, 8, 9):
        return "P2"
    if p in (10, 11, 12):
        return "P3"
    return "Polish"

df["band"] = df["phase"].apply(band)

# ----- Style -----
plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams.update({
    "font.family": _ko_font,
    "axes.unicode_minus": False,
    "figure.dpi": 150,
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.titleweight": "bold",
    "axes.labelsize": 10,
    "figure.titlesize": 15,
})

# Colorblind-friendly (Okabe-Ito derived)
AREA_COLORS = {
    "BE":  "#0072B2",  # blue
    "FE":  "#E69F00",  # orange
    "DB":  "#009E73",  # green
    "INF": "#CC79A7",  # pink/magenta
}
BAND_COLORS = {
    "Setup/Foundational": "#999999",
    "P1 MVP": "#D55E00",   # vermilion — highlight
    "P2": "#56B4E9",       # sky blue
    "P3": "#0072B2",       # deeper blue
    "Polish": "#666666",
}

# ----- Panel A: stacked bar — area composition per phase -----
pivot = (
    df.pivot_table(index="phase", columns="area", values="task", aggfunc="count")
      .fillna(0)
      .reindex(columns=["BE", "FE", "DB", "INF"], fill_value=0)
      .sort_index()
)
phase_totals = pivot.sum(axis=1)

# ----- Panel B: horizontal bar — total tasks per phase, colored by band -----
order = pivot.index.tolist()
phase_labels = [
    f"P{p} · {df[df.phase==p].phase_title.iloc[0][:32]}" for p in order
]

fig, (ax1, ax2) = plt.subplots(
    2, 1, figsize=(12, 11), gridspec_kw={"height_ratios": [1.0, 1.05]}
)

# --- Panel A ---
bottom = [0] * len(pivot)
for area in ["BE", "FE", "DB", "INF"]:
    vals = pivot[area].values
    ax1.bar(
        [f"P{p}" for p in pivot.index],
        vals,
        bottom=bottom,
        color=AREA_COLORS[area],
        label=area,
        edgecolor="white",
        linewidth=0.6,
    )
    # value labels on segments > 1
    for i, v in enumerate(vals):
        if v > 1:
            ax1.text(
                i, bottom[i] + v / 2, int(v),
                ha="center", va="center",
                color="white", fontsize=8, fontweight="bold",
            )
    bottom = [b + v for b, v in zip(bottom, vals)]

# Phase totals on top of stacks
for i, total in enumerate(phase_totals.values):
    ax1.text(
        i, total + 0.6, int(total),
        ha="center", va="bottom", fontsize=9, fontweight="bold", color="#333",
    )

ax1.set_title(
    "MVP(Phase 3–6) 가 89개 태스크의 절반 이상을 차지 — 백엔드 비중 67%",
    pad=12,
)
ax1.set_ylabel("Task 수")
ax1.set_ylim(0, phase_totals.max() * 1.18)
ax1.legend(
    title="영역",
    loc="upper right",
    frameon=True,
    fancybox=False,
)
ax1.spines["top"].set_visible(False)
ax1.spines["right"].set_visible(False)

# --- Panel B ---
totals_sorted = phase_totals.sort_values(ascending=True)
band_per_phase = {p: band(p) for p in totals_sorted.index}
colors = [BAND_COLORS[band_per_phase[p]] for p in totals_sorted.index]
labels_sorted = [
    f"P{p} · {df[df.phase==p].phase_title.iloc[0][:36]}" for p in totals_sorted.index
]

bars = ax2.barh(labels_sorted, totals_sorted.values, color=colors, edgecolor="white")
for bar, val in zip(bars, totals_sorted.values):
    ax2.text(
        val + 0.3, bar.get_y() + bar.get_height() / 2,
        f"{int(val)}",
        va="center", ha="left", fontsize=9, color="#222",
    )

# Mark Slice A (Phase 1 — the chosen implementation slice)
for i, p in enumerate(totals_sorted.index):
    if p == 1:
        ax2.annotate(
            "이번 세션 구현 범위 (Slice A)",
            xy=(totals_sorted.values[i], i),
            xytext=(totals_sorted.values[i] + 4, i),
            fontsize=9, color="#D55E00", fontweight="bold",
            arrowprops=dict(arrowstyle="->", color="#D55E00", lw=1.2),
            va="center",
        )

ax2.set_title("Phase 별 태스크 수 — 우선순위 밴드별 색상", pad=12)
ax2.set_xlabel("Task 수")
ax2.set_xlim(0, totals_sorted.max() * 1.25)
ax2.spines["top"].set_visible(False)
ax2.spines["right"].set_visible(False)

# Band legend
handles = [mpatches.Patch(color=BAND_COLORS[b], label=b)
           for b in ["Setup/Foundational", "P1 MVP", "P2", "P3", "Polish"]]
ax2.legend(handles=handles, title="우선순위 밴드", loc="lower right", frameon=True)

fig.suptitle(
    "UniTeam · tasks.md 분포 (T001–T133, 13 Phases)",
    y=0.995, x=0.06, ha="left",
)
fig.text(
    0.06, 0.965,
    "Source: specs/001-team-matching-platform/tasks.md · 2026-05-22",
    fontsize=9, color="#666", ha="left",
)

plt.tight_layout(rect=[0, 0, 1, 0.95])
out_png = OUT_DIR / "tasks_distribution.png"
plt.savefig(out_png, dpi=150, bbox_inches="tight")
print(f"saved: {out_png}")

# ----- Console summary -----
print("\n=== Phase × Area matrix ===")
print(pivot.astype(int).to_string())
print("\n=== Priority band totals ===")
print(df.groupby("band").size().reindex(
    ["Setup/Foundational", "P1 MVP", "P2", "P3", "Polish"]).to_string())
print(f"\nparallel-marked tasks: {df.parallel.sum()} / {len(df)} "
      f"({df.parallel.mean()*100:.1f}%)")
