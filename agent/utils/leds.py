# utils/leds.py
from __future__ import annotations
import math
import re
from typing import Tuple, Optional

try:
    from rpi_ws281x import Adafruit_NeoPixel, Color
    _HAVE_WS281X = True
except Exception:
    _HAVE_WS281X = False


_HEX = re.compile(r'^#[0-9A-Fa-f]{6}$')

def _hex_to_rgb(hexstr: str) -> Tuple[int, int, int]:
    if not _HEX.match(hexstr or ''):
        raise ValueError(f"Invalid hex color: {hexstr}")
    h = hexstr.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def _apply_brightness(rgb: Tuple[int, int, int], brightness_0_255: int) -> Tuple[int, int, int]:
    # brightness global (like NeoPixel “brightness”): scale each channel linearly
    r, g, b = rgb
    scale = max(0, min(255, brightness_0_255)) / 255.0
    # small gamma-ish curve so low levels aren’t too dark
    def gcurve(c):
        return int(round((c / 255.0) ** 1.6 * 255))
    return (
        int(gcurve(int(r * scale))),
        int(gcurve(int(g * scale))),
        int(gcurve(int(b * scale))),
    )

def _map_brightness_0_100_to_0_255(val: int) -> int:
    v = max(0, min(100, int(val)))
    return int(round(v * 255 / 100))


class _MockStrip:
    """Fallback driver for dev machines."""
    def __init__(self, count: int):
        self.count = count
        self.pixels = [(0, 0, 0)] * count
        self.brightness = 255
        self.is_on = False

    def begin(self): pass
    def setBrightness(self, b: int): self.brightness = b
    def setPixelColor(self, i: int, color):
        # color is a packed int in real lib; simulate tuple here
        if isinstance(color, int):
            # unpack 24-bit GRB used by ws281x; we’ll accept tuple too
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
    Simple wrapper for WS2812B via rpi_ws281x with:
      - on/off
      - hex color #RRGGBB
      - brightness 0..100
      - presets: ocean | fire | aurora
    """
    def __init__(self, count: int, pin: int = 18, freq_hz: int = 800_000, dma: int = 10, invert: bool = False, channel: int = 0):
        self.count = count
        self.color_hex = "#FFFFFF"
        self.on = False
        self.brightness_0_100 = 50

        if _HAVE_WS281X:
            # NeoPixel layout is GRB by default; library packs Color as GRB.
            self._strip = Adafruit_NeoPixel(
                count, pin, freq_hz, dma, invert, 255, channel
            )
            self._strip.begin()
            self._strip.setBrightness(_map_brightness_0_100_to_0_255(self.brightness_0_100))
        else:
            self._strip = _MockStrip(count)

        self.apply()  # initialize LEDs to current state (off)

    # ---- State API ---------------------------------------------------------
    def set_on(self, on: bool):
        self.on = bool(on)
        self.apply()

    def set_color(self, color_hex: str):
        _ = _hex_to_rgb(color_hex)  # validate
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
        # keep "on" true if you call a preset
        self.on = True
        self._strip.show()

    def snapshot(self) -> dict:
        return {
            "on": self.on,
            "color": self.color_hex,
            "brightness": self.brightness_0_100,
            "preset": None,  # set only at command time; optional to persist
        }

    # ---- Internals ---------------------------------------------------------
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
        # Pack as GRB for rpi_ws281x Color()
        if _HAVE_WS281X:
            packed = Color(rgb[1], rgb[0], rgb[2])  # GRB
            for i in range(self._strip.numPixels()):
                self._strip.setPixelColor(i, packed)
        else:
            for i in range(self._strip.numPixels()):
                self._strip.setPixelColor(i, rgb)

    # ---- Simple presets ----------------------------------------------------
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

    def _preset_ocean(self):
        # Deep blue → cyan
        self.set_brightness(self.brightness_0_100)
        self._gradient((0, 40, 120), (0, 180, 170))

    def _preset_fire(self):
        # Warm orange → red
        self.set_brightness(self.brightness_0_100)
        self._gradient((255, 80, 0), (180, 0, 0))

    def _preset_aurora(self):
        # Teal → Magenta (northern lights vibes)
        self.set_brightness(self.brightness_0_100)
        self._gradient((0, 210, 160), (160, 0, 160))
