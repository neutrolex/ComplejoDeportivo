import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { formatearFecha, formatearFechaLarga } from '../utils/fecha'
import { Badge } from './ui/badge'
import ReservaDialogo from './ReservaDialogo'

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
  const { yape, efectivo } = montosDeReserva(reserva)
  if (yape === 0 && efectivo === 0) {
    return <Badge variant="pendiente">Pendiente</Badge>
  }
  return (
    <>
      {yape > 0 && <Badge variant="yape">Yape S/{yape.toFixed(2)}</Badge>}
      {efectivo > 0 && <Badge variant="efectivo">Efectivo S/{efectivo.toFixed(2)}</Badge>}
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
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm shadow-sm"
        />
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!cargando && !error && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Hora</th>
                {canchas.map((c) => (
                  <th key={c.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                    Cancha {c.numero}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Campo completo</th>
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
                          className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                        >
                          <span className="font-semibold text-rose-700">{completa.cliente_nombre}</span>
                          <Badge>Campo completo</Badge>
                          <BadgesPago reserva={completa} />
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
                                  className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left"
                                >
                                  <span className="font-semibold text-rose-700">{reserva.cliente_nombre}</span>
                                  <BadgesPago reserva={reserva} />
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
                              className="w-full rounded-lg px-3 py-2 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
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
