import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[#5C1A1A] text-[#F9F6F1]',
        secondary:
          'border-[#D4C5B0] bg-[#F3EDE3] text-[#7A5C4A]',
        destructive:
          'border-transparent bg-[#B71C1C] text-white',
        outline:
          'border-[#D4C5B0] text-[#2C1810]',
        success:
          'border-transparent bg-[#2D6A2D] text-white',
        warning:
          'border-transparent bg-[#8B6914] text-white',
        purple:
          'border-transparent bg-[#6B2D6B] text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
