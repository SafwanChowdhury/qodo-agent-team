import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#5C1A1A] text-[#F9F6F1] hover:bg-[#4A1515] shadow-sm',
        destructive:
          'bg-[rgba(183,28,28,0.08)] border border-[#B71C1C] text-[#B71C1C] hover:bg-[#B71C1C] hover:text-white',
        outline:
          'border border-[#D4C5B0] bg-white text-[#2C1810] hover:bg-[#F3EDE3] hover:border-[#C4AE98]',
        secondary:
          'bg-[#F3EDE3] text-[#2C1810] hover:bg-[#EDE5D8] border border-[#D4C5B0]',
        ghost:
          'text-[#2C1810] hover:bg-[#F3EDE3]',
        link:
          'text-[#5C1A1A] underline-offset-4 hover:underline',
        success:
          'bg-[rgba(45,106,45,0.08)] border border-[#2D6A2D] text-[#2D6A2D] hover:bg-[#2D6A2D] hover:text-white',
        purple:
          'bg-[rgba(107,45,107,0.08)] border border-[#6B2D6B] text-[#6B2D6B] hover:bg-[#6B2D6B] hover:text-white',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
