import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-lg border border-surface-highlight bg-abyss px-3 py-2 text-sm text-slate-100 placeholder:text-sm placeholder:text-slate-500 transition-all outline-none resize-none",
        "focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
