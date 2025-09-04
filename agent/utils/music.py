# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any

_state = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100 (reflète le volume "système" quand pactl est dispo)
    "track": None,
}

# --- helpers génériques ---
_PCT = re.compile(r"(\d+)%")

def _run(cmd: list[str]) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

def _which(binname: str) -> Optional[str]:
    return shutil.which(binname)

# ===================== PulseAudio / PipeWire (pactl) =====================

def _pactl_available() -> bool:
    return _which("pactl") is not None and bool(os.environ.get("XDG_RUNTIME_DIR"))

def _pactl_default_sink() -> Optional[str]:
    rc, out, _ = _run(["pactl", "get-default-sink"])
    if rc != 0 or not out:
        # fallback: list sinks short et prendre la 1re ligne
        rc2, out2, _ = _run(["pactl", "list", "sinks", "short"])
        if rc2 == 0 and out2:
            line = out2.splitlines()[0]
            parts = line.split()
            return parts[1] if len(parts) >= 2 else None
        return None
    return out.strip()

def _pactl_set_volume(pct: int) -> bool:
    sink = _pactl_default_sink()
    if not sink:
        return False
    pct = max(0, min(100, int(pct)))
    rc, _, _ = _run(["pactl", "set-sink-volume", sink, f"{pct}%"])
    return rc == 0

def _pactl_get_volume() -> Optional[int]:
    sink = _pactl_default_sink()
    if not sink:
        return None
    rc, out, _ = _run(["pactl", "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    # Exemple: "Volume: front-left: 26869 /  41% / -23.23 dB, ..."
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# ============================ ALSA (amixer) ==============================

# Overrides possibles par env
_ALSA_CARD_ENV = os.environ.get("AURA_ALSA_CARD")        # ex: "1"
_ALSA_CTL_ENV  = os.environ.get("AURA_ALSA_CONTROL")     # ex: "PCM" | "Master"

_detected_card: Optional[int] = None
_detected_ctl: Optional[str] = None

def _amixer_card_candidates() -> list[int]:
    if _ALSA_CARD_ENV and _ALSA_CARD_ENV.isdigit():
        return [int(_ALSA_CARD_ENV)]
    # ta carte USB est card 1 (UACDemoV1.0)
    return [1, 0, 2, 3, 4]

def _amixer_try_controls(card: int) -> Optional[str]:
    rc, out, _ = _run(["amixer", "-c", str(card), "scontrols"])
    if rc != 0 or not out:
        return None
    names = []
    for line in out.splitlines():
        m = re.search(r"Simple mixer control '([^']+)'", line)
        if m:
            names.append(m.group(1))
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
    _detected_card, _detected_ctl = 0, "Master"

def _alsa_set_volume(pct: int) -> bool:
    if not _which("amixer"):
        return False
    _ensure_card_ctl()
    pct = max(0, min(100, int(pct)))
    rc, _, _ = _run(["amixer", "-c", str(_detected_card), "sset", _detected_ctl, f"{pct}%", "-M"])
    return rc == 0

def _alsa_get_volume() -> Optional[int]:
    if not _which("amixer"):
        return None
    _ensure_card_ctl()
    rc, out, _ = _run(["amixer", "-c", str(_detected_card), "sget", _detected_ctl])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# ============================ Player controls ============================

def _playerctl(cmd: list[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        return False
    rc, _, _ = _run([pc] + cmd)
    return rc == 0

# ============================== API publique =============================

def get_state() -> Dict[str, Any]:
    # Priorité lecture via Pulse
    v = _pactl_get_volume() if _pactl_available() else None
    if v is None:
        v = _alsa_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    ok = False
    if _pactl_available():
        ok = _pactl_set_volume(value)
    if not ok:
        ok = _alsa_set_volume(value)
    # Relis systématiquement l’état réel après réglage
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
