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

_DEBUG = os.environ.get("AURA_AUDIO_DEBUG") not in (None, "", "0", "false", "False")
def _dprint(*a):
    if _DEBUG:
        print("[music]", *a)

# --- Try Pulse via pulsectl (libpulse)
try:
    import pulsectl  # type: ignore
    _HAVE_PULSECTL = True
except Exception:
    _HAVE_PULSECTL = False

# --- pactl fallback
def _which(name: str) -> Optional[str]:
    return shutil.which(name)

def _run(cmd: list[str]) -> tuple[int, str, str]:
    _dprint("RUN:", " ".join(cmd))
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True)
        if _DEBUG:
            if p.stdout.strip(): _dprint("STDOUT:", p.stdout.strip())
            if p.stderr.strip(): _dprint("STDERR:", p.stderr.strip())
            _dprint("RC:", p.returncode)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

# ----------- PULSE via pulsectl -----------
def _pulse_client() -> Optional["pulsectl.Pulse"]:
    if not _HAVE_PULSECTL:
        return None
    try:
        # nom du client arbitraire
        return pulsectl.Pulse('aura-agent')
    except Exception as e:
        _dprint("pulsectl connect fail:", e)
        return None

def _pulse_default_sink_pulsectl(client: "pulsectl.Pulse"):
    try:
        sink = client.get_sink_by_name(client.server_info().default_sink_name)
        return sink
    except Exception as e:
        _dprint("get default sink (pulsectl) fail:", e)
        return None

def _pulsectl_get_volume_pct() -> Optional[int]:
    client = _pulse_client()
    if not client:
        return None
    try:
        sink = _pulse_default_sink_pulsectl(client)
        if not sink:
            return None
        # Moyenne des canaux en %
        vol = int(round(100 * float(sink.volume.value_flat)))
        return max(0, min(100, vol))
    except Exception as e:
        _dprint("pulsectl get vol fail:", e)
        return None
    finally:
        try: client.close()
        except: pass

def _pulsectl_set_volume_pct(pct: int) -> bool:
    client = _pulse_client()
    if not client:
        return False
    try:
        sink = _pulse_default_sink_pulsectl(client)
        if not sink:
            return False
        pct = max(0, min(100, int(pct)))
        # value_flat est [0..1]; clamp au-dessus de 1.0 si besoin
        vol = min(1.0, pct / 100.0)
        # Applique uniformément sur tous les canaux
        new_vol = sink.volume
        for i in range(len(new_vol.values)):
            new_vol.values[i] = vol
        client.volume_set(sink, new_vol)
        return True
    except Exception as e:
        _dprint("pulsectl set vol fail:", e)
        return False
    finally:
        try: client.close()
        except: pass

# ----------- pactl fallback -----------
_PULSE_SINK = os.environ.get("AURA_PULSE_SINK", "@DEFAULT_SINK@")
_PCT = re.compile(r"(\d+)%")

def _pactl_get_volume_pct() -> Optional[int]:
    if not _which("pactl"):
        return None
    rc, out, _ = _run(["pactl", "get-sink-volume", _PULSE_SINK])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

def _pactl_set_volume_pct(pct: int) -> bool:
    if not _which("pactl"):
        return False
    pct = max(0, min(100, int(pct)))
    rc, _, _ = _run(["pactl", "set-sink-volume", _PULSE_SINK, f"{pct}%"])
    return rc == 0

# ----------- ALSA (secours ultime) -----------
_ALSA_CARD = int(os.environ.get("AURA_ALSA_CARD", "1"))
_ALSA_CTL  = os.environ.get("AURA_ALSA_CONTROL", "PCM")

def _alsa_get_volume_pct() -> Optional[int]:
    if not _which("amixer"):
        return None
    rc, out, _ = _run(["amixer", "-c", str(_ALSA_CARD), "sget", _ALSA_CTL])
    if rc != 0 or not out:
        return None
    m = _PCT.search(out)
    if not m:
        return None
    return max(0, min(100, int(m.group(1))))

def _alsa_set_volume_pct(pct: int) -> bool:
    if not _which("amixer"):
        return False
    pct = max(0, min(100, int(pct)))
    rc, _, _ = _run(["amixer", "-c", str(_ALSA_CARD), "sset", _ALSA_CTL, f"{pct}%", "-M"])
    return rc == 0

# ----------- Playerctl (MPRIS) -----------
def _playerctl(args: list[str]) -> bool:
    pc = _which("playerctl")
    if not pc:
        _dprint("playerctl non trouvé")
        return False
    rc, _, _ = _run([pc] + args)
    return rc == 0

# ----------- API publique -----------
def get_state() -> Dict[str, Any]:
    v = _pulsectl_get_volume_pct()
    if v is None:
        v = _pactl_get_volume_pct()
    if v is None:
        v = _alsa_get_volume_pct()
    if v is not None:
        _state["volume"] = v
    return dict(_state)

def set_volume(value: int) -> Dict[str, Any]:
    value = max(0, min(100, int(value)))

    ok = _pulsectl_set_volume_pct(value)
    if not ok:
        _dprint("pulsectl set failed → pactl…")
        ok = _pactl_set_volume_pct(value)
    if not ok:
        _dprint("pactl set failed → alsa…")
        _alsa_set_volume_pct(value)

    # relire vraiment
    v = _pulsectl_get_volume_pct()
    if v is None:
        v = _pactl_get_volume_pct()
    if v is None:
        v = _alsa_get_volume_pct()
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
