import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-slate-100 text-slate-700',
        yape: 'border-transparent bg-violet-100 text-violet-700',
        efectivo: 'border-transparent bg-emerald-100 text-emerald-700',
        pendiente: 'border-transparent bg-amber-100 text-amber-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
