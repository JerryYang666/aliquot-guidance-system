import type { Metadata } from "next";

import { CreateJob } from "@/components/entry/create-job";

export const metadata: Metadata = { title: "Create a job" };

export default function CreatePage() {
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <CreateJob />
    </main>
  );
}
