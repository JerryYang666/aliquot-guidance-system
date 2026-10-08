import type { Metadata } from "next";

import { AdminHome } from "@/components/admin/admin-home";
import { AdminSignIn } from "@/components/admin/sign-in";
import { currentAdmin } from "@/lib/server/admin/session";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await currentAdmin();
  return admin ? <AdminHome me={admin} /> : <AdminSignIn />;
}
