# utils/leds.py
from __future__ import annotations
import os
import re
from typing import Tuple, Optional

# Tente le driver matériel, sinon fallback mock
try:
    from rpi_ws281x import Adafruit_NeoPixel, Color
    _HAVE_WS281X = True
except Exception:
    _HAVE_WS281X = False

# --- Paramètres par défaut (adaptés à ta bande WS2812B 5m@60/m -> 300) ----
DEFAULT_LED_COUNT = int(os.environ.get("AURA_LED_COUNT", "300"))
DEFAULT_LED_PIN   = int(os.environ.get("AURA_LED_PIN", "18"))  # GPIO18 (PWM)
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

def _map_brightness_0_100_to_0_255(val: int) -> int:
    v = max(0, min(100, int(val)))
    return int(round(v * 255 / 100))

def _apply_brightness(rgb: Tuple[int, int, int], brightness_0_255: int) -> Tuple[int, int, int]:
    r, g, b = rgb
    scale = max(0, min(255, brightness_0_255)) / 255.0
    # légère courbe gamma pour éviter les bas niveaux trop sombres
    def gcurve(c):
        return int(round((c / 255.0) ** 1.6 * 255))
    return (
        int(gcurve(int(r * scale))),
        int(gcurve(int(g * scale))),
        int(gcurve(int(b * scale))),
    )

class _MockStrip:
    """Driver de secours pour dev sans hardware."""
    def __init__(self, count: int):
        self.count = count
        self.pixels = [(0, 0, 0)] * count
        self._brightness = 255
    def begin(self): pass
    def setBrightness(self, b: int): self._brightness = b
    def setPixelColor(self, i: int, color):
        if isinstance(color, int):
            r = (color >> 16) & 0xFF
            g = (color >> 8) & 0xFF
            b = color & 0xFF
            self.pixels[i] = (r, g, b)
        else:
            self.pixels[i] = color
    def show(self): pass
    def numPixels(self): return self.count

class AuraLEDs:
    """
    WS2812B (NeoPixel) wrapper:
      - on/off
      - color hex #RRGGBB
      - brightness 0..100
      - presets: ocean | fire | aurora
    Par défaut: 300 LEDs, GPIO18 (PWM), 800 kHz.
    """
    def __init__(
            self,
            count: int = DEFAULT_LED_COUNT,
            pin: int = DEFAULT_LED_PIN,
            freq_hz: int = DEFAULT_FREQ_HZ,
            dma: int = DEFAULT_DMA,
            invert: bool = DEFAULT_INVERT,
            channel: int = DEFAULT_CHANNEL,
    ):
        self.count = count
        self.color_hex = "#FFFFFF"
        self.on = False
        self.brightness_0_100 = 50

        if _HAVE_WS281X:
            self._strip = Adafruit_NeoPixel(
                count, pin, freq_hz, dma, invert, 255, channel
            )
            self._strip.begin()
            self._strip.setBrightness(_map_brightness_0_100_to_0_255(self.brightness_0_100))
        else:
            self._strip = _MockStrip(count)

        self.apply()  # init éteint

    # ---- API publique ----
    def set_on(self, on: bool):
        self.on = bool(on)
        self.apply()

    def set_color(self, color_hex: str):
        _ = _hex_to_rgb(color_hex)  # validation
        self.color_hex = color_hex
        self.apply()

    def set_brightness(self, val_0_100: int):
        self.brightness_0_100 = max(0, min(100, int(val_0_100)))
        if _HAVE_WS281X:
            self._strip.setBrightness(_map_brightness_0_100_to_0_255(self.brightness_0_100))
        self.apply()

    def set_preset(self, name: Optional[str]):
        if not name:
            return
        name = name.lower()
        if name == "ocean":
            self._preset_ocean()
        elif name == "fire":
            self._preset_fire()
        elif name == "aurora":
            self._preset_aurora()
        else:
            raise ValueError(f"Unknown preset: {name}")
        self.on = True
        self._strip.show()

    def snapshot(self) -> dict:
        return {
            "on": self.on,
            "color": self.color_hex,
            "brightness": self.brightness_0_100,
            "preset": None,
        }

    # ---- Interne ----
    def apply(self):
        if not self.on:
            self._fill_all((0, 0, 0))
            self._strip.show()
            return
        rgb = _hex_to_rgb(self.color_hex)
        rgb = _apply_brightness(rgb, _map_brightness_0_100_to_0_255(self.brightness_0_100))
        self._fill_all(rgb)
        self._strip.show()

    def _fill_all(self, rgb: Tuple[int, int, int]):
        # rpi_ws281x packe GRB
        if _HAVE_WS281X:
            packed = Color(rgb[1], rgb[0], rgb[2])  # (G,R,B)
            for i in range(self._strip.numPixels()):
                self._strip.setPixelColor(i, packed)
        else:
            for i in range(self._strip.numPixels()):
                self._strip.setPixelColor(i, rgb)

    def _gradient(self, rgb_a, rgb_b):
        n = self._strip.numPixels()
        for i in range(n):
            t = i / max(1, n - 1)
            r = int(rgb_a[0] + (rgb_b[0] - rgb_a[0]) * t)
            g = int(rgb_a[1] + (rgb_b[1] - rgb_a[1]) * t)
            b = int(rgb_a[2] + (rgb_b[2] - rgb_a[2]) * t)
            if _HAVE_WS281X:
                self._strip.setPixelColor(i, Color(g, r, b))
            else:
                self._strip.setPixelColor(i, (r, g, b))

    # ---- Presets ----
    def _preset_ocean(self):
        # Bleu profond → cyan
        self._gradient((0, 40, 120), (0, 180, 170))

    def _preset_fire(self):
        # Orange chaud → rouge
        self._gradient((255, 80, 0), (180, 0, 0))

    def _preset_aurora(self):
        # Turquoise → magenta
        self._gradient((0, 210, 160), (160, 0, 160))

# ---- Compat "legacy": fonction apply(payload) ------------------------------
# Conserve la compat pour l’appel existant leds.apply({...})
_SINGLETON: AuraLEDs | None = None

def _get_singleton() -> AuraLEDs:
    global _SINGLETON
    if _SINGLETON is None:
        _SINGLETON = AuraLEDs(count=DEFAULT_LED_COUNT, pin=DEFAULT_LED_PIN)
    return _SINGLETON

def apply(payload: dict):
    """
    Attend {"leds": {"on"?, "color"?, "brightness"?, "preset"?"}} ou champs à plat.
    """
    dev = _get_singleton()
    p = payload.get("leds", payload)
    if "on" in p:          dev.set_on(bool(p["on"]))
    if "color" in p:       dev.set_color(str(p["color"]))
    if "brightness" in p:  dev.set_brightness(int(p["brightness"]))
    if "preset" in p and p["preset"]:
        dev.set_preset(str(p["preset"]))

# Expose des méthodes directes si le code agent veut les appeler
def set_on(v: bool):         _get_singleton().set_on(v)
def set_color(h: str):       _get_singleton().set_color(h)
def set_brightness(v: int):  _get_singleton().set_brightness(v)
def set_preset(n: Optional[str]): _get_singleton().set_preset(n)
def snapshot() -> dict:      return _get_singleton().snapshot()
