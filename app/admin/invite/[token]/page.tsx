import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { AddPasskey } from "@/components/admin/add-passkey";
import { Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { findOpenInvite } from "@/lib/server/admin/invites";

export const metadata: Metadata = {
  title: "Add a passkey",
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Whether the link is still open is decided at each visit. Opening the
  // page does not spend it; adding the passkey does.
  await connection();
  const { token } = await params;
  const invite = await findOpenInvite(getDb(), token);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      {invite ? (
        <AddPasskey token={token} expiresAt={invite.expiresAt} />
      ) : (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">This link no longer works</h1>
          <p className="mt-1 text-sm text-slate-600">
            An invite link works once and expires a few minutes after it is
            made. Ask an admin for a new one.
          </p>
          <Link href="/admin" className="mt-4 inline-block text-sm underline">
            Admin sign-in
          </Link>
        </Card>
      )}
    </main>
  );
}
