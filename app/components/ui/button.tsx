import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "~/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-colors select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper hover:bg-ink/90 active:bg-ink",
        primary:
          "bg-accent text-paper hover:bg-accent/90 active:bg-accent",
        outline:
          "border border-rule bg-paper-raised text-ink hover:border-ink hover:bg-paper",
        secondary:
          "bg-paper-sunken text-ink hover:bg-rule/50",
        ghost:
          "text-ink-soft underline-offset-[6px] hover:text-ink hover:underline",
        destructive:
          "text-danger underline-offset-[6px] hover:underline",
        link:
          "text-ink underline-offset-[6px] hover:underline",
      },
      size: {
        default: "h-9 rounded-sm px-4",
        xs: "h-6 rounded-xs px-2 text-xs",
        sm: "h-7 rounded-sm px-3 text-[0.8rem]",
        lg: "h-10 rounded-sm px-5",
        icon: "size-9 rounded-sm",
        "icon-xs": "size-6 rounded-xs",
        "icon-sm": "size-7 rounded-xs",
        "icon-lg": "size-10 rounded-sm",
      },
    },
    compoundVariants: [
      {
        variant: ["ghost", "destructive", "link"],
        className: "h-auto px-0 py-1 bg-transparent hover:bg-transparent",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
