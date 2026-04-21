import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "~/lib/utils"

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-xs border px-2 py-0.5 text-[0.68rem] font-medium tracking-[0.16em] uppercase whitespace-nowrap transition-colors aria-invalid:border-danger [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-paper",
        secondary: "border-rule bg-paper-sunken text-ink",
        accent: "border-accent bg-accent-wash text-accent-ink",
        destructive: "border-danger bg-danger-wash text-danger",
        outline: "border-rule text-ink-soft",
        ghost: "border-transparent text-ink-soft",
        link: "border-transparent text-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
