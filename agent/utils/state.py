# utils/state.py
from __future__ import annotations
import time
from typing import Any, Dict

_last: Dict[str, Any] = {
    "leds":  { "on": False, "color": "#FFFFFF", "brightness": 50, "preset": None },
    "music": { "status": "pause", "volume": 40, "track": None },
    "widgets": None,
    "ts": int(time.time()),
}

def _clamp(v: int, a: int, b: int) -> int:
    return max(a, min(b, int(v)))

def snapshot() -> Dict[str, Any]:
    return {
        "leds": dict(_last.get("leds") or {}),
        "music": dict(_last.get("music") or {}),
        "widgets": _last.get("widgets"),
        "ts": _last.get("ts"),
    }

def set_music(m: Dict[str, Any]) -> None:
    if "music" in m: m = m["music"]
    cur = dict(_last.get("music") or {})
    if "status" in m:
        st = str(m["status"]).lower()
        if st not in ("play", "pause"):
            st = cur.get("status", "pause")
        cur["status"] = st
    if "volume" in m:
        cur["volume"] = _clamp(m["volume"], 0, 100)
    if "track" in m:
        cur["track"] = m["track"]
    _last["music"] = cur
    _last["ts"] = int(time.time())

def merge_leds(d: Dict[str, Any]) -> None:
    leds = dict(_last.get("leds") or {})
    if "on" in d:         leds["on"] = bool(d["on"])
    if "color" in d:      leds["color"] = str(d["color"])
    if "brightness" in d: leds["brightness"] = _clamp(d["brightness"], 0, 100)
    if "preset" in d:     leds["preset"] = d["preset"] if d["preset"] not in (None, "") else None
    _last["leds"] = leds
    _last["ts"] = int(time.time())

def set_leds(d: Dict[str, Any]) -> None:
    _last["leds"] = {
        "on": bool(d.get("on", False)),
        "color": str(d.get("color", "#FFFFFF")),
        "brightness": _clamp(d.get("brightness", 50), 0, 100),
        "preset": d.get("preset"),
    }
    _last["ts"] = int(time.time())

def set_widgets(items) -> None:
    _last["widgets"] = items
    _last["ts"] = int(time.time())

def apply_patch(path: str, value):
    cur = _last
    keys = path.split(".")
    for k in keys[:-1]:
        cur = cur.setdefault(k, {})
    cur[keys[-1]] = value
    _last["ts"] = int(time.time())
