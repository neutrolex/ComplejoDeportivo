import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Building2, Calendar, Moon, Sun, Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Button } from './ui/button'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icono: BarChart3 },
  { to: '/', label: 'Administración de campo', icono: Calendar },
  { to: '/academias', label: 'Academias', icono: Building2 },
]

export default function PanelLayout({ children }) {
  const location = useLocation()
  const { cerrarSesion } = useAuth()
  const { tema, alternarTema } = useTheme()
  const esOscuro = tema === 'oscuro'

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Campos</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Panel de administración</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Principal
          </div>
          {NAV.map((item) => {
            const activo = location.pathname === item.to
            const Icono = item.icono
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activo
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icono className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-col gap-2 px-5">
          <button
            type="button"
            onClick={alternarTema}
            role="switch"
            aria-checked={esOscuro}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <span className="flex items-center gap-2.5">
              {esOscuro ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Modo {esOscuro ? 'oscuro' : 'claro'}
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                esOscuro ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  esOscuro ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          <Button variant="outline" className="w-full" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto p-7">{children}</main>
    </div>
  )
}
