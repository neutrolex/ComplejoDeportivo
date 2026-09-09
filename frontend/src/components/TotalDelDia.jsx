import { useEffect, useState } from 'react'
import { AlertTriangle, Calculator } from 'lucide-react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import MarcarDeudaDialogo from './MarcarDeudaDialogo'

function totalPagado(reserva) {
  return reserva.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
}

// Reservas de academia del dia sin ningun pago cargado -- candidatas a
// "no pago hoy, registrar como deuda" en vez de quedar pendientes para
// siempre. Los adelantos ya se identifican solos en su propia tarjeta de
// la grilla y no entran aca.
function reservasSinPagarDeAcademia(reservas) {
  return reservas.filter((r) => (
    r.academia && !r.es_adelanto && r.estado === 'confirmada' && totalPagado(r) === 0
  ))
}

export default function TotalDelDia({ fecha, reservas, academias, version, onDeudaRegistrada }) {
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [calculado, setCalculado] = useState(false)
  const [reservaEnDialogo, setReservaEnDialogo] = useState(null)

  async function calcular() {
    setCargando(true)
    setError('')
    try {
      const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      setTotales(data)
      setCalculado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  // Una vez calculado por primera vez, cualquier accion en la pagina que
  // pueda mover dinero del dia (completar un adelanto, pago de academia,
  // marcar deuda, cancelar) recalcula solo -- no hace falta apretar el
  // boton de nuevo para ver el total al dia.
  useEffect(() => {
    if (!calculado) return
    let vigente = true
    apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      .then((data) => { if (vigente) setTotales(data) })
      .catch(() => {})
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  function alRegistrarDeuda(resultado) {
    onDeudaRegistrada(resultado)
    setReservaEnDialogo(null)
  }

  const pendientes = calculado ? reservasSinPagarDeAcademia(reservas) : []
  const academiaEnDialogo = reservaEnDialogo
    ? academias.find((a) => a.id === reservaEnDialogo.academia.id)
    : null

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex justify-center">
        <Button onClick={calcular} disabled={cargando} className="gap-2">
          <Calculator className="h-4 w-4" />
          {cargando ? 'Calculando...' : 'Calcular total del día'}
        </Button>
      </div>
      {error && <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
      {totales && (
        <div className="mt-4 rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 p-5 text-white">
          <div className="flex justify-between text-sm text-slate-300">
            <span>Total Yape</span>
            <span className="font-semibold text-white">S/{totales.total_yape}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-slate-300">
            <span>Total Efectivo</span>
            <span className="font-semibold text-white">S/{totales.total_efectivo}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-700 pt-3">
            <span className="text-sm font-medium uppercase tracking-wide text-slate-300">Total del día</span>
            <span className="text-2xl font-bold text-emerald-400">S/{totales.total_general}</span>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Academias sin pagar hoy
          </h4>
          <div className="flex flex-col gap-2">
            {pendientes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 dark:border-amber-500 dark:bg-amber-500/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{r.academia.nombre}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{r.hora_inicio}–{r.hora_fin} · S/{r.precio_total}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReservaEnDialogo(r)}>
                  Registrar deuda
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <MarcarDeudaDialogo
        abierto={reservaEnDialogo !== null}
        reserva={reservaEnDialogo}
        academia={academiaEnDialogo}
        onCerrar={() => setReservaEnDialogo(null)}
        onRegistrado={alRegistrarDeuda}
      />
    </div>
  )
}
