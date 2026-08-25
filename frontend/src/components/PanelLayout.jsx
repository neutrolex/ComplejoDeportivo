import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Building2, Calendar, Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui/button'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icono: BarChart3 },
  { to: '/', label: 'Administración de campo', icono: Calendar },
  { to: '/academias', label: 'Academias', icono: Building2 },
]

export default function PanelLayout({ children }) {
  const location = useLocation()
  const { cerrarSesion } = useAuth()

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white py-6">
        <div className="mb-8 flex items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Campos</div>
            <div className="text-xs text-slate-400">Panel de administración</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                  activo ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icono className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-5">
          <Button variant="outline" className="w-full" onClick={cerrarSesion}>
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto p-7">{children}</main>
    </div>
  )
}
