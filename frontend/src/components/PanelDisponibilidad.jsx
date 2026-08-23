import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { apiFetch } from '../api'
import { formatearFecha, formatearFechaLarga, sumarDias } from '../utils/fecha'
import CalendarioPopover from './CalendarioPopover'
import { Badge } from './ui/badge'
import ComentariosDia from './ComentariosDia'
import ReservaDialogo from './ReservaDialogo'
import TotalDelDia from './TotalDelDia'

function calcularHoras(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const horas = []
  for (let h = horaInicio; h <= 23; h++) horas.push(h)
  return horas
}

function horaTexto(hora) {
  return `${String(hora).padStart(2, '0')}:00`
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

  function reservaEnCelda(canchaId, hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.hora_inicio === horaComparar && r.canchas.includes(canchaId))
  }

  function reservaCompletaEnHora(hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.modalidad === 'completo' && r.hora_inicio === horaComparar)
  }

  function abrirCrear(hora, cancha) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(hora), modalidad: 'individual',
      canchaIds: [cancha.id], etiquetaCancha: `Cancha ${cancha.numero}`,
    })
  }

  function abrirCrearCompleto(hora) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(hora), modalidad: 'completo',
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

  const horas = calcularHoras(tarifas)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reservas</h2>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
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
          {cargando && <p>Cargando...</p>}
          {error && <p className="text-red-600">{error}</p>}

          {!cargando && !error && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-16" />
              {canchas.map((c) => <col key={c.id} />)}
              <col />
            </colgroup>
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Hora</th>
                {canchas.map((c) => (
                  <th key={c.id} className="truncate px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                    Cancha {c.numero}
                  </th>
                ))}
                <th className="truncate px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Campo completo</th>
              </tr>
            </thead>
            <tbody>
              {horas.map((hora, i) => {
                const completa = reservaCompletaEnHora(hora)
                const hayCanchaOcupada = canchas.some((c) => reservaEnCelda(c.id, hora))
                return (
                  <tr key={hora} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-2 align-top text-slate-500">{horaTexto(hora)}</td>
                    {completa ? (
                      <td colSpan={canchas.length + 1} className="px-2 py-1.5">
                        <button
                          onClick={() => abrirEditar(completa, 'Campo completo')}
                          title={completa.cliente_nombre}
                          className="flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                        >
                          <div className="flex w-full min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate font-semibold text-rose-700">{completa.cliente_nombre}</span>
                            <Badge className="shrink-0">Campo completo</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <BadgesPago reserva={completa} />
                          </div>
                        </button>
                      </td>
                    ) : (
                      <>
                        {canchas.map((c) => {
                          const reserva = reservaEnCelda(c.id, hora)
                          return (
                            <td key={c.id} className="px-2 py-1.5">
                              {reserva ? (
                                <button
                                  onClick={() => abrirEditar(reserva, `Cancha ${c.numero}`)}
                                  title={reserva.cliente_nombre}
                                  className="flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                                >
                                  <span className="w-full min-w-0 truncate font-semibold text-rose-700">
                                    {reserva.cliente_nombre}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    <BadgesPago reserva={reserva} />
                                  </div>
                                </button>
                              ) : (
                                <button
                                  onClick={() => abrirCrear(hora, c)}
                                  className="w-full rounded-lg px-3 py-2 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  Libre
                                </button>
                              )}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1.5">
                          {hayCanchaOcupada ? (
                            <div className="px-3 py-2 text-slate-300">-</div>
                          ) : (
                            <button
                              onClick={() => abrirCrearCompleto(hora)}
                              className="w-full truncate rounded-lg px-3 py-2 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
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

          <TotalDelDia key={`total-${fecha}`} fecha={fecha} />
        </div>

        <div className="w-80 shrink-0">
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
