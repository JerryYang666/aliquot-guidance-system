# Explainer video

A narrated, animated video (about four minutes) for people new to the
aliquoting team: what the process is, how the screens keep three people in
step, and what each role does at its station. The pictures are drawn from
the app's own screens and words; the narration says what each role's
instructions say (`lib/client/instructions.ts`).

| Scene             | What it shows                                                                 |
| ----------------- | ----------------------------------------------------------------------------- |
| Title             | Aliquot Guide                                                                 |
| The process       | One original tube split into `-1`, `-2`, `-3`, each to slot G6 of its own box |
| A batch           | Up to 100 samples in pull-list order, filling Ship, Keep2 and Keep3           |
| The team          | Puller and Labeler hand to the Aliquoter; the screens stay in sync            |
| Getting started   | QR code or job code, name, batch, role, the instructions, Start               |
| Puller            | Find the tube, hand it over, Space; put returned tubes back, Enter            |
| Labeler           | Find the three labels, stick them on, Space or scan, hand them over           |
| Aliquoter         | Check both IDs, aliquot, scan and place each tube, hand the original back     |
| Behind the scenes | The server, the append-only log, Undo and Skip, Overview                      |
| Recap             | Each role in four lines                                                       |

## Watch the source

Open `index.html` in a browser. It plays in real time without sound: Space
pauses, the arrow keys jump five seconds, `[` and `]` jump between scenes,
and `?t=95` in the URL starts at 95 seconds.

## Render the MP4

```sh
npm run explainer            # narrate, then render
npm run explainer -- speak   # only narrate (after changing what is said)
npm run explainer -- video   # only render (after changing the pictures)
npm run explainer -- stills 12 40.5   # PNGs of single moments, for checking
```

Output goes to `scratch/explainer/` (gitignored): `aliquot-guide.mp4`, its
subtitles as `aliquot-guide.srt` (also inside the MP4), and the narration.

It needs:

- **Playwright with Chromium** (`npx playwright install chromium`, or a
  global `npm i -g playwright`). Set `CHROMIUM` to use another Chromium.
- **ffmpeg** with libx264.
- For narration, **Python 3 with `kokoro-onnx` and `soundfile`**
  (`pip install kokoro-onnx soundfile`) and Kokoro's two model files,
  `kokoro-v1.0.onnx` and `voices-v1.0.bin`, from
  <https://github.com/thewh1teagle/kokoro-onnx/releases> in a folder named by
  `KOKORO_DIR`. Set `PYTHON` if that Python is not `python3`. If Kokoro
  cannot load its bundled espeak-ng, install espeak-ng and set
  `ESPEAK_LIBRARY` and `ESPEAK_DATA` to it. The voice is `af_heart` at 0.95
  speed; `KOKORO_VOICE` and `KOKORO_SPEED` change them.

`WORKERS` sets how many browser pages render frames at once (default: one
less than the number of CPUs, at most four).

## How it works

`explainer.js` draws every frame as a pure function of time, so the renderer
can seek to any frame and get the same picture. Each scene has **beats**,
each with the sentence it says (`say`); a beat lasts as long as its
narration plus a short pause, or its `min` seconds if the animation needs
longer. `narration.js` holds how long each sentence takes to say; `speak`
rewrites it. A scene's `plan` turns beats and words (`cue("hand", "Space")`:
when that word is said) into the times its animation uses, and `sounds`
places the app's own feedback tones (`lib/client/feedback.ts`) and key
clicks.

To change what is said, edit a beat's `say`, run `speak`, then `video`. The
voice reads the respellings in `scripts/explainer-tts.py` (`Aliquoter` as
"Aliquotter") so the role names sound right; the subtitles keep the real
words.
