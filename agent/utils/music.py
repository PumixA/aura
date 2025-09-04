# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any, List

_state = {"status": "pause", "volume": 40, "track": None}

_PCT = re.compile(r"(\d+)%")

# overrides possibles
_PULSE_SINK = os.environ.get("AURA_PULSE_SINK")   # ex: "alsa_output.usb-...iec958-stereo"
_DEBUG      = os.environ.get("AURA_DEBUG") == "1"

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def _run(cmd: List[str], env: Optional[dict] = None) -> tuple[int, str, str]:
    if _DEBUG:
        print(f"🟪 RUN: {' '.join(cmd)}  ENV.XDG_RUNTIME_DIR={env.get('XDG_RUNTIME_DIR') if env else None}")
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True, env=env)
        if _DEBUG:
            print("🟪 OUT:", (p.stdout or "").strip())
            print("🟪 ERR:", (p.stderr or "").strip())
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except Exception as e:
        return 1, "", str(e)

def _run_as_melvin(cmd: List[str]) -> tuple[int, str, str]:
    """
    Si root: exécute la commande côté session utilisateur 'melvin' (Pulse socket dans /run/user/1000).
    Sinon: exécute tel quel.
    """
    if os.geteuid() == 0:
        base = ["runuser", "-u", "melvin", "--"]
        env  = {"XDG_RUNTIME_DIR": "/run/user/1000"}  # <- indispensable pour pactl/playerctl
        return _run(base + cmd, env=env)
    else:
        # On hérite de l'env de melvin (déjà dans la session)
        return _run(cmd, env=os.environ.copy())

# --------- PULSE (pactl) ----------
def _pactl_set_volume(pct: int) -> bool:
    pct = max(0, min(100, int(pct)))
    pc = _which("pactl")
    if not pc:
        return False
    sink = _PULSE_SINK or "@DEFAULT_SINK@"
    rc, _, _ = _run_as_melvin([pc, "set-sink-volume", sink, f"{pct}%"])
    return rc == 0

def _pactl_get_volume() -> Optional[int]:
    pc = _which("pactl")
    if not pc:
        return None
    sink = _PULSE_SINK or "@DEFAULT_SINK@"
    rc, out, _ = _run_as_melvin([pc, "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    return max(0, min(100, int(m.group(1)))) if m else None

# --------- playerctl (MPRIS) ----------
def _playerctl(args: List[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        return False
    rc, _, _ = _run_as_melvin([pc] + args)
    return rc == 0

# ----------------- API publique -----------------
def get_state() -> Dict[str, Any]:
    v = _pactl_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    want = max(0, min(100, int(value)))
    ok = _pactl_set_volume(want)
    real = _pactl_get_volume()
    if real is not None:
        _state["volume"] = real
    # on ne soulève pas d'erreur même si ok=False ; on reflète le réel
    return get_state()

def play() -> Dict[str, Any]:
    if _playerctl(["play"]):
        _state["status"] = "play"
    return get_state()

def pause() -> Dict[str, Any]:
    if _playerctl(["pause"]):
        _state["status"] = "pause"
    return get_state()

def next_track() -> Dict[str, Any]:
    _playerctl(["next"])
    return get_state()

def prev_track() -> Dict[str, Any]:
    _playerctl(["previous"])
    return get_state()

def apply(payload: Dict[str, Any]) -> Dict[str, Any]:
    if "volume" in payload:
        return set_volume(int(payload["volume"]))
    action = (payload.get("action") or "").lower()
    if action == "play":  return play()
    if action == "pause": return pause()
    if action == "next":  return next_track()
    if action == "prev":  return prev_track()
    return get_state()
