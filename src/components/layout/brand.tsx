import { TrendingUp } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
        <TrendingUp className="size-4" aria-hidden />
      </span>
      <span className="text-lg">Vectora</span>
    </Link>
  );
}
