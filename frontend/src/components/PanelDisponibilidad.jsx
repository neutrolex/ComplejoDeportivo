import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { apiFetch } from '../api'
import { formatearFecha, formatearFechaLarga, sumarDias } from '../utils/fecha'
import CalendarioPopover from './CalendarioPopover'
import { Badge } from './ui/badge'
import ComentariosDia from './ComentariosDia'
import ReservaDialogo from './ReservaDialogo'
import TotalDelDia from './TotalDelDia'

function generarBloques(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const bloques = []
  for (let b = horaInicio; b <= 23.5; b += 0.5) bloques.push(b)
  return bloques
}

function horaTexto(bloque) {
  const horas = Math.floor(bloque)
  const minutos = bloque % 1 === 0 ? '00' : '30'
  return `${String(horas).padStart(2, '0')}:${minutos}`
}

function aDecimal(horaStr) {
  const [h, m] = horaStr.split(':').map(Number)
  return h + m / 60
}

// hora_fin='00:00:00' significa 'medianoche = fin del dia operativo'
// (mismo criterio que el backend) -- para calcular cuantos bloques ocupa
// una reserva hay que tratarlo como 24, no como 0.
function finADecimal(horaStr) {
  const valor = aDecimal(horaStr)
  return valor === 0 ? 24 : valor
}

function rangoTexto(reserva) {
  const fin = reserva.hora_fin === '00:00:00' ? '00:00' : reserva.hora_fin.slice(0, 5)
  return `${reserva.hora_inicio.slice(0, 5)}–${fin}`
}

function montosDeReserva(reserva) {
  const suma = (metodo) =>
    reserva.pagos.filter((p) => p.metodo === metodo).reduce((acc, p) => acc + Number(p.monto), 0)
  return { yape: suma('yape'), efectivo: suma('efectivo') }
}

function BadgesPago({ reserva }) {
  // Si no se pago nada, un unico badge "Pendiente". En cuanto hay algun
  // pago, se muestran los DOS montos (aunque uno sea S/0.00) para que
  // quede claro cual metodo falta -- nunca queda un monto oculto.
  const { yape, efectivo } = montosDeReserva(reserva)
  if (yape === 0 && efectivo === 0) {
    return <Badge variant="pendiente">Pendiente</Badge>
  }
  return (
    <>
      <Badge variant="yape">Yape S/{yape.toFixed(2)}</Badge>
      <Badge variant="efectivo">Efectivo S/{efectivo.toFixed(2)}</Badge>
    </>
  )
}

function ContenidoReserva({ reserva, extra }) {
  return (
    <>
      <div className="flex w-full min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-semibold text-rose-700">{reserva.cliente_nombre}</span>
        {extra}
      </div>
      <span className="flex items-center gap-1 text-xs text-rose-500">
        <Clock className="h-3 w-3" />
        {rangoTexto(reserva)}
      </span>
      <div className="flex flex-wrap gap-1">
        <BadgesPago reserva={reserva} />
      </div>
    </>
  )
}

