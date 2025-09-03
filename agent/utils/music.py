# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any

# État local minimal
_state = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100
    "track": None,
}

# ---- ENV overrides ----
_AURA_PULSE_SINK = os.environ.get("AURA_PULSE_SINK")     # ex: "alsa_output.usb-...stereo"
_ALSA_CARD_ENV   = os.environ.get("AURA_ALSA_CARD")      # ex: "1"
_ALSA_CTL_ENV    = os.environ.get("AURA_ALSA_CONTROL")   # ex: "PCM" | "Master" | "Speaker"

# ---- Tools detection ----
def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

_HAS_PACTL = bool(_which("pactl")) and bool(os.environ.get("XDG_RUNTIME_DIR"))
_HAS_PLAYERCTL = bool(_which("playerctl"))

# ---- Helpers ----
def _run(cmd: list[str]) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

# =========================
# Backend PULSE (pactl)
# =========================
_PULSE_PCT = re.compile(r"(\d+)%")

def _pulse_default_sink() -> Optional[str]:
    if _AURA_PULSE_SINK:
        return _AURA_PULSE_SINK
    # Utilise @DEFAULT_SINK@ si possible
    return "@DEFAULT_SINK@"

def _pulse_set_volume(pct: int) -> bool:
    if not _HAS_PACTL:
        return False
    sink = _pulse_default_sink()
    if not sink:
        return False
    pct = max(0, min(100, int(pct)))
    rc, out, err = _run(["pactl", "set-sink-volume", sink, f"{pct}%"])
    return rc == 0

def _pulse_get_volume() -> Optional[int]:
    if not _HAS_PACTL:
        return None
    sink = _pulse_default_sink()
    if not sink:
        return None
    rc, out, err = _run(["pactl", "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    # Exemple: "Volume: front-left: 26214 /  40% / -24,00 dB,   front-right: 26214 /  40% / -24,00 dB"
    m = _PULSE_PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# =========================
# Backend ALSA (amixer)
# =========================
_detected_card: Optional[int] = None
_detected_ctl: Optional[str] = None
_ALSA_PCT = re.compile(r"(\d+)%")

def _amixer_card_candidates() -> list[int]:
    # Priorité : env → 1 → 0 → 2..6
    if _ALSA_CARD_ENV and _ALSA_CARD_ENV.isdigit():
        return [int(_ALSA_CARD_ENV)]
    return [1, 0, 2, 3, 4, 5, 6]

def _amixer_try_controls(card: int) -> Optional[str]:
    rc, out, err = _run(["amixer", "-c", str(card), "scontrols"])
    if rc != 0 or not out:
        return None
    names = []
    for line in out.splitlines():
        m = re.search(r"Simple mixer control '([^']+)'", line)
        if m:
            names.append(m.group(1))
    # Ordre de préférence
    for pref in ("PCM", "Master", "Speaker", "Headphone", "Digital"):
        if pref in names:
            return pref
    return names[0] if names else None

def _ensure_card_ctl():
    global _detected_card, _detected_ctl
    if _detected_card is not None and _detected_ctl is not None:
        return
    if _ALSA_CARD_ENV and _ALSA_CTL_ENV:
        _detected_card = int(_ALSA_CARD_ENV)
        _detected_ctl = _ALSA_CTL_ENV
        return
    for c in _amixer_card_candidates():
        ctl = _ALSA_CTL_ENV or _amixer_try_controls(c)
        if ctl:
            _detected_card, _detected_ctl = c, ctl
            return
    # Fallback
    _detected_card, _detected_ctl = 0, "Master"

def _alsa_set_volume(pct: int) -> None:
    _ensure_card_ctl()
    pct = max(0, min(100, int(pct)))
    _run(["amixer", "-c", str(_detected_card), "sset", _detected_ctl, f"{pct}%", "-M"])

def _alsa_get_volume() -> Optional[int]:
    _ensure_card_ctl()
    rc, out, err = _run(["amixer", "-c", str(_detected_card), "sget", _detected_ctl])
    if rc != 0 or not out:
        return None
    m = _ALSA_PCT.search(out)
    if not m:
        return None
    v = int(m.group(1))
    return max(0, min(100, v))

# =========================
# Player controls (playerctl)
# =========================
def _playerctl(cmd: list[str]) -> bool:
    if not _HAS_PLAYERCTL:
        return False
    rc, out, err = _run(["playerctl"] + cmd)
    return rc == 0

# =========================
# API publique
# =========================
def get_state() -> Dict[str, Any]:
    # Lecture volume préférentielle via PULSE, sinon ALSA
    v = _pulse_get_volume() if _HAS_PACTL else None
    if v is None:
        v = _alsa_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    ok = False
    if _HAS_PACTL:
        ok = _pulse_set_volume(value)
    if not ok:
        _alsa_set_volume(value)
    _state["volume"] = value
    return get_state()

def play() -> Dict[str, Any]:
    ok = _playerctl(["play"])
    if ok:
        _state["status"] = "play"
    return get_state()

def pause() -> Dict[str, Any]:
    ok = _playerctl(["pause"])
    if ok:
        _state["status"] = "pause"
    return get_state()

def next_track() -> Dict[str, Any]:
    _playerctl(["next"])
    return get_state()

def prev_track() -> Dict[str, Any]:
    _playerctl(["previous"])
    return get_state()

def apply(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepte:
      - {"action":"play"|"pause"|"next"|"prev"}
      - {"volume": 0..100}
    """
    if "volume" in payload:
        return set_volume(int(payload["volume"]))

    action = payload.get("action")
    if action == "play":  return play()
    if action == "pause": return pause()
    if action == "next":  return next_track()
    if action == "prev":  return prev_track()
    return get_state()
