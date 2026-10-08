import type { Metadata } from "next";

import { LogView } from "@/components/entry/log-view";
import { normalizeJobCode } from "@/lib/job-code";

export const metadata: Metadata = { title: "Activity log" };

export default async function LogPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <LogView code={normalizeJobCode(code)} />;
}
