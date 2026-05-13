import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-7 w-full rounded-[var(--radius-bl)] border border-bl-line bg-bl-trough px-2.5 font-mono text-xs text-bl-bone transition-colors placeholder:text-bl-bone-4 hover:border-bl-line-2 focus:border-bl-line-3 focus:bg-bl-graphite focus:outline-none focus:[box-shadow:var(--ring-focus)]",
        className
      )}
      ref={ref}
      suppressHydrationWarning
      {...props}
    />
  )
);
Input.displayName = "Input";
