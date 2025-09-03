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

# Overrides possibles par env
_ALSA_CARD_ENV = os.environ.get("AURA_ALSA_CARD")        # ex: "1"
_ALSA_CTL_ENV  = os.environ.get("AURA_ALSA_CONTROL")     # ex: "PCM" | "Master" | "Speaker"

# Détection lazy de la carte & du contrôle
_detected_card: Optional[int] = None
_detected_ctl: Optional[str] = None

# Regex pour lire le pourcentage dans la sortie amixer
_PCT = re.compile(r"(\d+)%")

def _run(cmd: list[str]) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

def _which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)

def _amixer_card_candidates() -> list[int]:
    # Priorité : env → 1 → 0 → 2..6
    if _ALSA_CARD_ENV and _ALSA_CARD_ENV.isdigit():
        return [int(_ALSA_CARD_ENV)]
    return [1, 0, 2, 3, 4, 5, 6]

def _amixer_try_controls(card: int) -> Optional[str]:
    # On liste les controls simples et on choisit par ordre : PCM, Master, Speaker, Headphone
    rc, out, err = _run(["amixer", "-c", str(card), "scontrols"])
    if rc != 0 or not out:
        return None
    names = []
    for line in out.splitlines():
        # Ex: "Simple mixer control 'PCM',0"
        m = re.search(r"Simple mixer control '([^']+)'", line)
        if m:
            names.append(m.group(1))
    for pref in ("PCM", "Master", "Speaker", "Headphone"):
        if pref in names:
            return pref
    # fallback: premier dispo
    return names[0] if names else None

def _ensure_card_ctl():
    global _detected_card, _detected_ctl
    if _detected_card is not None and _detected_ctl is not None:
        return
    # Si control imposé par env, on essaie directement
    if _ALSA_CARD_ENV and _ALSA_CTL_ENV:
        _detected_card = int(_ALSA_CARD_ENV)
        _detected_ctl = _ALSA_CTL_ENV
        return
    # Sinon on scanne
    for c in _amixer_card_candidates():
        ctl = _ALSA_CTL_ENV or _amixer_try_controls(c)
        if ctl:
            _detected_card, _detected_ctl = c, ctl
            return
    # Ultime fallback : on essaiera card=0/ctl=Master (ça peut échouer, mais on n’explose pas)
    _detected_card, _detected_ctl = 0, "Master"

def _alsa_set_volume(pct: int) -> None:
    _ensure_card_ctl()
    pct = max(0, min(100, int(pct)))
    # -M = "mapped volume"
    _run(["amixer", "-c", str(_detected_card), "sset", _detected_ctl, f"{pct}%", "-M"])

def _alsa_get_volume() -> Optional[int]:
    _ensure_card_ctl()
    rc, out, err = _run(["amixer", "-c", str(_detected_card), "sget", _detected_ctl])
    if rc != 0 or not out:
        return None
    # Cherche la première occurrence "xx%"
    m = _PCT.search(out)
    if not m:
        return None
    v = int(m.group(1))
    return max(0, min(100, v))

def _playerctl(cmd: list[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        return False
    rc, out, err = _run([pc] + cmd)
    return rc == 0

# ----------------- API publique -----------------

def get_state() -> Dict[str, Any]:
    # Essaie de relire le volume réel
    v = _alsa_get_volume()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))
    _alsa_set_volume(value)
    _state["volume"] = value
    return get_state()

def play() -> Dict[str, Any]:
    ok = _playerctl(["play"])
    _state["status"] = "play" if ok else _state["status"]
    return get_state()

def pause() -> Dict[str, Any]:
    ok = _playerctl(["pause"])
    _state["status"] = "pause" if ok else _state["status"]
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

    # silencieux si action inconnue
    return get_state()
