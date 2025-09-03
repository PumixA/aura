# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any, Tuple

# État local minimal
_state = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100
    "track": None,
}

# --- Config déduite de ton diag ---
# Pulse sink par défaut chez toi (on laisse override via env si besoin)
_DEFAULT_PULSE_SINK = "alsa_output.usb-Jieli_Technology_UACDemoV1.0_503468059286939F-00.iec958-stereo"
_PULSE_SINK = os.environ.get("AURA_PULSE_SINK", _DEFAULT_PULSE_SINK)

# Fallback ALSA (détecté dans ton diag)
_DEFAULT_ALSA_CARD = 1
_DEFAULT_ALSA_CTL  = "PCM"
_ALSA_CARD = int(os.environ.get("AURA_ALSA_CARD", str(_DEFAULT_ALSA_CARD)))
_ALSA_CTL  = os.environ.get("AURA_ALSA_CONTROL", _DEFAULT_ALSA_CTL)

# Regex pour % dans pactl / amixer
_PCT = re.compile(r"(\d+)%")

def _run(cmd: list[str]) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

def _which(name: str) -> Optional[str]:
    return shutil.which(name)

# ----------------- PULSE (pactl) -----------------

def _pulse_get_default_sink() -> Optional[str]:
    if not _which("pactl"):
        return None
    rc, out, _ = _run(["pactl", "get-default-sink"])
    if rc == 0 and out:
        return out.splitlines()[0].strip()
    return None

def _pulse_sink_exists(name: str) -> bool:
    if not _which("pactl"):
        return False
    rc, out, _ = _run(["pactl", "list", "sinks", "short"])
    if rc != 0 or not out:
        return False
    return any(line.split()[1] == name for line in out.splitlines() if line.strip())

def _pulse_sink_name() -> Optional[str]:
    # 1) Si AURA_PULSE_SINK défini et existe -> utilise-le
    if _PULSE_SINK and _pulse_sink_exists(_PULSE_SINK):
        return _PULSE_SINK
    # 2) Sinon, prend le défaut de Pulse
    return _pulse_get_default_sink()

def _pulse_set_volume(pct: int) -> bool:
    sink = _pulse_sink_name()
    if not sink:
        return False
    pct = max(0, min(100, int(pct)))
    rc, _, _ = _run(["pactl", "set-sink-volume", sink, f"{pct}%"])
    return rc == 0

def _pulse_get_volume() -> Optional[int]:
    sink = _pulse_sink_name()
    if not sink:
        return None
    rc, out, _ = _run(["pactl", "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    # Exemple: "Volume: front-left: 22937 /  35% / -27.36 dB, front-right: ..."
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# ----------------- ALSA (amixer) -----------------

def _alsa_set_volume(pct: int) -> bool:
    if not _which("amixer"):
        return False
    pct = max(0, min(100, int(pct)))
    # -M mapped volume (plus “linéaire”)
    rc, _, _ = _run(["amixer", "-c", str(_ALSA_CARD), "sset", _ALSA_CTL, f"{pct}%", "-M"])
    return rc == 0

def _alsa_get_volume() -> Optional[int]:
    if not _which("amixer"):
        return None
    rc, out, _ = _run(["amixer", "-c", str(_ALSA_CARD), "sget", _ALSA_CTL])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# ----------------- MPRIS (playerctl) -----------------

def _playerctl(args: list[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        return False
    rc, _, _ = _run([pc] + args)
    return rc == 0

# ----------------- API publique -----------------

def get_state() -> Dict[str, Any]:
    # On relit le volume réel si possible (Pulse > ALSA)
    v = _pulse_get_volume()
    if v is None:
        v = _alsa_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    ok = _pulse_set_volume(value)
    if not ok:
        _alsa_set_volume(value)
    _state["volume"] = value if ok or _alsa_get_volume() is not None else _state["volume"]
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
      - {"volume": 0..100}
      - {"action":"play"|"pause"|"next"|"prev"}
    """
    if "volume" in payload:
        return set_volume(int(payload["volume"]))

    action = payload.get("action")
    if action == "play":  return play()
    if action == "pause": return pause()
    if action == "next":  return next_track()
    if action == "prev":  return prev_track()

    return get_state()
