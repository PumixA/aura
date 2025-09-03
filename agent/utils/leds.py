# utils/leds.py
from __future__ import annotations
import os, re
from typing import Tuple, Optional

try:
    from rpi_ws281x import Adafruit_NeoPixel, Color
    _HAVE_WS281X = True
except Exception:
    _HAVE_WS281X = False

DEFAULT_LED_COUNT = int(os.environ.get("AURA_LED_COUNT", "300"))  # 5m @ 60/m
DEFAULT_LED_PIN   = int(os.environ.get("AURA_LED_PIN", "18"))     # GPIO18 PWM
DEFAULT_FREQ_HZ   = 800_000
DEFAULT_DMA       = 10
DEFAULT_INVERT    = False
DEFAULT_CHANNEL   = 0

_HEX = re.compile(r'^#[0-9A-Fa-f]{6}$')

def _hex_to_rgb(hexstr: str) -> Tuple[int, int, int]:
    if not _HEX.match(hexstr or ''):
        raise ValueError(f"Invalid hex color: {hexstr}")
    h = hexstr.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def _bmap(v: int) -> int:
    v = max(0, min(100, int(v)))
    return int(round(v * 255 / 100))

class _MockStrip:
    def __init__(self, n: int):
        self.n = n
        self.b = 255
    def begin(self): pass
    def setBrightness(self, b: int): self.b = b
    def setPixelColor(self, i: int, color): pass
    def show(self): pass
    def numPixels(self): return self.n

class AuraLEDs:
    def __init__(self, count=DEFAULT_LED_COUNT, pin=DEFAULT_LED_PIN,
                 freq_hz=DEFAULT_FREQ_HZ, dma=DEFAULT_DMA,
                 invert=DEFAULT_INVERT, channel=DEFAULT_CHANNEL):
        self.count = count
        self.on = False
        self.color_hex = "#FFFFFF"
        self.brightness_0_100 = 20

        if _HAVE_WS281X:
            self._strip = Adafruit_NeoPixel(count, pin, DEFAULT_FREQ_HZ, DEFAULT_DMA, DEFAULT_INVERT, 255, DEFAULT_CHANNEL)
            self._strip.begin()
            self._strip.setBrightness(_bmap(self.brightness_0_100))
        else:
            self._strip = _MockStrip(count)

        self.apply()

    def set_on(self, v: bool):
        self.on = bool(v)
        self.apply()

    def set_color(self, hexstr: str):
        r, g, b = _hex_to_rgb(hexstr)   # validation
        self.color_hex = f"#{hexstr.lstrip('#').upper()}"
        self.apply()

    def set_brightness(self, v: int):
        self.brightness_0_100 = max(0, min(100, int(v)))
        if _HAVE_WS281X:
            self._strip.setBrightness(_bmap(self.brightness_0_100))
        self.apply()

    def set_preset(self, name: Optional[str]):
        if not name: return
        name = name.lower()
        if name == "ocean":  self._preset_gradient((0, 40, 120), (0, 180, 170))
        elif name == "fire": self._preset_gradient((255, 80, 0), (180, 0, 0))
        elif name == "aurora": self._preset_gradient((0, 210, 160), (160, 0, 160))
        else: raise ValueError(f"Unknown preset: {name}")
        self.on = True
        self._strip.show()

    def snapshot(self) -> dict:
        return {"on": self.on, "color": self.color_hex, "brightness": self.brightness_0_100, "preset": None}

    def apply(self):
        if not self.on:
            self._fill_all((0, 0, 0))
            self._strip.show()
            return
        r, g, b = _hex_to_rgb(self.color_hex)
        # 👉 NE PAS réappliquer la luminosité dans la couleur : on utilise setBrightness() du driver
        self._fill_all((r, g, b))
        self._strip.show()

    def _fill_all(self, rgb: Tuple[int, int, int]):
        if _HAVE_WS281X:
            # WS281x attend GRB
            packed = Color(rgb[1], rgb[0], rgb[2])
            for i in range(self._strip.numPixels()):
                self._strip.setPixelColor(i, packed)

    def _preset_gradient(self, a, b):
        n = self._strip.numPixels()
        for i in range(n):
            t = i / max(1, n - 1)
            r = int(a[0] + (b[0] - a[0]) * t)
            g = int(a[1] + (b[1] - a[1]) * t)
            bl = int(a[2] + (b[2] - a[2]) * t)
            if _HAVE_WS281X:
                self._strip.setPixelColor(i, Color(g, r, bl))

# --- Compat "legacy": singleton + helpers ---
_SINGLETON: AuraLEDs | None = None
def _dev() -> AuraLEDs:
    global _SINGLETON
    if _SINGLETON is None:
        _SINGLETON = AuraLEDs()
    return _SINGLETON

def apply(payload: dict):
    p = payload.get("leds", payload)
    if "on" in p:          _dev().set_on(bool(p["on"]))
    if "color" in p:       _dev().set_color(str(p["color"]))
    if "brightness" in p:  _dev().set_brightness(int(p["brightness"]))
    if "preset" in p and p["preset"]: _dev().set_preset(str(p["preset"]))

def set_on(v: bool): _dev().set_on(v)
def set_color(h: str): _dev().set_color(h)
def set_brightness(v: int): _dev().set_brightness(v)
def set_preset(n: Optional[str]): _dev().set_preset(n)
def snapshot() -> dict: return _dev().snapshot()
