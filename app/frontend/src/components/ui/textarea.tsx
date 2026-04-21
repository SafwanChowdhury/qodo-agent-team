import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-[#D4C5B0] bg-white px-3 py-2 text-sm text-[#2C1810] shadow-sm',
          'placeholder:text-[#A08570]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5C1A1A] focus-visible:ring-offset-0 focus-visible:border-[#5C1A1A]',
          'disabled:cursor-not-allowed disabled:opacity-50 resize-vertical',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