// Arma, por cada columna (cancha o 'completo'), el estado de cada bloque:
// 'inicio' (primer bloque de una reserva, se renderiza con rowSpan),
// 'cubierto' (bloque absorbido por el rowSpan de una reserva que empezo
// antes, no se renderiza ningun <td>), 'bloqueada' (una cancha individual
// tapada por una reserva de campo completo) o 'libre'.
function construirGrilla(bloques, canchas, reservas) {
  const indice = new Map(bloques.map((b, i) => [b, i]))
  const grilla = {}
  canchas.forEach((c) => { grilla[c.id] = bloques.map(() => ({ tipo: 'libre' })) })
  grilla.completo = bloques.map(() => ({ tipo: 'libre' }))

  for (const r of reservas.filter((x) => x.modalidad !== 'completo')) {
    const idxInicio = indice.get(aDecimal(r.hora_inicio))
    if (idxInicio === undefined) continue
    const rowSpan = Math.min(
      Math.round((finADecimal(r.hora_fin) - aDecimal(r.hora_inicio)) / 0.5),
      bloques.length - idxInicio,
    )
    for (const canchaId of r.canchas) {
      for (let i = 0; i < rowSpan; i++) {
        grilla[canchaId][idxInicio + i] = i === 0 ? { tipo: 'inicio', reserva: r, rowSpan } : { tipo: 'cubierto' }
      }
    }
  }

  for (const r of reservas.filter((x) => x.modalidad === 'completo')) {
    const idxInicio = indice.get(aDecimal(r.hora_inicio))
    if (idxInicio === undefined) continue
    const rowSpan = Math.min(
      Math.round((finADecimal(r.hora_fin) - aDecimal(r.hora_inicio)) / 0.5),
      bloques.length - idxInicio,
    )
    for (let i = 0; i < rowSpan; i++) {
      const idx = idxInicio + i
      grilla.completo[idx] = i === 0 ? { tipo: 'inicio', reserva: r, rowSpan } : { tipo: 'cubierto' }
      canchas.forEach((c) => { grilla[c.id][idx] = { tipo: 'bloqueada' } })
    }
  }

  return grilla
}

const ANIMADO = { animation: 'fade-slide-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both' }

