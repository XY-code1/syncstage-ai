"""Generate SyncStage's original, non-song 24-second demo preview.

Requires the local `lameenc` package only to encode this generated PCM as MP3.
The result intentionally uses simple synthesized tones and is not a recording,
cover, sample, or derivative of any official playlist track.
"""
from __future__ import annotations

import math
from pathlib import Path
import lameenc

RATE = 44_100
SECONDS = 24
OUT = Path(__file__).resolve().parents[1] / 'public' / 'audio' / 'demo-preview.mp3'

# An original low-volume ambient pulse: 4-note non-melodic texture with soft
# attack/release. It is shared by demo cards only, never labelled as a song.
def sample_at(t: float) -> float:
    beat = (t * 2.0) % 1.0
    envelope = min(1.0, beat / 0.08, (1.0 - beat) / 0.24)
    pad = sum(math.sin(2 * math.pi * f * t + phase) * gain for f, phase, gain in (
        (110.0, 0.0, 0.25), (164.81, 0.7, 0.12), (220.0, 1.1, 0.08),
    ))
    sparkle = math.sin(2 * math.pi * 659.25 * t) * (0.045 if beat < 0.14 else 0.0)
    return max(-0.78, min(0.78, (pad * 0.35 + sparkle) * (0.45 + 0.55 * envelope)))

pcm = bytearray()
for index in range(RATE * SECONDS):
    value = int(sample_at(index / RATE) * 32767)
    pcm.extend(value.to_bytes(2, 'little', signed=True))

encoder = lameenc.Encoder()
encoder.set_bit_rate(96)
encoder.set_in_sample_rate(RATE)
encoder.set_channels(1)
encoder.set_quality(2)
OUT.write_bytes(encoder.encode(bytes(pcm)) + encoder.flush())
print(OUT)
