import time
_last = {"leds": {"on": True, "color": "#00ffaa", "brightness": 70},
         "music": {"status": "paused", "volume": 40}}

def snapshot():
    # Retourne un état “plausible”. Tu le mettras à jour selon le vrai matos.
    return _last

def apply_patch(path: str, value):
    # ex: path="music.volume"
    cur = _last
    keys = path.split(".")
    for k in keys[:-1]: cur = cur.setdefault(k, {})
    cur[keys[-1]] = value
    _last["ts"] = int(time.time())
