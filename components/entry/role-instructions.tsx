"use client";

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";

import {
  INSTRUCTIONS,
  READ_SECONDS,
  type Language,
} from "@/lib/client/instructions";
import { rememberedLanguage, rememberLanguage } from "@/lib/client/session";
import type { Role } from "@/lib/pipeline/types";

import { Modal } from "../modal";
import { Button } from "../ui";

/**
 * What someone reads on the way into a station, every time: the few steps
 * of their role. Start stays off for the first seconds, so it is read
 * before it is dismissed.
 */
export function RoleInstructions({
  role,
  joining,
  onStart,
  onClose,
}: {
  role: Role;
  joining: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  const [language, setLanguage] = useState<Language>(rememberedLanguage);
  const [secondsLeft, setSecondsLeft] = useState(READ_SECONDS);

  useEffect(() => {
    const id = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const text = INSTRUCTIONS[language];
  const other: Language = language === "en" ? "zh" : "en";
  const { title, steps } = text.roles[role];

  return (
    <Modal
      title={<span lang={text.locale}>{title}</span>}
      onClose={onClose}
      headerAction={
        <button
          type="button"
          lang={INSTRUCTIONS[other].locale}
          onClick={() => {
            setLanguage(other);
            rememberLanguage(other);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
        >
          <Languages className="size-4" /> {INSTRUCTIONS[other].name}
        </button>
      }
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={secondsLeft > 0 || joining}
          onClick={onStart}
        >
          {joining
            ? text.joining
            : secondsLeft > 0
              ? `${text.start} (${secondsLeft})`
              : text.start}
        </Button>
      }
    >
      <div lang={text.locale}>
        <p className="text-sm text-slate-600">{text.intro}</p>
        <ol className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-lg leading-snug">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 font-semibold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
