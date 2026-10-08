import type { Metadata } from "next";

import { Station } from "@/components/station/station";
import { ToastProvider } from "@/components/toast";
import { normalizeJobCode } from "@/lib/job-code";

export const metadata: Metadata = { title: "Station" };

export default async function StationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <ToastProvider>
      <Station code={normalizeJobCode(code)} />
    </ToastProvider>
  );
}
