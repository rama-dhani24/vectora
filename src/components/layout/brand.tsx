import { TrendingUp } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="bg-primary text-primary-foreground shadow-primary/20 flex size-9 items-center justify-center rounded-xl shadow-md">
        <TrendingUp className="size-4" aria-hidden />
      </span>
      <span className="text-[19px] font-bold tracking-[-0.04em]">
        vectora<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
