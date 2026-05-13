import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-7 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-bl)] border px-3 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border-bl-line-3 bg-bl-bone text-bl-graphite hover:bg-white",
        secondary:
          "border-bl-line-2 bg-transparent text-bl-bone hover:border-bl-line-3 hover:bg-bl-panel",
        ghost: "border-transparent bg-transparent text-bl-bone-2 hover:bg-bl-panel hover:text-bl-bone",
        danger: "border-bl-alarm-deep bg-bl-alarm text-white hover:bg-bl-alarm-deep",
        signal:
          "border-bl-signal-deep bg-bl-signal-deep text-bl-bone shadow-[inset_0_1px_0_rgba(200,255,0,0.22)] hover:border-bl-signal hover:bg-[#9abf33] hover:text-bl-graphite"
      },
      size: {
        default: "h-7 px-3 text-[11px]",
        sm: "h-[22px] px-2 text-[10px]",
        lg: "h-9 px-4 text-xs"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
