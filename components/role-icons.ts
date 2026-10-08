import { Beaker, Eye, PackageOpen, Tag, type LucideIcon } from "lucide-react";

import type { Role } from "@/lib/pipeline/types";

/** One icon per role, the same wherever a role is named. */
export const ROLE_ICONS: Record<Role, LucideIcon> = {
  puller: PackageOpen,
  labeler: Tag,
  aliquoter: Beaker,
  overview: Eye,
};
