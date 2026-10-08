"""Speaks the explainer's narration with Kokoro, one WAV per beat.

    python scripts/explainer-tts.py lines.json out_dir

lines.json is a list of {"id", "text"}; scripts/render-explainer.mjs writes
it. Each line is trimmed of leading and trailing silence, so the page can
time its pictures to the words. Settings come from the environment:

    KOKORO_DIR       folder with kokoro-v1.0.onnx and voices-v1.0.bin
    KOKORO_VOICE     voice name (default af_heart)
    KOKORO_SPEED     speaking rate (default 0.95, a little slower than normal)
    ESPEAK_LIBRARY   path to libespeak-ng, if the bundled one does not load
    ESPEAK_DATA      path to espeak-ng-data, with ESPEAK_LIBRARY
"""

import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro


# Spellings that steer the voice to the lab's pronunciation. The subtitles
# keep the real words.
SAY_AS = {
    "Aliquoter": "Aliquotter",  # AL-i-kwot-er, not AL-i-kwoh-ter
    "Labeler": "Labeller",  # LAY-buh-ler, three syllables
}


def respell(text):
    for word, spoken in SAY_AS.items():
        text = re.sub(rf"\b{word}\b", spoken, text)
    return text


def trim(samples, rate, threshold=0.01, pad=0.04):
    loud = np.flatnonzero(np.abs(samples) > threshold)
    if loud.size == 0:
        return samples
    start = max(0, loud[0] - int(pad * rate))
    end = min(samples.size, loud[-1] + int(pad * rate))
    return samples[start:end]


def main():
    lines_path, out_dir = sys.argv[1], sys.argv[2]
    model_dir = os.environ.get("KOKORO_DIR", ".")
    voice = os.environ.get("KOKORO_VOICE", "af_heart")
    speed = float(os.environ.get("KOKORO_SPEED", "0.95"))
    espeak = None
    if os.environ.get("ESPEAK_LIBRARY"):
        espeak = EspeakConfig(
            lib_path=os.environ["ESPEAK_LIBRARY"],
            data_path=os.environ.get("ESPEAK_DATA"),
        )
    kokoro = Kokoro(
        os.path.join(model_dir, "kokoro-v1.0.onnx"),
        os.path.join(model_dir, "voices-v1.0.bin"),
        espeak_config=espeak,
    )
    with open(lines_path) as f:
        lines = json.load(f)
    for line in lines:
        samples, rate = kokoro.create(
            respell(line["text"]), voice=voice, speed=speed, lang="en-us"
        )
        samples = trim(np.asarray(samples, dtype=np.float32), rate)
        sf.write(
            os.path.join(out_dir, f"{line['id']}.wav"),
            samples,
            rate,
            subtype="PCM_16",
        )
        print(f"{line['id']}: {samples.size / rate:.2f} s", flush=True)


if __name__ == "__main__":
    main()
