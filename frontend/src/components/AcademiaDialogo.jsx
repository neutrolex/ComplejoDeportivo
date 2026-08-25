import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { generarOpcionesHora, NOMBRES_DIA } from '../utils/fecha'
import { PALETA_COLORES } from '../utils/paletaColores'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

const HORAS = generarOpcionesHora()

function horarioVacio() {
  return { dias: [], horaInicio: '18:00', horaFin: '19:00', canchas: [] }
}

function horariosDesdeAcademia(academia) {
  if (!academia) return [horarioVacio()]
  if (academia.horarios.length === 0) return [horarioVacio()]
  return academia.horarios.map((h) => ({
    dias: [h.dia_semana],
    horaInicio: h.hora_inicio.slice(0, 5),
    horaFin: h.hora_fin.slice(0, 5),
    canchas: h.canchas,
  }))
}

export default function AcademiaDialogo({ abierto, academia, canchas, onCerrar, onGuardada }) {
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(PALETA_COLORES[0])
  const [permisoMostrar, setPermisoMostrar] = useState(true)
  const [horarios, setHorarios] = useState([horarioVacio()])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const modoEditar = Boolean(academia)

  useEffect(() => {
    if (!abierto) return
    setError('')
    setNombre(academia?.nombre || '')
    setColor(academia?.color || PALETA_COLORES[0])
    setPermisoMostrar(academia ? academia.permiso_mostrar : true)
    setHorarios(horariosDesdeAcademia(academia))
  }, [abierto, academia])

  function actualizarHorario(indice, cambios) {
    setHorarios((anteriores) => anteriores.map((h, i) => (i === indice ? { ...h, ...cambios } : h)))
  }

  function alternarDia(indice, dia) {
    setHorarios((anteriores) => anteriores.map((h, i) => {
      if (i !== indice) return h
      const yaEsta = h.dias.includes(dia)
      return { ...h, dias: yaEsta ? h.dias.filter((d) => d !== dia) : [...h.dias, dia] }
    }))
  }

  function alternarCancha(indice, canchaId) {
    setHorarios((anteriores) => anteriores.map((h, i) => {
      if (i !== indice) return h
      const yaEsta = h.canchas.includes(canchaId)
      return { ...h, canchas: yaEsta ? h.canchas.filter((c) => c !== canchaId) : [...h.canchas, canchaId] }
    }))
  }

  function marcarCampoCompleto(indice) {
    actualizarHorario(indice, { canchas: canchas.map((c) => c.id) })
  }

  function agregarHorario() {
    setHorarios((anteriores) => [...anteriores, horarioVacio()])
  }

  function quitarHorario(indice) {
    setHorarios((anteriores) => anteriores.filter((_, i) => i !== indice))
  }

  async function guardar() {
    setError('')
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setGuardando(true)
    const body = {
      nombre,
      color,
      permiso_mostrar: permisoMostrar,
      horarios: horarios
        .filter((h) => h.dias.length > 0 && h.canchas.length > 0)
        .map((h) => ({ dias: h.dias, hora_inicio: h.horaInicio, hora_fin: h.horaFin, canchas: h.canchas })),
    }
    try {
      const guardada = modoEditar
        ? await apiFetch(`/academias/${academia.id}/`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/academias/', { method: 'POST', body: JSON.stringify(body) })
      onGuardada(guardada)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEditar ? 'Editar academia' : 'Nueva academia'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="academia-nombre">Nombre</label>
          <Input id="academia-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la academia" />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Color</span>
          <div className="flex flex-wrap gap-2">
            {PALETA_COLORES.map((c) => (
              <button
                key={c} type="button" onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={permisoMostrar} onChange={(e) => setPermisoMostrar(e.target.checked)} />
          Mostrar en la web pública
        </label>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Horarios</span>
            <Button type="button" size="sm" variant="outline" onClick={agregarHorario}>
              <Plus className="h-3.5 w-3.5" /> Agregar horario
            </Button>
          </div>

          {horarios.map((horario, indice) => (
            <div key={indice} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap gap-1">
                {NOMBRES_DIA.map((nombreDia, dia) => (
                  <button
                    key={dia} type="button" onClick={() => alternarDia(indice, dia)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      horario.dias.includes(dia) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {nombreDia}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={horario.horaInicio}
                  onChange={(e) => actualizarHorario(indice, { horaInicio: e.target.value })}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <select
                  value={horario.horaFin}
                  onChange={(e) => actualizarHorario(indice, { horaFin: e.target.value })}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {canchas.map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => alternarCancha(indice, c.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      horario.canchas.includes(c.id) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Cancha {c.numero}
                  </button>
                ))}
                <button
                  type="button" onClick={() => marcarCampoCompleto(indice)}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                >
                  Campo completo
                </button>
              </div>

              {horarios.length > 1 && (
                <button
                  type="button" onClick={() => quitarHorario(indice)}
                  className="flex w-fit items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Quitar este horario
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
