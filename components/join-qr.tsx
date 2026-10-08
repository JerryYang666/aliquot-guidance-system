"use client";

import { Copy } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { formatJobCode } from "@/lib/job-code";

import { Modal } from "./modal";
import { Button, cx, Label } from "./ui";

/** A link as a QR code, filling the square it is given. */
export function JoinQr({
  url,
  className = "size-48",
}: {
  url: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [url]);
  if (!svg) return <div className={cx("aspect-square", className)} />;
  // The SVG is generated locally from our own URL.
  return (
    <div
      className={cx("aspect-square", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * What every "QR code to join" button opens: the job's join link as a QR
 * code for a phone camera, with the code to type in instead.
 */
export function JoinQrDialog({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const { origin, host } = window.location;
  const url = `${origin}/j/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Join this job" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <JoinQr url={url} className="w-full max-w-72" />
        <div>
          <Label>Job code</Label>
          <div className="font-mono text-4xl font-bold tracking-widest">
            {formatJobCode(code)}
          </div>
        </div>
        <p className="max-w-sm text-sm text-slate-600">
          Point a phone camera at the QR code, or enter the code at {host}.
          Anyone with the code can join, so share it only with the team.
        </p>
        <Button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true));
          }}
        >
          <Copy className="size-4" />{" "}
          {copied ? "Link copied" : "Copy join link"}
        </Button>
      </div>
    </Modal>
  );
}
