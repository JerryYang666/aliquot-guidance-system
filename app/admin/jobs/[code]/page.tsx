import type { Metadata } from "next";

import { JobWatch } from "@/components/admin/job-watch";
import { AdminSignIn } from "@/components/admin/sign-in";
import { normalizeJobCode } from "@/lib/job-code";
import { currentAdmin } from "@/lib/server/admin/session";

export const metadata: Metadata = {
  title: "Watch a job",
  robots: { index: false, follow: false },
};

export default async function AdminJobPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const admin = await currentAdmin();
  return admin ? <JobWatch code={normalizeJobCode(code)} /> : <AdminSignIn />;
}
