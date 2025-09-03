# utils/music.py
from __future__ import annotations
import os
import re
import shutil
import subprocess
from typing import Optional, Dict, Any

# ---- Etat local minimal
_state = {
    "status": "pause",   # "play" | "pause"
    "volume": 40,        # 0..100
    "track": None,
}

# ---- Debug toggle (export AURA_AUDIO_DEBUG=1 pour verboser)
_DEBUG = os.environ.get("AURA_AUDIO_DEBUG") not in (None, "", "0", "false", "False")

def _dprint(*a):
    if _DEBUG:
        print("[music]", *a)

# ---- Pulse (pactl) config
# On préfère cibler le DEFAULT_SINK plutôt qu'un nom long fragile.
# Si tu veux forcer un sink, exporte AURA_PULSE_SINK="nom_du_sink".
_PULSE_SINK = os.environ.get("AURA_PULSE_SINK", "@DEFAULT_SINK@")

# ---- ALSA fallback (détectés dans ton diag)
_ALSA_CARD = int(os.environ.get("AURA_ALSA_CARD", "1"))
_ALSA_CTL  = os.environ.get("AURA_ALSA_CONTROL", "PCM")

_PCT = re.compile(r"(\d+)%")

def _which(name: str) -> Optional[str]:
    return shutil.which(name)

def _run(cmd: list[str]) -> tuple[int, str, str]:
    _dprint("RUN:", " ".join(cmd))
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        if _DEBUG:
            if p.stdout.strip():
                _dprint("STDOUT:", p.stdout.strip())
            if p.stderr.strip():
                _dprint("STDERR:", p.stderr.strip())
            _dprint("RC:", p.returncode)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

# ----------------- PULSE -----------------

def _pulse_set_volume(pct: int) -> bool:
    if not _which("pactl"):
        return False
    pct = max(0, min(100, int(pct)))
    # set-sink-volume accepte @DEFAULT_SINK@ → parfait pour éviter les noms longs
    rc, _, _ = _run(["pactl", "set-sink-volume", _PULSE_SINK, f"{pct}%"])
    return rc == 0

def _pulse_get_volume() -> Optional[int]:
    if not _which("pactl"):
        return None
    rc, out, _ = _run(["pactl", "get-sink-volume", _PULSE_SINK])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

# ----------------- ALSA (fallback) -----------------

def _alsa_set_volume(pct: int) -> bool:
    if not _which("amixer"):
        return False
    pct = max(0, min(100, int(pct)))
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
        _dprint("playerctl non trouvé")
        return False
    rc, _, _ = _run([pc] + args)
    return rc == 0

# ----------------- API publique -----------------

def get_state() -> Dict[str, Any]:
    # On lit d'abord le volume Pulse, sinon ALSA
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
        _dprint("Pulse set-volume a échoué, fallback ALSA…")
        _alsa_set_volume(value)

    # Relire réellement (Pulse en priorité)
    v = _pulse_get_volume()
    if v is None:
        v = _alsa_get_volume()
    if v is not None:
        _state["volume"] = v
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
