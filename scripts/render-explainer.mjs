// Renders the explainer video (docs/explainer) to an MP4 with narration.
//
//   npm run explainer                      # narrate, then render
//   npm run explainer -- speak             # narrate; updates narration.js
//   npm run explainer -- video             # frames + audio -> MP4
//   npm run explainer -- stills 12.5 40    # PNGs of single moments
//
// Needs Playwright with Chromium, ffmpeg, and for `speak` a Python with
// kokoro-onnx (see docs/explainer/README.md). Output goes to
// scratch/explainer/.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const here = join(root, "docs", "explainer");
const build = join(root, "scratch", "explainer");
const voiceDir = join(build, "voice");
const sfxDir = join(build, "sfx");
mkdirSync(voiceDir, { recursive: true });
mkdirSync(sfxDir, { recursive: true });

const WORKERS =
  Number(process.env.WORKERS) || Math.max(1, Math.min(4, cpus().length - 1));

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    // Fall back to a global install (npm i -g playwright).
    const root = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
    }).trim();
    return createRequire(join(root, "noop.js"))("playwright");
  }
}

function serve() {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
  };
  const server = createServer((req, res) => {
    const path = join(
      here,
      decodeURIComponent(new URL(req.url, "http://x").pathname),
    );
    if (
      !path.startsWith(here) ||
      !existsSync(path) ||
      statSync(path).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => {
    console.error("page error:", e.message);
    process.exitCode = 1;
  });
  await page.goto(`http://127.0.0.1:${port}/index.html?render`);
  await page.evaluate(() => window.explainer.ready);
  return page;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "inherit", "inherit"],
      ...opts,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

/** Seconds of audio in a 16-bit PCM WAV file. */
function wavSeconds(file) {
  const buf = readFileSync(file);
  let i = 12;
  let rate = 0;
  let channels = 1;
  while (i < buf.length) {
    const id = buf.toString("ascii", i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(i + 10);
      rate = buf.readUInt32LE(i + 12);
    }
    if (id === "data") return len / (rate * channels * 2);
    i += 8 + len;
  }
  throw new Error(`no audio in ${file}`);
}

function writeWav(file, samples, rate = 48000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2),
  );
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
}

/** The app's own feedback tones (lib/client/feedback.ts), plus key clicks. */
function makeSounds() {
  const rate = 48000;
  const tone = (out, freq, start, dur, wave = "sine", gain = 0.3) => {
    for (let i = 0; i < (dur + 0.03) * rate; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.01) * Math.exp((-5 * t) / dur);
      const ph = 2 * Math.PI * freq * t;
      // A square wave from its first few odd harmonics, so it buzzes without aliasing.
      const v =
        wave === "sine"
          ? Math.sin(ph)
          : [1, 3, 5, 7, 9].reduce((s, k) => s + Math.sin(k * ph) / k, 0) * 0.8;
      const j = Math.round((start + t) * rate);
      if (j < out.length) out[j] += v * env * gain;
    }
  };
  const clip = (seconds, fill) => {
    const out = new Float64Array(Math.round(seconds * rate));
    fill(out);
    return out;
  };
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };
  const click = (gain) => (out) => {
    let lp = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      lp += (noise() - lp) * 0.35;
      out[i] =
        lp * Math.exp(-t / 0.012) * gain +
        Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.03) * gain * 0.8;
    }
  };
  const sounds = {
    ok: clip(0.3, (o) => tone(o, 1320, 0, 0.12, "sine", 0.22)),
    done: clip(0.45, (o) => {
      tone(o, 1320, 0, 0.1, "sine", 0.22);
      tone(o, 1760, 0.12, 0.16, "sine", 0.22);
    }),
    error: clip(0.6, (o) => {
      tone(o, 220, 0, 0.18, "square", 0.13);
      tone(o, 180, 0.22, 0.28, "square", 0.13);
    }),
    key: clip(0.12, click(0.5)),
    tap: clip(0.1, click(0.28)),
    pop: clip(0.15, (o) => {
      for (let i = 0; i < o.length; i++) {
        const t = i / rate;
        o[i] =
          Math.sin(2 * Math.PI * (520 - 1800 * t) * t) *
          Math.exp(-t / 0.035) *
          0.25;
      }
    }),
  };
  for (const [name, samples] of Object.entries(sounds))
    writeWav(join(sfxDir, `${name}.wav`), samples, rate);
}

async function speak(page) {
  const cues = await page.evaluate(() =>
    window.explainer.cues.map(({ id, text }) => ({ id, text })),
  );
  const lines = join(build, "lines.json");
  writeFileSync(lines, JSON.stringify(cues, null, 2));
  const python = process.env.PYTHON || "python3";
  await run(python, [
    "-I",
    join(root, "scripts", "explainer-tts.py"),
    lines,
    voiceDir,
  ]);
  const seconds = {};
  for (const { id } of cues)
    seconds[id] =
      Math.round(wavSeconds(join(voiceDir, `${id}.wav`)) * 1000) / 1000;
  const body = Object.entries(seconds)
    .map(([id, s]) => `  ${JSON.stringify(id)}: ${s},`)
    .join("\n");
  writeFileSync(
    join(here, "narration.js"),
    `// Seconds of narration per beat, written by scripts/render-explainer.mjs\n// after it speaks the script. Without it the page estimates each beat's\n// length from its text.\nwindow.EXPLAINER_NARRATION = {\n${body}\n};\n`,
  );
  console.log(`narrated ${cues.length} lines`);
}