export default function PanelDisponibilidad() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [academias, setAcademias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [dialogoContexto, setDialogoContexto] = useState(null)

  useEffect(() => {
    let vigente = true
    async function cargarDatos() {
      setCargando(true)
      setError('')
      setDialogoContexto(null)
      try {
        const [canchasData, tarifasData, reservasData, academiasData] = await Promise.all([
          apiFetch('/canchas/'),
          apiFetch('/tarifas/'),
          apiFetch(`/reservas/?fecha=${fecha}`),
          apiFetch('/academias/'),
        ])
        if (!vigente) return
        setCanchas(canchasData)
        setTarifas(tarifasData)
        setReservas(reservasData)
        setAcademias(academiasData)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarDatos()
    return () => { vigente = false }
  }, [fecha])

  function abrirCrear(bloque, cancha) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(bloque), modalidad: 'individual',
      canchaIds: [cancha.id], etiquetaCancha: `Cancha ${cancha.numero}`,
    })
  }

  function abrirCrearCompleto(bloque) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(bloque), modalidad: 'completo',
      canchaIds: canchas.map((c) => c.id), etiquetaCancha: 'Campo completo',
    })
  }

  function abrirEditar(reserva, etiquetaCancha) {
    setDialogoContexto({ modo: 'editar', reserva, horaInicio: reserva.hora_inicio, etiquetaCancha })
  }

  function onGuardada(reservaGuardada) {
    setReservas((anteriores) => {
      const existe = anteriores.some((r) => r.id === reservaGuardada.id)
      return existe
        ? anteriores.map((r) => (r.id === reservaGuardada.id ? reservaGuardada : r))
        : [...anteriores, reservaGuardada]
    })
  }

  function onCancelada(id) {
    setReservas((anteriores) => anteriores.filter((r) => r.id !== id))
  }

  const bloques = generarBloques(tarifas)
  const grilla = construirGrilla(bloques, canchas, reservas)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between" style={ANIMADO}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reservas</h2>
          <div
            key={fecha}
            className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"
            style={{ animation: 'fade-slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <span aria-hidden="true">📅</span>
            <span>{formatearFechaLarga(fecha)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, -1))}
            aria-label="Día anterior"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <CalendarioPopover fecha={fecha} onSeleccionar={setFecha} />
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, 1))}
            aria-label="Día siguiente"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {error && <p className="text-red-600">{error}</p>}
          {/* Solo se muestra "Cargando..." la primerísima vez (antes de tener
              ninguna cancha todavía). En cambios de fecha posteriores la
              grilla se queda a la vista y solo se atenua -- reemplazarla de
              golpe por "Cargando..." es lo que se sentía brusco. */}
          {!error && cargando && canchas.length === 0 && <p>Cargando...</p>}

          {!error && canchas.length > 0 && (
            <div
              className={`max-h-[68vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity duration-300 ${
                cargando ? 'pointer-events-none opacity-40' : 'opacity-100'
              }`}
              style={{ ...ANIMADO, animationDelay: '60ms' }}
            >
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-16" />
                  {canchas.map((c) => <col key={c.id} />)}
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="sticky top-0 z-10 bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Hora</th>
                    {canchas.map((c) => (
                      <th key={c.id} className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
                        Cancha {c.numero}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase">Campo completo</th>
                  </tr>
                </thead>
                <tbody>
                  {bloques.map((bloque, filaIdx) => {
                    const esMedia = bloque % 1 !== 0
                    const completoInfo = grilla.completo[filaIdx]
                    const filaClase = esMedia ? 'bg-slate-50' : 'bg-white'
                    const horaClase = esMedia ? 'text-xs text-slate-400' : 'text-sm text-slate-500'

                    if (completoInfo.tipo === 'cubierto') {
                      return (
                        <tr key={bloque} className={filaClase}>
                          <td className={`px-4 py-1.5 align-top ${horaClase}`}>{horaTexto(bloque)}</td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={bloque} className={filaClase}>
                        <td className={`px-4 py-1.5 align-top ${horaClase}`}>{horaTexto(bloque)}</td>
                        {completoInfo.tipo === 'inicio' ? (
                          <td colSpan={canchas.length + 1} rowSpan={completoInfo.rowSpan} className="px-2 py-1.5 align-top">
                            <button
                              onClick={() => abrirEditar(completoInfo.reserva, 'Campo completo')}
                              title={completoInfo.reserva.cliente_nombre}
                              className="flex h-full w-full min-w-0 flex-col items-start justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                            >
                              <ContenidoReserva reserva={completoInfo.reserva} extra={<Badge className="shrink-0">Campo completo</Badge>} />
                            </button>
                          </td>
                        ) : (
                          <>
                            {canchas.map((c) => {
                              const info = grilla[c.id][filaIdx]
                              if (info.tipo === 'cubierto') return null
                              if (info.tipo === 'inicio') {
                                return (
                                  <td key={c.id} rowSpan={info.rowSpan} className="px-2 py-1.5 align-top">
                                    <button
                                      onClick={() => abrirEditar(info.reserva, `Cancha ${c.numero}`)}
                                      title={info.reserva.cliente_nombre}
                                      className="flex h-full w-full min-w-0 flex-col items-start justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                                    >
                                      <ContenidoReserva reserva={info.reserva} />
                                    </button>
                                  </td>
                                )
                              }
                              if (info.tipo === 'bloqueada') {
                                return (
                                  <td key={c.id} className="px-2 py-1">
                                    <div className="px-3 py-1.5 text-slate-300">-</div>
                                  </td>
                                )
                              }
                              return (
                                <td key={c.id} className="px-2 py-1">
                                  <button
                                    onClick={() => abrirCrear(bloque, c)}
                                    className="w-full rounded-lg px-3 py-1.5 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                                  >
                                    Libre
                                  </button>
                                </td>
                              )
                            })}
                            <td className="px-2 py-1">
                              {canchas.some((c) => grilla[c.id][filaIdx].tipo !== 'libre') ? (
                                <div className="px-3 py-1.5 text-slate-300">-</div>
                              ) : (
                                <button
                                  onClick={() => abrirCrearCompleto(bloque)}
                                  className="w-full truncate rounded-lg px-3 py-1.5 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  Reservar todo
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div key={`total-wrap-${fecha}`} style={{ ...ANIMADO, animationDelay: '150ms' }}>
            <TotalDelDia key={`total-${fecha}`} fecha={fecha} />
          </div>
        </div>

        <div key={`comentarios-wrap-${fecha}`} className="w-80 shrink-0" style={{ ...ANIMADO, animationDelay: '100ms' }}>
          <ComentariosDia key={`comentarios-${fecha}`} fecha={fecha} />
        </div>
      </div>

      <ReservaDialogo
        contexto={dialogoContexto}
        academias={academias}
        onCerrar={() => setDialogoContexto(null)}
        onGuardada={onGuardada}
        onCancelada={onCancelada}
      />
    </div>
  )
}
