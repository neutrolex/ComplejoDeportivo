import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 shadow-sm ' +
        'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 ' +
        'disabled:cursor-not-allowed disabled:opacity-50 ' +
        'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
      className,
    )}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