async function stills(browser, port, times) {
  const page = await openPage(browser, port);
  mkdirSync(join(build, "stills"), { recursive: true });
  for (const t of times) {
    await page.evaluate((x) => window.explainer.seek(x), t);
    await page.screenshot({
      path: join(build, "stills", `${String(t).padStart(6, "0")}.png`),
    });
  }
  console.log(`wrote ${times.length} stills to ${join(build, "stills")}`);
}

async function renderSegment(browser, port, from, to, file) {
  const page = await openPage(browser, port);
  const { fps } = await page.evaluate(() => ({ fps: window.explainer.fps }));
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "-framerate",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-tune",
      "animation",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-g",
      String(fps * 2),
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) =>
    ff.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)),
    ),
  );
  for (let f = from; f < to; f++) {
    await page.evaluate((x) => window.explainer.seek(x), f / fps);
    const png = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(png))
      await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - from) % 300 === 0)
      console.log(`  ${file.split("/").pop()}: frame ${f - from}/${to - from}`);
  }
  ff.stdin.end();
  await done;
  await page.close();
}

function srtTime(s) {
  const ms = Math.round(s * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

async function video(browser, port) {
  const page = await openPage(browser, port);
  const { duration, fps, cues, sounds } = await page.evaluate(() => {
    const e = window.explainer;
    return { duration: e.duration, fps: e.fps, cues: e.cues, sounds: e.sounds };
  });
  await page.close();
  const frames = Math.round(duration * fps);
  console.log(`${duration.toFixed(1)} s, ${frames} frames, ${WORKERS} workers`);

  // Audio: every narration line and sound effect at its time.
  makeSounds();
  const inputs = [];
  const filters = [];
  const clips = [
    ...cues
      .filter((c) => existsSync(join(voiceDir, `${c.id}.wav`)))
      .map((c) => ({ file: join(voiceDir, `${c.id}.wav`), t: c.t, gain: 1 })),
    ...sounds.map((s) => ({
      file: join(sfxDir, `${s.kind}.wav`),
      t: s.t,
      gain: 1,
    })),
  ];
  if (clips.length < cues.length)
    console.warn("some narration is missing; run `speak` first");
  clips.forEach((c, i) => {
    inputs.push("-i", c.file);
    const ms = Math.max(0, Math.round(c.t * 1000));
    filters.push(
      `[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1,volume=${c.gain}[a${i}]`,
    );
  });
  filters.push(
    `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:duration=longest,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
  );
  const script = join(build, "mix.txt");
  writeFileSync(script, filters.join(";\n"));
  const audio = join(build, "audio.m4a");
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex_script",
    script,
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    audio,
  ]);

  const srt = cues
    .map((c, i) => {
      const end =
        i + 1 < cues.length
          ? Math.min(cues[i + 1].t - 0.05, c.t + c.text.length * 0.07)
          : c.t + 4;
      return `${i + 1}\n${srtTime(c.t)} --> ${srtTime(end)}\n${c.text}\n`;
    })
    .join("\n");
  writeFileSync(join(build, "aliquot-guide.srt"), srt);

  // Video: split the frames among workers, then join the pieces.
  const per = Math.ceil(frames / WORKERS);
  const parts = [];
  await Promise.all(
    Array.from({ length: WORKERS }, (_, w) => {
      const file = join(build, `part${w}.mp4`);
      parts.push(file);
      return renderSegment(
        browser,
        port,
        w * per,
        Math.min(frames, (w + 1) * per),
        file,
      );
    }),
  );
  const list = join(build, "parts.txt");
  writeFileSync(list, parts.map((f) => `file '${f}'`).join("\n"));
  const out = join(build, "aliquot-guide.mp4");
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-i",
    audio,
    "-i",
    join(build, "aliquot-guide.srt"),
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-map",
    "2:s",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-metadata",
    "title=Aliquot Guide",
    "-movflags",
    "+faststart",
    out,
  ]);
  console.log(`wrote ${out}`);
}

const [mode = "all", ...rest] = process.argv.slice(2);
const { chromium } = await loadPlaywright();
const server = await serve();
const { port } = server.address();
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
try {
  if (mode === "speak" || mode === "all") {
    const page = await openPage(browser, port);
    await speak(page);
    await page.close();
  }
  if (mode === "video" || mode === "all") await video(browser, port);
  if (mode === "stills") await stills(browser, port, rest.map(Number));
} finally {
  await browser.close();
  server.close();
}
