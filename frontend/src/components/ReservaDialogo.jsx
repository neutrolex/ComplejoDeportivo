import { useEffect, useState } from 'react'
import { Banknote, Smartphone, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import ConfirmDialogo from './ConfirmDialogo'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

function montoPorMetodo(reserva, metodo) {
  return reserva.pagos
    .filter((p) => p.metodo === metodo)
    .reduce((acc, p) => acc + Number(p.monto), 0)
    .toFixed(2)
}

const OPCIONES_DURACION = [1, 1.5, 2, 2.5, 3]

function etiquetaDuracion(horas) {
  const enteras = Math.floor(horas)
  return horas % 1 === 0.5 ? `${enteras}h 30min` : `${enteras}h`
}

function calcularHoraFin(horaInicio, duracionHoras) {
  const [h, m] = horaInicio.split(':').map(Number)
  const totalMin = (h * 60 + m + duracionHoras * 60) % (24 * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function ReservaDialogo({ contexto, academias, onCerrar, onGuardada, onCancelada }) {
  const [cliente, setCliente] = useState('')
  const [academiaId, setAcademiaId] = useState('')
  const [duracion, setDuracion] = useState(1)
  const [yape, setYape] = useState('0.00')
  const [efectivo, setEfectivo] = useState('0.00')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const modoEditar = contexto?.modo === 'editar'

  useEffect(() => {
    if (!contexto) return
    setError('')
    if (contexto.modo === 'editar') {
      setCliente(contexto.reserva.cliente_nombre)
      setYape(montoPorMetodo(contexto.reserva, 'yape'))
      setEfectivo(montoPorMetodo(contexto.reserva, 'efectivo'))
    } else {
      setCliente('')
      setAcademiaId('')
      setDuracion(1)
      setYape('0.00')
      setEfectivo('0.00')
    }
  }, [contexto])

  if (!contexto) return null

  const total = (Number(yape) || 0) + (Number(efectivo) || 0)

  async function guardar() {
    setError('')
    if (!modoEditar && !cliente.trim()) {
      setError('El nombre del cliente es obligatorio.')
      return
    }
    setGuardando(true)
    try {
      if (modoEditar) {
        const actualizada = await apiFetch(`/reservas/${contexto.reserva.id}/pagos/`, {
          method: 'PATCH',
          body: JSON.stringify({ yape, efectivo }),
        })
        onGuardada(actualizada)
      } else {
        const nueva = await apiFetch('/reservas/', {
          method: 'POST',
          body: JSON.stringify({
            fecha: contexto.fecha,
            hora_inicio: contexto.horaInicio,
            cliente_nombre: cliente,
            modalidad: contexto.modalidad,
            canchas: contexto.canchaIds,
            academia: academiaId || null,
            duracion,
            yape,
            efectivo,
          }),
        })
        onGuardada(nueva)
      }
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    setError('')
    setEliminando(true)
    try {
      await apiFetch(`/reservas/${contexto.reserva.id}/cancelar/`, { method: 'POST' })
      onCancelada(contexto.reserva.id)
      setConfirmandoEliminar(false)
      onCerrar()
    } catch (err) {
      setError(err.message)
      setConfirmandoEliminar(false)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {modoEditar ? 'Editar reserva' : 'Nueva reserva'} — {contexto.horaInicio.slice(0, 5)} · {contexto.etiquetaCancha}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="reserva-cliente">Cliente</label>
          <Input
            id="reserva-cliente"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre del cliente"
            disabled={modoEditar}
          />
        </div>

        {!modoEditar && academias.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="reserva-academia">
              Academia (opcional)
            </label>
            <select
              id="reserva-academia"
              value={academiaId}
              onChange={(e) => setAcademiaId(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm"
            >
              <option value="">Ninguna (cliente casual)</option>
              {academias.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {!modoEditar && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="reserva-duracion">Duración</label>
            <select
              id="reserva-duracion"
              value={duracion}
              onChange={(e) => setDuracion(Number(e.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm"
            >
              {OPCIONES_DURACION.map((horas) => (
                <option key={horas} value={horas}>
                  {etiquetaDuracion(horas)} — hasta las {calcularHoraFin(contexto.horaInicio, horas)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-violet-700" htmlFor="reserva-yape">
              <Smartphone className="h-3.5 w-3.5" /> Yape (S/)
            </label>
            <Input
              id="reserva-yape" type="number" step="0.01" min="0"
              value={yape} onChange={(e) => setYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-emerald-700" htmlFor="reserva-efectivo">
              <Banknote className="h-3.5 w-3.5" /> Efectivo (S/)
            </label>
            <Input
              id="reserva-efectivo" type="number" step="0.01" min="0"
              value={efectivo} onChange={(e) => setEfectivo(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">Si pagó en dos partes, completa ambos campos.</p>

        <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm font-medium">
          <span>Total</span>
          <span>S/{total.toFixed(2)}</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          {modoEditar ? (
            <Button variant="destructive" size="icon" onClick={() => setConfirmandoEliminar(true)} type="button">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : <span />}
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>

      {modoEditar && (
        <ConfirmDialogo
          abierto={confirmandoEliminar}
          titulo="¿Cancelar esta reserva?"
          detalle={`${contexto.reserva.cliente_nombre} — ${contexto.horaInicio.slice(0, 5)} · ${contexto.etiquetaCancha}`}
          confirmando={eliminando}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}
    </Dialog>
  )
}
