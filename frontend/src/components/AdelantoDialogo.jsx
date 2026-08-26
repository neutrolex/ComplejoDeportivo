import { useState } from 'react'
import { Banknote, Smartphone } from 'lucide-react'
import { apiFetch } from '../api'
import { OPCIONES_DURACION, calcularHoraFin, etiquetaDuracion } from '../utils/duracion'
import { formatearFecha, generarOpcionesHora } from '../utils/fecha'
import { Button } from './ui/button'
import CalendarioPopover from './CalendarioPopover'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

const HORAS = generarOpcionesHora()

export default function AdelantoDialogo({ abierto, canchas, onCerrar, onCreado }) {
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState(() => formatearFecha(new Date()))
  const [horaInicio, setHoraInicio] = useState('10:00')
  const [duracion, setDuracion] = useState(1)
  const [seleccion, setSeleccion] = useState('')
  const [yape, setYape] = useState('0.00')
  const [efectivo, setEfectivo] = useState('0.00')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function limpiarYcerrar() {
    setCliente('')
    setFecha(formatearFecha(new Date()))
    setHoraInicio('10:00')
    setDuracion(1)
    setSeleccion('')
    setYape('0.00')
    setEfectivo('0.00')
    setError('')
    onCerrar()
  }

  async function guardar() {
    if (!cliente.trim()) {
      setError('El nombre del cliente es obligatorio.')
      return
    }
    if (fecha < formatearFecha(new Date())) {
      setError('La fecha debe ser hoy o una fecha futura.')
      return
    }
    if (!seleccion) {
      setError('Elige una cancha o campo completo.')
      return
    }
    setError('')
    setGuardando(true)
    try {
      const esCompleto = seleccion === 'completo'
      const canchaIds = esCompleto ? canchas.map((c) => c.id) : [Number(seleccion)]
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaInicio,
          cliente_nombre: cliente,
          modalidad: esCompleto ? 'completo' : 'individual',
          canchas: canchaIds,
          duracion,
          yape,
          efectivo,
          es_adelanto: true,
        }),
      })
      onCreado(nueva)
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
          <DialogTitle>Agregar adelanto</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="adelanto-cliente">Cliente</label>
          <Input
            id="adelanto-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre del cliente"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha en que juega</span>
          <CalendarioPopover fecha={fecha} onSeleccionar={setFecha} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="adelanto-hora">Hora inicio</label>
            <select
              id="adelanto-hora" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="adelanto-duracion">Duración</label>
            <select
              id="adelanto-duracion" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {OPCIONES_DURACION.map((horas) => (
                <option key={horas} value={horas}>
                  {etiquetaDuracion(horas)} — hasta las {calcularHoraFin(horaInicio, horas)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="adelanto-cancha">Cancha</label>
          <select
            id="adelanto-cancha" value={seleccion} onChange={(e) => setSeleccion(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Elige una cancha...</option>
            {canchas.map((c) => <option key={c.id} value={c.id}>Cancha {c.numero}</option>)}
            <option value="completo">Campo completo</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-violet-700 dark:text-violet-400" htmlFor="adelanto-yape">
              <Smartphone className="h-3.5 w-3.5" /> Yape (S/)
            </label>
            <Input
              id="adelanto-yape" type="number" step="0.01" min="0"
              value={yape} onChange={(e) => setYape(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400" htmlFor="adelanto-efectivo">
              <Banknote className="h-3.5 w-3.5" /> Efectivo (S/)
            </label>
            <Input
              id="adelanto-efectivo" type="number" step="0.01" min="0"
              value={efectivo} onChange={(e) => setEfectivo(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
