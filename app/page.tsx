import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { CodeForm } from "@/components/entry/code-form";
import { Card } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Aliquot Guide</h1>
        <p className="mt-2 text-slate-600">
          Guides a puller, a labeler and an aliquoter through a batch together,
          with every screen in sync and every step logged.
        </p>
      </div>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Join a job</h2>
        <p className="mb-4 text-sm text-slate-600">
          Enter the code shown on the screen of whoever created the job.
        </p>
        <CodeForm />
      </Card>
      <Link
        href="/create"
        className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 hover:ring-slate-400"
      >
        <FilePlus2 className="size-8 text-slate-500" />
        <div>
          <div className="text-lg font-semibold">Create a job</div>
          <div className="text-sm text-slate-600">
            Upload an aliquot workbook to start a new job.
          </div>
        </div>
      </Link>
    </main>
  );
}
