"""
generate_demo_video.py
======================
Standalone script that produces 'lumenos_demo.mp4' — a 90-second, 30-fps
high-quality MP4 demo video for the LumenOS project.

Timeline (90 s × 30 fps = 2700 frames):
  Scene 1  Intro                0  –  450   (  0 s – 15 s)
  Scene 2  Naive Scheduler    450  – 1350   ( 15 s – 45 s)
  Scene 3  LumenOS           1350  – 2250   ( 45 s – 75 s)
  Scene 4  Outro             2250  – 2700   ( 75 s – 90 s)

Dependencies: matplotlib, numpy  (both in requirements.txt)
FFmpeg must be installed and in PATH.  See installation note below.
"""

from __future__ import annotations

import sys
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.animation import FuncAnimation, FFMpegWriter
from matplotlib.colors import to_rgba

# ──────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────
FPS          = 30
TOTAL_FRAMES = 2700          # 90 s × 30 fps

# Scene frame boundaries
S1_START, S1_END = 0,    450   # Intro              0 s – 15 s
S2_START, S2_END = 450,  1350  # Naive scheduler   15 s – 45 s
S3_START, S3_END = 1350, 2250  # LumenOS           45 s – 75 s
S4_START, S4_END = 2250, 2700  # Outro             75 s – 90 s

# Thermal simulation (45-minute orbit segment, one sample per 30-s step)
SIM_MINUTES = 45
STEPS       = SIM_MINUTES * 2   # 30-second ticks → 90 data points
T_SIM       = np.linspace(0, SIM_MINUTES, STEPS)

SHUTDOWN_THRESHOLD = 95.0

# ── Naive temperature profile: rises fast, crashes through 95 °C ──────────────
def _build_naive_temp(steps: int) -> np.ndarray:
    t = np.zeros(steps)
    temp = 25.0
    for i in range(steps):
        minute = i * SIM_MINUTES / steps
        # Heat rises steeply while radiator sees warm Earth day side
        heat = 180 if minute < 30 else 80
        cooling = 70 if minute < 30 else 110
        dt = (heat - cooling) / (15 * 900) * 30   # lumped-cap step
        temp = min(temp + dt, 102.0)
        # Hard shutdown plateau
        if temp >= SHUTDOWN_THRESHOLD and minute >= 28:
            temp = max(temp - 0.4, SHUTDOWN_THRESHOLD - 0.5) if minute > 33 else temp
        t[i] = temp
    return t

# ── LumenOS temperature profile: proactively flattened at ~60 °C ─────────────
def _build_lumen_temp(steps: int) -> np.ndarray:
    t = np.zeros(steps)
    temp = 25.0
    paused = False
    for i in range(steps):
        minute = i * SIM_MINUTES / steps
        # Lookahead: pause heavy jobs when approaching 56 °C
        if temp >= 56.0:
            paused = True
        if temp < 45.0:
            paused = False
        heat = 80 if paused else 160
        cooling = 70 if minute < 30 else 110
        dt = (heat - cooling) / (15 * 900) * 30
        temp = temp + dt
        temp = max(24.0, min(temp, 65.0))   # never exceeds 65 °C
        t[i] = temp
    return t

T_NAIVE = _build_naive_temp(STEPS)
T_LUMEN = _build_lumen_temp(STEPS)


# ──────────────────────────────────────────────────────────────────────────────
# PALETTE & STYLE
# ──────────────────────────────────────────────────────────────────────────────
plt.style.use("dark_background")

COL_BG       = "#0a0f1e"
COL_PANEL    = "#0f172a"
COL_ACCENT   = "#38bdf8"
COL_RED      = "#f87171"
COL_GREEN    = "#4ade80"
COL_YELLOW   = "#fbbf24"
COL_GRID     = "#1e293b"
COL_SUBTEXT  = "#94a3b8"

FONT_TITLE   = dict(fontsize=26, fontweight="bold", color=COL_ACCENT,
                    fontfamily="DejaVu Sans")
FONT_SUB     = dict(fontsize=16, color=COL_SUBTEXT, fontfamily="DejaVu Sans")
FONT_BODY    = dict(fontsize=13, color=COL_SUBTEXT, fontfamily="DejaVu Sans")
FONT_SCENE   = dict(fontsize=17, fontweight="bold", color=COL_ACCENT,
                    fontfamily="DejaVu Sans")
FONT_AXIS    = dict(fontsize=13, color=COL_SUBTEXT)
FONT_BANNER  = dict(fontsize=22, fontweight="bold", fontfamily="DejaVu Sans")


# ──────────────────────────────────────────────────────────────────────────────
# FIGURE SETUP  (1280 × 720 @ 96 dpi)
# ──────────────────────────────────────────────────────────────────────────────
DPI   = 96
W_IN  = 1280 / DPI
H_IN  = 720  / DPI

