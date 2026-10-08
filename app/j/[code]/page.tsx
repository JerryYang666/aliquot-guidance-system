import type { Metadata } from "next";

import { JoinForm } from "@/components/entry/join-form";
import { normalizeJobCode } from "@/lib/job-code";

export const metadata: Metadata = { title: "Join" };

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <JoinForm code={normalizeJobCode(code)} />
    </main>
  );
}
