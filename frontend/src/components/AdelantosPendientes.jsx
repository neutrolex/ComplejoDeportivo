import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { apiFetch } from '../api'
import { formatearFechaLarga } from '../utils/fecha'

function montoPagado(reserva) {
  return reserva.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
}

export default function AdelantosPendientes({ recargar }) {
  const [adelantos, setAdelantos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    apiFetch('/reservas/adelantos-pendientes/')
      .then((data) => { if (vigente) setAdelantos(data) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [recargar])

  if (cargando) return <p className="text-sm text-slate-400 dark:text-slate-500">Cargando adelantos...</p>
  if (adelantos.length === 0) return null

  return (
    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Wallet className="h-3.5 w-3.5" /> Adelantos pendientes
      </h4>
      <div className="flex flex-col gap-2">
        {adelantos.map((r) => {
          const pagado = montoPagado(r)
          const falta = Number(r.precio_total) - pagado
          return (
            <div
              key={r.id}
              className="rounded-lg border-l-4 border-slate-900 bg-slate-50 p-3 dark:border-slate-100 dark:bg-slate-800/60"
            >
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{r.cliente_nombre}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatearFechaLarga(r.fecha)} · {r.hora_inicio.slice(0, 5)}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Adelantó S/{pagado.toFixed(2)} de S/{Number(r.precio_total).toFixed(2)} — falta S/{falta.toFixed(2)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
