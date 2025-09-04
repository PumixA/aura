# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any, List, Tuple

# === Config via ENV ===
# Force un sink précis (sinon défaut PipeWire)
_PULSE_SINK = os.environ.get("AURA_PULSE_SINK")          # ex: "alsa_output.usb-...iec958-stereo"
# Force XDG_RUNTIME_DIR quand root -> session melvin (utile si besoin)
_XDG_RUNTIME_DIR = os.environ.get("XDG_RUNTIME_DIR", "/run/user/1000")
# Debug
_DEBUG = os.environ.get("AURA_DEBUG", "0") not in ("0", "", "false", "False")

# État local minimal
_state: Dict[str, Any] = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100 (info locale, on relit la vraie valeur régulièrement)
    "track": None,
}

_PCT = re.compile(r"(\d+)%")

def _log(*a):
    if _DEBUG: print("🎚️[music]", *a)

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def _run(cmd: List[str], env: Optional[dict]=None) -> Tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           check=False, text=True, env=env)
        rc, out, err = p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
        _log("RUN:", " ".join(cmd))
        if out: _log("OUT:", out)
        if err: _log("ERR:", err)
        _log("RC:", rc)
        return rc, out, err
    except Exception as e:
        _log("EXC:", e)
        return 1, "", str(e)

def _run_as_melvin(cmd: List[str]) -> Tuple[int, str, str]:
    """
    Si on est root, exécute la commande en tant que 'melvin' (pour pactl/playerctl).
    """
    if os.geteuid() == 0:
        base = ["runuser", "-u", "melvin", "--"]
        # On préserve XDG_RUNTIME_DIR pour pactl
        env = dict(os.environ)
        env["XDG_RUNTIME_DIR"] = _XDG_RUNTIME_DIR
        return _run(base + cmd, env=env)
    else:
        return _run(cmd, env=None)

# ---------- PulseAudio / PipeWire ----------
def _pactl_sink_name() -> Optional[str]:
    pc = _which("pactl")
    if not pc:
        return None
    if _PULSE_SINK:
        return _PULSE_SINK
    rc, out, _ = _run_as_melvin([pc, "get-default-sink"])
    if rc == 0 and out:
        return out.splitlines()[-1].strip()
    return "@DEFAULT_SINK@"  # fallback

def _pactl_get_volume() -> Optional[int]:
    pc = _which("pactl")
    if not pc:
        _log("pactl introuvable.")
        return None
    sink = _pactl_sink_name()
    if not sink:
        _log("sink introuvable.")
        return None
    rc, out, _ = _run_as_melvin([pc, "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    # Prend le premier pourcentage trouvé
    m = _PCT.search(out)
    if not m:
        return None
    v = max(0, min(100, int(m.group(1))))
    return v

def _pactl_set_volume(pct: int) -> bool:
    pct = max(0, min(100, int(pct)))
    pc = _which("pactl")
    if not pc:
        return False
    sink = _pactl_sink_name() or "@DEFAULT_SINK@"
    rc, _, _ = _run_as_melvin([pc, "set-sink-volume", sink, f"{pct}%"])
    # pipewire/pulse peuvent “mapper” (dB). On relit pour savoir la vraie valeur.
    return rc == 0

# ---------- playerctl (MPRIS) ----------
def _playerctl(args: List[str]) -> bool:
    bin_ = _which("playerctl")
    if not bin_:
        _log("playerctl introuvable.")
        return False
    rc, _, _ = _run_as_melvin([bin_] + args)
    return rc == 0

# ---------- API publique ----------
def get_state() -> Dict[str, Any]:
    # Toujours relire la vraie valeur système (source de vérité)
    v = _pactl_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    ok = _pactl_set_volume(value)
    real = _pactl_get_volume()
    if real is not None:
        _state["volume"] = real
    elif ok:
        _state["volume"] = value
    _log(f"SET VOLUME asked={value}% -> real={_state['volume']}%")
    return get_state()

def play() -> Dict[str, Any]:
    ok = _playerctl(["play"])
    if ok:
        _state["status"] = "play"
    _log("PLAY ->", _state["status"])
    return get_state()

def pause() -> Dict[str, Any]:
    ok = _playerctl(["pause"])
    if ok:
        _state["status"] = "pause"
    _log("PAUSE ->", _state["status"])
    return get_state()

def next_track() -> Dict[str, Any]:
    _playerctl(["next"])
    _log("NEXT")
    return get_state()

def prev_track() -> Dict[str, Any]:
    _playerctl(["previous"])
    _log("PREV")
    return get_state()

def apply(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepte:
      - {"action":"play"|"pause"|"next"|"prev"}
      - {"volume": 0..100} ou {"value": 0..100}
    """
    if "value" in payload:
        return set_volume(int(payload["value"]))
    if "volume" in payload:
        return set_volume(int(payload["volume"]))

    action = str(payload.get("action", "")).lower()
    if action == "play":  return play()
    if action == "pause": return pause()
    if action == "next":  return next_track()
    if action == "prev":  return prev_track()

    return get_state()
