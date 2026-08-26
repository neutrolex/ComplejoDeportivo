import { useEffect, useState } from 'react'
import { LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { generarOpcionesHora, NOMBRES_DIA } from '../utils/fecha'
import { PALETA_COLORES } from '../utils/paletaColores'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

const HORAS = generarOpcionesHora()
// El complejo atiende de 08:00 a 00:00 (asi estan cargadas las tarifas); un
// horario de academia que arranque antes de las 08:00 se rechaza al
// guardar porque no hay tarifa que lo cubra, asi que ni se ofrece como
// opcion de inicio.
const HORAS_INICIO = HORAS.filter((h) => h >= '08:00')

function horasFinValidas(horaInicio) {
  // Cualquier hora despues del inicio, mas '00:00' al final representando
  // "hasta medianoche" (fin del dia operativo) -- el mismo caso especial
  // que ya usa el backend.
  return [...HORAS.filter((h) => h > horaInicio), '00:00']
}

function siguienteHora(hora) {
  const indice = HORAS.indexOf(hora)
  if (indice === -1 || indice === HORAS.length - 1) return '00:00'
  return HORAS[indice + 1]
}

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
    setHorarios((anteriores) => anteriores.map((h, i) => {
      if (i !== indice) return h
      const actualizado = { ...h, ...cambios }
      // Si cambia el inicio y el fin que ya estaba elegido queda antes (o
      // igual), se corre el fin a la siguiente media hora para que la
      // combinacion siga siendo valida en vez de quedar rota en pantalla.
      const finSigueValido = actualizado.horaFin === '00:00' || actualizado.horaFin > actualizado.horaInicio
      if (cambios.horaInicio && !finSigueValido) {
        actualizado.horaFin = siguienteHora(actualizado.horaInicio)
      }
      return actualizado
    }))
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
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{modoEditar ? 'Editar academia' : 'Nueva academia'}</DialogTitle>
        </DialogHeader>

        {/* Solo esta seccion (los bloques de horario) crece con el contenido
            y scrollea puertas adentro -- el resto del dialogo (encabezado,
            datos generales y el pie con Guardar) se queda fijo, para que
            agregar horarios nunca tape el boton de guardar. */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-4 pr-1">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="academia-nombre">Nombre</label>
              <Input id="academia-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la academia" />
            </div>

            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Color de identidad</span>
                <div className="flex flex-wrap gap-2">
                  {PALETA_COLORES.map((c) => (
                    <button
                      key={c} type="button" onClick={() => setColor(c)}
                      aria-label={`Elegir color ${c}`}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        color === c
                          ? 'scale-110 ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <label className="ml-auto flex items-center gap-2 self-stretch rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <input
                  type="checkbox" checked={permisoMostrar}
                  onChange={(e) => setPermisoMostrar(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                Mostrar en la web pública
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Horarios fijos</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Turnos que se repiten cada semana. Al guardar, se reflejan en el administrador de campo.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={agregarHorario} className="shrink-0">
                <Plus className="h-3.5 w-3.5" /> Agregar horario
              </Button>
            </div>

            {horarios.map((horario, indice) => (
              <div key={indice} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Horario {indice + 1}
                  </span>
                  {horarios.length > 1 && (
                    <button
                      type="button" onClick={() => quitarHorario(indice)}
                      aria-label="Quitar este horario"
                      className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NOMBRES_DIA.map((nombreDia, dia) => (
                    <button
                      key={dia} type="button" onClick={() => alternarDia(indice, dia)}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                        horario.dias.includes(dia)
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700'
                      }`}
                    >
                      {nombreDia}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Horario</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={horario.horaInicio}
                        onChange={(e) => actualizarHorario(indice, { horaInicio: e.target.value })}
                        className="h-9 w-20 rounded-md border border-slate-200 bg-white px-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {HORAS_INICIO.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span className="text-slate-300 dark:text-slate-600">–</span>
                      <select
                        value={horario.horaFin}
                        onChange={(e) => actualizarHorario(indice, { horaFin: e.target.value })}
                        className="h-9 w-20 rounded-md border border-slate-200 bg-white px-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {horasFinValidas(horario.horaInicio).map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Canchas</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canchas.map((c) => (
                        <button
                          key={c.id} type="button" onClick={() => alternarCancha(indice, c.id)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            horario.canchas.includes(c.id)
                              ? 'bg-emerald-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700'
                          }`}
                        >
                          Cancha {c.numero}
                        </button>
                      ))}
                      <button
                        type="button" onClick={() => marcarCampoCompleto(indice)}
                        className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
                      >
                        <LayoutGrid className="h-3 w-3" /> Campo completo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={guardar} disabled={guardando}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
