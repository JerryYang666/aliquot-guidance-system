"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { addPasskey, passkeyErrorMessage } from "@/lib/client/admin-passkeys";

import { Button, Card, Label } from "../ui";

const never = () => () => {};

/** What an open invite link shows: name yourself, then make the passkey. */
export function AddPasskey({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In the reader's own time zone, so only once the browser has the page.
  const expires = useSyncExternalStore(
    never,
    () => new Date(expiresAt).toLocaleTimeString(),
    () => null,
  );

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setWorking(true);
    setError(null);
    try {
      await addPasskey(token, name.trim());
      router.replace("/admin");
    } catch (e) {
      setError(passkeyErrorMessage(e));
      setWorking(false);
    }
  };

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Become an admin</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600">
        This link adds a passkey to this device. With it you can sign in and see
        every job. The link works once
        {expires ? ` and expires at ${expires}` : ""}.
      </p>
      <form onSubmit={(e) => void add(e)} className="flex flex-col gap-4">
        <label htmlFor="admin-name" className="flex flex-col gap-2">
          <Label>Your name</Label>
          <input
            id="admin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            autoComplete="name"
            className="h-12 rounded-lg px-3 text-lg ring-1 ring-slate-300"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={working || !name.trim()}
        >
          <KeyRound className="size-5" />
          {working ? "Waiting for your passkey…" : "Add a passkey"}
        </Button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </Card>
  );
}
