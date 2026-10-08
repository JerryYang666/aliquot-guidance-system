"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  passkeyErrorMessage,
  signInWithPasskey,
} from "@/lib/client/admin-passkeys";

import { Button, Card } from "../ui";

/** The admin pages for a browser that is not signed in. */
export function AdminSignIn() {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setWorking(true);
    setError(null);
    try {
      await signInWithPasskey();
      // The page renders again, now with the session cookie.
      router.refresh();
    } catch (e) {
      setError(passkeyErrorMessage(e));
      setWorking(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Admin sign-in</h1>
        <p className="mt-1 mb-5 text-sm text-slate-600">
          Admins see every job. Access is by invitation: an admin sends a link
          that adds a passkey to your device.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={working}
          onClick={() => void signIn()}
        >
          <KeyRound className="size-5" />
          {working ? "Waiting for your passkey…" : "Sign in with a passkey"}
        </Button>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </Card>
      <Link href="/" className="text-center text-sm text-slate-500 underline">
        Back to Aliquot Guide
      </Link>
    </main>
  );
}
