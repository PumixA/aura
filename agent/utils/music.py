from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any, List

# État logique local. NE PAS forcer 40% par défaut (évite l'effet "il force à 40 au boot")
_state: Dict[str, Any] = {"status": "pause", "volume": None, "track": None}

_PCT = re.compile(r"(\d+)%")

# overrides possibles
_PULSE_SINK_ENV = os.environ.get("AURA_PULSE_SINK")   # ex: "alsa_output.usb-...iec958-stereo"
_DEBUG          = os.environ.get("AURA_DEBUG") == "1"

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def _log(msg: str):
    if _DEBUG:
        print(msg)

def _run(cmd: List[str], env: Optional[dict] = None) -> tuple[int, str, str]:
    _log(f"🟪 RUN: {' '.join(cmd)}  ENV.XDG_RUNTIME_DIR={env.get('XDG_RUNTIME_DIR') if env else None}")
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True, env=env)
        out = (p.stdout or "").strip()
        err = (p.stderr or "").strip()
        _log(f"🟪 OUT: {out}")
        _log(f"🟪 ERR: {err}")
        return p.returncode, out, err
    except Exception as e:
        return 1, "", str(e)

def _session_env_for_user() -> dict:
    # Quand exécuté en root, on doit cibler la session user (Pulse socket)
    if os.geteuid() == 0:
        env = dict(os.environ)
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        return env
    return os.environ.copy()

def _run_as_melvin(cmd: List[str]) -> tuple[int, str, str]:
    if os.geteuid() == 0:
        base = ["runuser", "-u", "melvin", "--"]
        return _run(base + cmd, env=_session_env_for_user())
    else:
        return _run(cmd, env=_session_env_for_user())

# --------- Résolution du sink ----------
_sink_cache: Optional[str] = None

def _resolve_sink() -> str:
    global _sink_cache
    if _sink_cache:
        return _sink_cache

    if _PULSE_SINK_ENV:
        _sink_cache = _PULSE_SINK_ENV
        _log(f"🎯 SINK (env): {_sink_cache}")
        return _sink_cache

    pc = _which("pactl")
    if pc:
        # Essaye d'abord get-default-sink (PipeWire/Pulse récents)
        rc, out, _ = _run_as_melvin([pc, "get-default-sink"])
        if rc == 0 and out:
            _sink_cache = out.splitlines()[0].strip()
            _log(f"🎯 SINK (get-default-sink): {_sink_cache}")
            return _sink_cache
    # Fallback
    _sink_cache = "@DEFAULT_SINK@"
    _log(f"🎯 SINK (fallback): {_sink_cache}")
    return _sink_cache

# --------- PULSE (pactl) ----------
def _pactl_set_volume(pct: int) -> bool:
    pct = max(0, min(100, int(pct)))
    pc = _which("pactl")
    if not pc:
        _log("❌ pactl introuvable")
        return False
    sink = _resolve_sink()
    rc, _, _ = _run_as_melvin([pc, "set-sink-volume", sink, f"{pct}%"])
    return rc == 0

def _pactl_get_volume() -> Optional[int]:
    pc = _which("pactl")
    if not pc:
        _log("❌ pactl introuvable")
        return None
    sink = _resolve_sink()
    # get-sink-volume marche aussi avec @DEFAULT_SINK@ ou un nom.
    rc, out, _ = _run_as_melvin([pc, "get-sink-volume", sink])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# --------- playerctl (MPRIS) ----------
def _playerctl(args: List[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        _log("ℹ️ playerctl introuvable")
        return False
    rc, _, _ = _run_as_melvin([pc] + args)
    return rc == 0

# ----------------- API publique -----------------
def get_state() -> Dict[str, Any]:
    """
    Lit *toujours* le volume réel. Ne remonte pas un 40% fantôme :
    si la lecture OS échoue → on laisse volume tel quel (peut être None).
    """
    v = _pactl_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    """
    Applique et vérifie immédiatement. Journalise la divergence si le sink n’atteint pas la valeur.
    """
    want = max(0, min(100, int(value)))
    ok = _pactl_set_volume(want)
    real = _pactl_get_volume()

    if real is not None:
        _state["volume"] = real

    if not ok:
        _log(f"⚠️ pactl set-sink-volume a retourné une erreur pour {want}%")

    if real is None:
        _log("⚠️ lecture volume après set a échoué (real=None)")
    elif real != want:
        _log(f"⚠️ divergence: demandé={want}% ; réel={real}%")

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
        try:
            return set_volume(int(payload["volume"]))
        except Exception:
            # si c'est une string genre "42" ou "42.0"
            v = str(payload["volume"]).strip()
            v = int(float(v))
            return set_volume(v)

    action = (str(payload.get("action") or "")).lower()
    if action == "play":  return play()
    if action == "pause": return pause()
    if action == "next":  return next_track()
    if action == "prev":  return prev_track()
    return get_state()
