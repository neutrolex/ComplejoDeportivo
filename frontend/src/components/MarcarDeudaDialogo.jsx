import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

export default function MarcarDeudaDialogo({ abierto, reserva, academia, onCerrar, onRegistrado }) {
  const [monto, setMonto] = useState('0.00')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto) return
    setError('')
    setMonto(reserva ? String(reserva.precio_total) : '0.00')
  }, [abierto, reserva])

  async function guardar() {
    if (!(Number(monto) > 0)) {
      setError('Ingresa un monto mayor a 0.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      const resultado = await apiFetch(`/reservas/${reserva.id}/marcar-deuda/`, {
        method: 'POST',
        body: JSON.stringify({ monto }),
      })
      onRegistrado(resultado)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!reserva || !academia) return null

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar deuda — {academia.nombre}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          {reserva.hora_inicio}–{reserva.hora_fin} · sin pago registrado hoy.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Deuda actual</span>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">S/{Number(academia.deuda_actual).toFixed(2)}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" htmlFor="deuda-monto">
              Debe de hoy (S/)
            </label>
            <Input
              id="deuda-monto" type="number" step="0.01" min="0"
              value={monto} onChange={(e) => setMonto(e.target.value)}
            />
          </div>
        </div>

        {Number(monto) > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Nueva deuda de {academia.nombre}: S/{(Number(academia.deuda_actual) + Number(monto)).toFixed(2)}
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
