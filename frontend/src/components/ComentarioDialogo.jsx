import { useState } from 'react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

export default function ComentarioDialogo({ abierto, fecha, onCerrar, onCreado }) {
  const [texto, setTexto] = useState('')
  const [montoYape, setMontoYape] = useState('')
  const [montoEfectivo, setMontoEfectivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!texto.trim()) {
      setError('Escribe un comentario.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      const nuevo = await apiFetch('/comentarios-dia/', {
        method: 'POST',
        body: JSON.stringify({
          fecha, texto, monto_yape: montoYape || '0.00', monto_efectivo: montoEfectivo || '0.00',
        }),
      })
      onCreado(nuevo)
      setTexto('')
      setMontoYape('')
      setMontoEfectivo('')
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar comentario — {fecha}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="comentario-texto">Comentario</label>
          <Textarea
            id="comentario-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribe un comentario..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-violet-700 dark:text-violet-400" htmlFor="comentario-yape">
              📱 Monto Yape (S/)
            </label>
            <Input
              id="comentario-yape" type="number" step="0.01" min="0" placeholder="0.00"
              value={montoYape} onChange={(e) => setMontoYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-emerald-700 dark:text-emerald-400" htmlFor="comentario-efectivo">
              💵 Monto Efectivo (S/)
            </label>
            <Input
              id="comentario-efectivo" type="number" step="0.01" min="0" placeholder="0.00"
              value={montoEfectivo} onChange={(e) => setMontoEfectivo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">El monto es opcional y suma al total del día y al dashboard.</p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
