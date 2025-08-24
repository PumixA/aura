def apply(payload: dict):
    on = payload.get("on", True)
    color = payload.get("color", "#ffffff")
    brightness = int(payload.get("brightness", 100))
    preset = payload.get("preset")
    print(f"[LEDs] on={on} color={color} brightness={brightness} preset={preset}")