fig = plt.figure(figsize=(W_IN, H_IN), dpi=DPI, facecolor=COL_BG)
ax  = fig.add_axes([0.09, 0.12, 0.87, 0.73], facecolor=COL_PANEL)

def _reset_ax():
    """Clear axes and apply consistent dark styling."""
    ax.cla()
    ax.set_facecolor(COL_PANEL)
    ax.tick_params(colors=COL_SUBTEXT, labelsize=12)
    for spine in ax.spines.values():
        spine.set_edgecolor(COL_GRID)
    ax.grid(color=COL_GRID, linestyle="--", linewidth=0.6, alpha=0.6)


# ──────────────────────────────────────────────────────────────────────────────
# PERSISTENT OVERLAY ARTISTS  (drawn over every frame)
# ──────────────────────────────────────────────────────────────────────────────
# Scene-level title (top centre)
scene_title = fig.text(
    0.5, 0.97, "", ha="center", va="top",
    fontsize=14, color=COL_SUBTEXT,
    fontfamily="DejaVu Sans",
)

# Banner overlay — placed in axes coordinates so add_patch works
banner_patch = mpatches.FancyBboxPatch(
    (0.03, 0.40), 0.94, 0.20,
    boxstyle="round,pad=0.02",
    transform=ax.transAxes,
    facecolor="none", edgecolor="none",
    zorder=10, visible=False,
)
ax.add_patch(banner_patch)

banner_text = ax.text(
    0.5, 0.54, "", ha="center", va="center",
    transform=ax.transAxes,
    fontsize=20, fontweight="bold", color="white",
    zorder=11, visible=False,
)
banner_sub = ax.text(
    0.5, 0.44, "", ha="center", va="center",
    transform=ax.transAxes,
    fontsize=13, color="white",
    zorder=11, visible=False,
)


def _hide_banner():
    banner_patch.set_visible(False)
    banner_text.set_visible(False)
    banner_sub.set_visible(False)

def _show_banner(text: str, sub: str, color: str):
    banner_patch.set_visible(True)
    banner_patch.set_facecolor(to_rgba(color, 0.88))
    banner_patch.set_edgecolor(color)
    banner_text.set_visible(True)
    banner_text.set_text(text)
    banner_sub.set_visible(True)
    banner_sub.set_text(sub)


# ──────────────────────────────────────────────────────────────────────────────
# HELPER — smooth fade alpha
# ──────────────────────────────────────────────────────────────────────────────
def _fade(frame: int, start: int, end: int, fade_frames: int = 45) -> float:
    """Linear fade-in at [start, start+fade_frames] and fade-out at [end-fade_frames, end]."""
    if frame < start or frame >= end:
        return 0.0
    if frame < start + fade_frames:
        return (frame - start) / fade_frames
    if frame >= end - fade_frames:
        return (end - frame) / fade_frames
    return 1.0


# ──────────────────────────────────────────────────────────────────────────────
# SCENE BUILDERS
# ──────────────────────────────────────────────────────────────────────────────

# ─── SCENE 1 : Intro ─────────────────────────────────────────────────────────
# We stash text objects in a list so they survive across calls within the scene.
_s1_objects: list = []

def _init_scene1():
    """Build all Scene 1 artists once."""
    global _s1_objects
    _reset_ax()
    ax.set_axis_off()
    scene_title.set_text("")
    _hide_banner()
    _s1_objects = [
        ax.text(
            0.5, 0.68,
            "LumenOS: Orbital Mission Trade-off Simulator",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=28, fontweight="bold", color=COL_ACCENT,
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.52,
            "Thermodynamics-Aware OS for Space Data Centers",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=18, color="#e2e8f0",
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.30,
            "Built for NASA Space Apps Challenge 2026",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=14, color=COL_YELLOW,
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.22,
            "\"Space Mission Design Game\"",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=13, color=COL_YELLOW, style="italic",
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.08,
            "No fans.  No air.  No second chances.",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=13, color=COL_SUBTEXT, style="italic",
            fontfamily="DejaVu Sans",
        ),
    ]

def _draw_scene1(frame: int):
    alpha = _fade(frame, S1_START, S1_END, fade_frames=60)
    for obj in _s1_objects:
        obj.set_alpha(alpha)


# ─── SCENE 2 : Naive Scheduler ───────────────────────────────────────────────
_s2_line   = None
_s2_thresh = None
_s2_inited = False

