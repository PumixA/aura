# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any, List

# État local minimal
_state = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100
    "track": None,
}

# Pour ALSA fallback éventuel (peut servir selon ta carte)
_ALSA_CARD_ENV = os.environ.get("AURA_ALSA_CARD")        # ex: "1"
_ALSA_CTL_ENV  = os.environ.get("AURA_ALSA_CONTROL")     # ex: "PCM" | "Master" | "Speaker"

_PCT = re.compile(r"(\d+)%")

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def _run(cmd: List[str], env: Optional[dict]=None) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False, text=True, env=env
        )
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

def _run_as_melvin(cmd: List[str]) -> tuple[int, str, str]:
    """
    Si on est root (uid 0), exécute la commande en tant que l'utilisateur 'melvin'
    avec son environnement session (pactl/playerctl).
    Sinon exécute normalement.
    """
    if os.geteuid() == 0:
        # Prefer runuser (pas besoin de sudoers)
        base = ["runuser", "-u", "melvin", "--"]
        return _run(base + cmd, env=None)
    else:
        return _run(cmd, env=None)

# --------- PULSE (pactl) ----------
def _pactl_set_volume(pct: int) -> bool:
    pct = max(0, min(100, int(pct)))
    pc = _which("pactl")
    if not pc:
        return False
    # @DEFAULT_SINK@ suffit, PipeWire route vers l’enceinte USB
    rc, out, err = _run_as_melvin([pc, "set-sink-volume", "@DEFAULT_SINK@", f"{pct}%"])
    return rc == 0

def _pactl_get_volume() -> Optional[int]:
    pc = _which("pactl")
    if not pc:
        return None
    rc, out, err = _run_as_melvin([pc, "get-sink-volume", "@DEFAULT_SINK@"])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# --------- playerctl (MPRIS) ----------
def _playerctl(cmd: List[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        return False
    rc, out, err = _run_as_melvin([pc] + cmd)
    return rc == 0

# ----------------- API publique -----------------

def get_state() -> Dict[str, Any]:
    v = _pactl_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    ok = _pactl_set_volume(value)
    if ok:
        _state["volume"] = value
    else:
        # on ne claque pas d'erreur, on reflète au mieux
        cur = _pactl_get_volume()
        if cur is not None:
            _state["volume"] = cur
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
