import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

// El padding/fondo de pastilla vive en cada variante (no en la base) a
// proposito: cva solo concatena clases sin deduplicar, asi que si la base
// pusiera px-2.5 y una variante quisiera px-0 para sacarle el fondo (como
// yape/efectivo, que son solo texto de color, sin pastilla) las dos clases
// quedarian presentes y cual gana seria un empate fragil segun el orden del
// CSS generado, no algo confiable.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border border-transparent bg-slate-100 px-2.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        yape: 'text-violet-600 dark:text-violet-400',
        efectivo: 'text-emerald-600 dark:text-emerald-400',
        pendiente: 'text-amber-600 dark:text-amber-400',
        ausente: 'text-slate-500 dark:text-slate-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
