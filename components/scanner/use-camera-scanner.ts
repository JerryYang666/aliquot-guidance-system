"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as ZXingReader from "zxing-wasm/reader";

export type CameraState =
  "idle" | "starting" | "scanning" | "denied" | "unavailable" | "error";

interface TrackExtras {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
}

const FRAME_INTERVAL_MS = 90;
/** Side of the square region decoded, as a share of the frame's short side. */
const CROP = 0.7;
const MAX_DECODE_SIDE = 900;

let modulePromise: Promise<typeof ZXingReader> | null = null;

/** Loads the decoder, with its WebAssembly served from our own origin. */
function loadReader() {
  modulePromise ??= import("zxing-wasm/reader").then(async (mod) => {
    await mod.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path,
      },
      fireImmediately: true,
    });
    return mod;
  });
  return modulePromise;
}

/**
 * Keeps the rear camera running and decodes Data Matrix codes from it
 * continuously; every decoded text goes to onDecode (debouncing is the
 * caller's job). Alternates between a center crop, which is fast and suits a
 * tube held in front of the lens, and the whole frame.
 */
export function useCameraScanner(onDecode: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const decodeRef = useRef(onDecode);
  const [state, setState] = useState<CameraState>("idle");
  const [extras, setExtras] = useState<TrackExtras>({});
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoomState] = useState(1);

  useEffect(() => {
    decodeRef.current = onDecode;
  });

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    stop();
    setState("starting");
    let reader: Awaited<ReturnType<typeof loadReader>>;
    let stream: MediaStream;
    try {
      [reader, stream] = await Promise.all([
        loadReader(),
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        }),
      ]);
    } catch (error) {
      const name = (error as { name?: string })?.name;
      setState(
        name === "NotAllowedError"
          ? "denied"
          : name === "NotFoundError"
            ? "unavailable"
            : "error",
      );
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stop();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    const track = stream.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities &
      TrackExtras;
    setExtras({ torch: caps.torch === true, zoom: caps.zoom });
    if (track) {
      // Continuous autofocus where the browser lets us ask for it.
      track
        .applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        })
        .catch(() => undefined);
    }
    setState("scanning");

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let frame = 0;
    const tick = async () => {
      if (streamRef.current !== stream) return;
      if (ctx && video.readyState >= 2 && video.videoWidth) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const full = frame++ % 4 === 3;
        const side = full ? Math.max(vw, vh) : Math.min(vw, vh) * CROP;
        const sw = full ? vw : side;
        const sh = full ? vh : side;
        const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(sw, sh));
        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        ctx.drawImage(
          video,
          (vw - sw) / 2,
          (vh - sh) / 2,
          sw,
          sh,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        try {
          const results = await reader.readBarcodes(
            ctx.getImageData(0, 0, canvas.width, canvas.height),
            { formats: ["DataMatrix"], tryHarder: true, maxNumberOfSymbols: 1 },
          );
          for (const r of results)
            if (r.isValid && r.text) decodeRef.current(r.text);
        } catch {
          // A frame that fails to decode is just skipped.
        }
      }
      if (streamRef.current === stream)
        timerRef.current = setTimeout(tick, FRAME_INTERVAL_MS);
    };
    void tick();
  }, [stop]);

  // Phones stop the camera when the page is hidden; restart it on return.
  useEffect(() => {
    const onVisible = () => {
      const live = streamRef.current
        ?.getVideoTracks()
        .some((t) => t.readyState === "live");
      if (document.visibilityState === "visible" && streamRef.current && !live)
        void start();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [start, stop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    await track
      .applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      .then(() => setTorchOn(next))
      .catch(() => undefined);
  }, [torchOn]);

  const setZoom = useCallback(async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    await track
      .applyConstraints({
        advanced: [{ zoom: value } as MediaTrackConstraintSet],
      })
      .then(() => setZoomState(value))
      .catch(() => undefined);
  }, []);

  return {
    videoRef,
    state,
    start,
    extras,
    torchOn,
    toggleTorch,
    zoom,
    setZoom,
  };
}
