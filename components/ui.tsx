import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400",
  secondary:
    "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-200/70 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  xl: "h-16 px-6 text-xl gap-3",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors select-none disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/** A keyboard key hint, e.g. <Kbd>Space</Kbd>. */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cx(
        "rounded border border-current/30 px-1.5 py-0.5 font-sans text-[0.75em] leading-none font-medium opacity-80",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type Tone = "slate" | "amber" | "red" | "green" | "blue";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-200 text-slate-800",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  red: "bg-red-100 text-red-800 ring-1 ring-red-300",
  green: "bg-emerald-100 text-emerald-800",
  blue: "bg-blue-100 text-blue-800",
};

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
      {children}
    </div>
  );
}

/** Text and background classes for destination set n (1-based). */
export function setColor(tube: number): {
  solid: string;
  soft: string;
  text: string;
} {
  switch (tube) {
    case 1:
      return {
        solid: "bg-set-1 text-white",
        soft: "bg-set-1-soft",
        text: "text-set-1",
      };
    case 2:
      return {
        solid: "bg-set-2 text-white",
        soft: "bg-set-2-soft",
        text: "text-set-2",
      };
    case 3:
      return {
        solid: "bg-set-3 text-white",
        soft: "bg-set-3-soft",
        text: "text-set-3",
      };
    default:
      return {
        solid: "bg-slate-700 text-white",
        soft: "bg-slate-100",
        text: "text-slate-700",
      };
  }
}
