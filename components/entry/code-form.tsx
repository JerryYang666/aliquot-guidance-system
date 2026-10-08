"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  formatJobCode,
  isValidJobCode,
  normalizeJobCode,
} from "@/lib/job-code";

import { Button } from "../ui";

/** Enter a job code to go to its join page. */
export function CodeForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const code = normalizeJobCode(value);
  const valid = isValidJobCode(code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) router.push(`/j/${code}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <label htmlFor="job-code" className="sr-only">
        Job code
      </label>
      <input
        id="job-code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => valid && setValue(formatJobCode(code))}
        placeholder="ABCD-EFGH"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="h-14 flex-1 rounded-xl bg-white px-4 text-center font-mono text-2xl tracking-widest uppercase ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
      />
      <Button type="submit" variant="primary" size="xl" disabled={!valid}>
        Join <ArrowRight className="size-5" />
      </Button>
    </form>
  );
}
