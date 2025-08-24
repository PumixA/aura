def apply(payload: dict):
    cmd = payload.get("cmd")
    vol = payload.get("volume")
    if cmd: print(f"[Music] cmd={cmd}")
    if vol is not None: print(f"[Music] volume={vol}")
