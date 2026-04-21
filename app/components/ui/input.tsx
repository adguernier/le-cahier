import * as React from "react"

import { cn } from "~/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 border-0 border-b border-rule bg-transparent px-0 py-1.5 text-base text-ink transition-colors outline-none placeholder:text-ink-faint focus:border-accent focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
