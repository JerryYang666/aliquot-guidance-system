"use client";

import { Camera, Flashlight, Keyboard, ScanLine } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { normalizeLabel } from "@/lib/pipeline/labels";

import { Button, cx } from "../ui";

import { useCameraScanner } from "./use-camera-scanner";
import { useKeyboardScanner } from "./use-keyboard-scanner";

/** A label held in front of the camera decodes many times; one per this window counts. */
const REPEAT_WINDOW_MS = 2_500;

/**
 * Every way a station reads tube labels: the camera (kept running), a USB
 * or Bluetooth scanner that types, and a box to type into. Each label is
 * handed to onLabel normalized and once: repeats of the same label within
 * a few seconds are dropped, except when typed.
 */
export function ScannerPanel({
  onLabel,
  idleText,
  children,
  videoClassName = "aspect-[4/3] max-h-[34dvh] lg:max-h-none",
}: {
  onLabel: (label: string) => void;
  idleText: string;
  /** Rendered between the camera and the typing box, e.g. the last result. */
  children?: ReactNode;
  videoClassName?: string;
}) {
  const onLabelRef = useRef(onLabel);
  useEffect(() => {
    onLabelRef.current = onLabel;
  });
  const last = useRef<{ label: string; at: number } | null>(null);
  const [typed, setTyped] = useState("");

  const accept = useCallback((raw: string, typedByHand = false) => {
    const label = normalizeLabel(raw);
    if (!label) return;
    const now = Date.now();
    if (
      !typedByHand &&
      last.current?.label === label &&
      now - last.current.at < REPEAT_WINDOW_MS
    ) {
      return;
    }
    last.current = { label, at: now };
    onLabelRef.current(label);
  }, []);

  const {
    videoRef,
    state,
    start,
    extras,
    torchOn,
    toggleTorch,
    zoom,
    setZoom,
  } = useCameraScanner(accept);
  useKeyboardScanner(accept);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    accept(typed, true);
    setTyped("");
  };

  const scanning = state === "scanning";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-slate-950">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={cx(
            "w-full object-cover",
            videoClassName,
            !scanning && "opacity-0",
          )}
        />
        {scanning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="aspect-square h-[70%] rounded-xl border-2 border-dashed border-white/70" />
          </div>
        )}
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
            {state === "starting" ? (
              <p>Starting camera…</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  {state === "denied"
                    ? "Camera access was refused. Allow it in the browser's site settings, then try again."
                    : state === "unavailable"
                      ? "No camera found. Type labels below, or use a USB scanner."
                      : state === "error"
                        ? "The camera could not start."
                        : idleText}
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => void start()}
                >
                  <Camera className="size-5" /> Start camera
                </Button>
              </>
            )}
          </div>
        )}
        {scanning && (
          <div className="absolute right-2 bottom-2 flex gap-2">
            {extras.zoom && extras.zoom.max >= 2 && (
              <button
                type="button"
                className="rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white"
                onClick={() => {
                  const max = extras.zoom?.max ?? 1;
                  const next = zoom >= Math.min(3, max) ? 1 : zoom + 1;
                  void setZoom(Math.min(next, max));
                }}
              >
                {zoom}×
              </button>
            )}
            {extras.torch && (
              <button
                type="button"
                aria-label="Torch"
                aria-pressed={torchOn}
                className={cx(
                  "rounded-full p-2",
                  torchOn
                    ? "bg-yellow-300 text-black"
                    : "bg-black/60 text-white",
                )}
                onClick={() => void toggleTorch()}
              >
                <Flashlight className="size-4" />
              </button>
            )}
          </div>
        )}
        {scanning && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
            <ScanLine className="size-3.5" /> Scanning
          </div>
        )}
      </div>

      {children}

      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="typed-label">
          Type a label
        </label>
        <div className="relative flex-1">
          <Keyboard className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="typed-label"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a label, e.g. S0066-1"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-10 w-full rounded-lg bg-white pr-3 pl-9 font-mono ring-1 ring-slate-300"
          />
        </div>
        <Button type="submit" disabled={!typed.trim()}>
          Enter
        </Button>
      </form>
    </div>
  );
}
