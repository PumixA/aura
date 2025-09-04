# utils/state.py
from __future__ import annotations
import threading
import time
from typing import Dict, Any, Optional

_lock = threading.RLock()

# État local simple et propre (pas de 'ts' injecté dans le snapshot pour éviter le bruit)
_state: Dict[str, Any] = {
    "leds":  {"on": False, "color": "#FFFFFF", "brightness": 50, "preset": None},
    "music": {"status": "pause", "volume": 40, "track": None},
    "widgets": [],
}

def snapshot() -> Dict[str, Any]:
    with _lock:
        # retourner une copie pour éviter les mutations externes
        return {
            "leds": dict(_state.get("leds", {})),
            "music": dict(_state.get("music", {})),
            "widgets": list(_state.get("widgets", [])),
        }

def set_leds(leds: Dict[str, Any]) -> None:
    with _lock:
        cur = dict(_state.get("leds", {}))
        cur.update({k: v for k, v in leds.items() if k in ("on", "color", "brightness", "preset")})
        _state["leds"] = cur

def merge_leds(patch: Dict[str, Any]) -> None:
    set_leds(patch)

def set_music(music: Dict[str, Any]) -> None:
    with _lock:
        cur = dict(_state.get("music", {}))
        for k in ("status", "volume", "track"):
            if k in music:
                cur[k] = music[k]
        _state["music"] = cur

def set_widgets(items) -> None:
    with _lock:
        _state["widgets"] = list(items or [])

# utilitaire (facultatif)
def apply_patch(path: str, value: Any) -> None:
    with _lock:
        cur = _state
        keys = path.split(".")
        for k in keys[:-1]:
            if k not in cur or not isinstance(cur[k], dict):
                cur[k] = {}
            cur = cur[k]
        cur[keys[-1]] = value

# debug helper (optionnel)
def _touch_ts():
    with _lock:
        _state["_ts"] = int(time.time())
