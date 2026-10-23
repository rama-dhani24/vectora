import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card/80 file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-primary/10 disabled:bg-muted aria-invalid:border-destructive aria-invalid:ring-destructive/15 dark:bg-input/20 dark:disabled:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/20 shadow-foreground/[0.025] h-11 w-full min-w-0 rounded-xl border px-3 py-2 text-sm shadow-sm transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:ring-4",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