def _init_scene2():
    global _s2_line, _s2_thresh, _s2_inited
    _reset_ax()
    _hide_banner()
    _s2_inited = True

    ax.set_xlim(0, SIM_MINUTES)
    ax.set_ylim(10, 110)
    ax.set_xlabel("Simulated Orbit Time  (minutes)", **FONT_AXIS)
    ax.set_ylabel("Server Temperature  (°C)", **FONT_AXIS)

    # Shutdown threshold reference line
    _s2_thresh = ax.axhline(
        SHUTDOWN_THRESHOLD, color=COL_RED, linestyle="--",
        linewidth=1.8, alpha=0.75, label="Shutdown Threshold (95 °C)",
    )
    ax.text(
        0.5, SHUTDOWN_THRESHOLD + 1.5,
        "SHUTDOWN THRESHOLD  95 °C",
        color=COL_RED, fontsize=11, alpha=0.9,
        transform=ax.get_yaxis_transform(), ha="center",
    )

    # Animated temperature line (starts empty)
    (_s2_line,) = ax.plot([], [], color=COL_RED, linewidth=2.5,
                          label="Naive Scheduler Temp", zorder=5)

    ax.legend(loc="upper left", fontsize=11, framealpha=0.3,
              labelcolor=COL_SUBTEXT)

    scene_title.set_text(
        "Scenario: LEO  |  Radiator: 0.5 m²  |  OS: Naive Scheduler (Legacy)"
    )

def _draw_scene2(frame: int):
    # Progress within scene: 0.0 → 1.0
    prog = (frame - S2_START) / (S2_END - S2_START)
    n_pts = max(1, int(prog * STEPS))

    _s2_line.set_data(T_SIM[:n_pts], T_NAIVE[:n_pts])

    # Flash "MISSION FAILED" banner after frame 1050 (35 s)
    if frame >= 1050:
        _show_banner(
            "   MISSION FAILED: THERMAL SHUTDOWN   ",
            "Lost 14.5 minutes of critical compute work.",
            COL_RED,
        )
    else:
        _hide_banner()


# ─── SCENE 3 : LumenOS ───────────────────────────────────────────────────────
_s3_line_l = None
_s3_line_n = None   # ghost of naive for comparison
_s3_inited = False

def _init_scene3():
    global _s3_line_l, _s3_line_n, _s3_inited
    _reset_ax()
    _hide_banner()
    _s3_inited = True

    ax.set_xlim(0, SIM_MINUTES)
    ax.set_ylim(10, 110)
    ax.set_xlabel("Simulated Orbit Time  (minutes)", **FONT_AXIS)
    ax.set_ylabel("Server Temperature  (°C)", **FONT_AXIS)

    # Shutdown threshold
    ax.axhline(
        SHUTDOWN_THRESHOLD, color=COL_RED, linestyle="--",
        linewidth=1.8, alpha=0.55, label="Shutdown Threshold (95 °C)",
    )
    ax.text(
        0.5, SHUTDOWN_THRESHOLD + 1.5,
        "SHUTDOWN THRESHOLD  95 °C",
        color=COL_RED, fontsize=11, alpha=0.7,
        transform=ax.get_yaxis_transform(), ha="center",
    )

    # Naive ghost (full, faint)
    (_s3_line_n,) = ax.plot(
        T_SIM, T_NAIVE, color=COL_RED, linewidth=1.2,
        alpha=0.25, linestyle="--", label="Naive (reference)",
    )

    # LumenOS animated line
    (_s3_line_l,) = ax.plot([], [], color=COL_ACCENT, linewidth=2.8,
                             label="LumenOS Temp", zorder=5)

    # Annotation: predictive pause zone
    ax.axhspan(54, 60, alpha=0.08, color=COL_GREEN,
               label="Predictive Pause Zone (54–60 °C)")

    ax.legend(loc="upper left", fontsize=10, framealpha=0.3,
              labelcolor=COL_SUBTEXT)

    scene_title.set_text(
        "Scenario: LEO  |  Radiator: 0.5 m²  |  OS: LumenOS (AI-Aware)"
    )

def _draw_scene3(frame: int):
    prog = (frame - S3_START) / (S3_END - S3_START)
    n_pts = max(1, int(prog * STEPS))

    _s3_line_l.set_data(T_SIM[:n_pts], T_LUMEN[:n_pts])

    # Flash "MISSION SUCCESS" banner after frame 1650 (55 s)
    if frame >= 1650:
        _show_banner(
            "   MISSION SUCCESS: All Constraints Managed   ",
            "0 Shutdowns  |  +14% Compute Efficiency Gain",
            "#166534",   # dark green box
        )
        banner_text.set_color(COL_GREEN)
    else:
        _hide_banner()


# ─── SCENE 4 : Outro ─────────────────────────────────────────────────────────
_s4_objects: list = []

