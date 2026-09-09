import { useEffect, useState } from 'react'
import { Banknote, Smartphone } from 'lucide-react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

export default function PagoAcademiaDialogo({ abierto, fecha, academias, comentario, onCerrar, onCreado, onActualizado }) {
  const [academiaId, setAcademiaId] = useState('')
  const [yape, setYape] = useState('0.00')
  const [efectivo, setEfectivo] = useState('0.00')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const modoEditar = Boolean(comentario)
  const academia = academias?.find((a) => String(a.id) === academiaId)
  const total = (Number(yape) || 0) + (Number(efectivo) || 0)
  const montoOriginal = modoEditar ? Number(comentario.monto_yape) + Number(comentario.monto_efectivo) : 0

  useEffect(() => {
    if (!abierto) return
    setError('')
    setAcademiaId(comentario ? String(comentario.academia.id) : '')
    setYape(comentario ? String(comentario.monto_yape) : '0.00')
    setEfectivo(comentario ? String(comentario.monto_efectivo) : '0.00')
  }, [abierto, comentario])

  function limpiarYcerrar() {
    setAcademiaId('')
    setYape('0.00')
    setEfectivo('0.00')
    setError('')
    onCerrar()
  }

  async function guardar() {
    if (!academiaId) {
      setError('Elige una academia.')
      return
    }
    if (total <= 0) {
      setError('Ingresa un monto mayor a 0.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      if (modoEditar) {
        const actualizado = await apiFetch(`/comentarios-dia/${comentario.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            texto: comentario.texto,
            monto_yape: yape || '0.00',
            monto_efectivo: efectivo || '0.00',
          }),
        })
        onActualizado(actualizado)
      } else {
        const nuevo = await apiFetch('/comentarios-dia/', {
          method: 'POST',
          body: JSON.stringify({
            fecha,
            texto: `Pago de academia — ${academia.nombre}`,
            monto_yape: yape || '0.00',
            monto_efectivo: efectivo || '0.00',
            academia_id: academiaId,
          }),
        })
        onCreado(nuevo)
      }
      limpiarYcerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && limpiarYcerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modoEditar ? 'Editar pago de academia' : 'Pago de academia'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="pago-academia-select">Academia</label>
          <select
            id="pago-academia-select" value={academiaId} onChange={(e) => setAcademiaId(e.target.value)}
            disabled={modoEditar}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Elige una academia...</option>
            {academias?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          {academia && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Deuda actual: S/{Number(academia.deuda_actual).toFixed(2)}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-violet-700 dark:text-violet-400" htmlFor="pago-academia-yape">
              <Smartphone className="h-3.5 w-3.5" /> Yape (S/)
            </label>
            <Input
              id="pago-academia-yape" type="number" step="0.01" min="0"
              value={yape} onChange={(e) => setYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400" htmlFor="pago-academia-efectivo">
              <Banknote className="h-3.5 w-3.5" /> Efectivo (S/)
            </label>
            <Input
              id="pago-academia-efectivo" type="number" step="0.01" min="0"
              value={efectivo} onChange={(e) => setEfectivo(e.target.value)}
            />
          </div>
        </div>

        {academia && total > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Deuda después de este pago: S/{(Number(academia.deuda_actual) - (total - montoOriginal)).toFixed(2)}
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