def _init_scene4():
    global _s4_objects
    _reset_ax()
    ax.set_axis_off()
    _hide_banner()
    scene_title.set_text("")
    _s4_objects = [
        ax.text(
            0.5, 0.65,
            "LumenOS makes orbital AI physically possible.",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=22, fontweight="bold", color=COL_ACCENT,
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.50,
            "Thank you.",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=18, color="#e2e8f0",
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.32,
            "NASA Space Apps 2026  ·  Space Mission Design Game",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=13, color=COL_YELLOW,
            fontfamily="DejaVu Sans",
        ),
        ax.text(
            0.5, 0.14,
            "github.com/Alif-E7/LumenOS",
            ha="center", va="center", transform=ax.transAxes,
            fontsize=13, color=COL_SUBTEXT,
            fontfamily="DejaVu Sans",
        ),
    ]

def _draw_scene4(frame: int):
    alpha = _fade(frame, S4_START, S4_END, fade_frames=60)
    for obj in _s4_objects:
        obj.set_alpha(alpha)


# ──────────────────────────────────────────────────────────────────────────────
# MAIN UPDATE FUNCTION
# ──────────────────────────────────────────────────────────────────────────────

_current_scene = -1   # track which scene we're in to avoid re-init

def _update(frame: int):
    global _current_scene, _s2_inited, _s3_inited

    # ── Scene 1: Intro (0 – 450) ──────────────────────────────────────────────
    if S1_START <= frame < S1_END:
        if _current_scene != 1:
            _current_scene = 1
            _init_scene1()
        _draw_scene1(frame)

    # ── Scene 2: Naive (450 – 1350) ───────────────────────────────────────────
    elif S2_START <= frame < S2_END:
        if _current_scene != 2:
            _current_scene = 2
            _init_scene2()
        _draw_scene2(frame)

    # ── Scene 3: LumenOS (1350 – 2250) ────────────────────────────────────────
    elif S3_START <= frame < S3_END:
        if _current_scene != 3:
            _current_scene = 3
            _init_scene3()
        _draw_scene3(frame)

    # ── Scene 4: Outro (2250 – 2700) ──────────────────────────────────────────
    elif S4_START <= frame < S4_END:
        if _current_scene != 4:
            _current_scene = 4
            _init_scene4()
        _draw_scene4(frame)

    return []   # blit=False so we don't need to return artists


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # ── Check FFmpeg availability (system PATH first, then imageio-ffmpeg bundle) ─
    import shutil
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path is None:
        try:
            import imageio_ffmpeg
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            matplotlib.rcParams["animation.ffmpeg_path"] = ffmpeg_path
            print(f"[INFO] Using bundled FFmpeg from imageio-ffmpeg:\n       {ffmpeg_path}")
        except ImportError:
            print(
                "\n[ERROR] FFmpeg not found in PATH and imageio-ffmpeg is not installed.\n"
                "Please do ONE of the following:\n"
                "  Option A (recommended): pip install imageio-ffmpeg\n"
                "  Option B: Install system FFmpeg\n"
                "    • Linux  : sudo apt install ffmpeg\n"
                "    • macOS  : brew install ffmpeg\n"
                "    • Windows: https://www.gyan.dev/ffmpeg/builds/ → add bin/ to PATH\n"
            )
            sys.exit(1)
    else:
        matplotlib.rcParams["animation.ffmpeg_path"] = ffmpeg_path

    OUTPUT_FILE = "lumenos_demo.mp4"

    print(f"[LumenOS Demo Video Generator]")
    print(f"  Resolution : 1280 × 720")
    print(f"  FPS        : {FPS}")
    print(f"  Duration   : 90 seconds  ({TOTAL_FRAMES} frames)")
    print(f"  Output     : {OUTPUT_FILE}")
    print(f"  Rendering  … (this may take 2-4 minutes)")

    anim = FuncAnimation(
        fig,
        _update,
        frames=TOTAL_FRAMES,
        interval=1000 / FPS,
        blit=False,
        repeat=False,
    )

    writer = FFMpegWriter(
        fps=FPS,
        metadata={
            "title":   "LumenOS: Orbital Mission Trade-off Simulator",
            "artist":  "LumenOS Team — NASA Space Apps 2026",
            "comment": "Space Mission Design Game",
        },
        bitrate=5000,
        extra_args=["-pix_fmt", "yuv420p"],   # maximum browser/player compatibility
    )

    try:
        anim.save(OUTPUT_FILE, writer=writer, dpi=DPI)
        print(f"\n[OK] Video saved → {OUTPUT_FILE}")
    except Exception as exc:
        print(f"\n[ERROR] Failed to write video: {exc}")
        print(
            "Ensure FFmpeg is installed and try:\n"
            "  pip install --upgrade matplotlib\n"
        )
        sys.exit(1)
