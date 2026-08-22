import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { formatearFecha } from '../utils/fecha'
import { FUENTE, TOKENS, estiloTarjeta } from '../theme'
import ReservaDetalle from './ReservaDetalle'
import Observaciones from './Observaciones'
import ResumenPagos from './ResumenPagos'

const estiloEncabezado = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
  color: TOKENS.textoSuave, fontWeight: 600,
}

function celdaEstilo(estado) {
  const paletas = {
    libre: { bg: TOKENS.libreFondo, fg: TOKENS.libreTexto, cursor: 'pointer' },
    ocupado: { bg: TOKENS.ocupadoFondo, fg: TOKENS.ocupadoTexto, cursor: 'pointer' },
    bloqueada: { bg: TOKENS.fondoSuave, fg: TOKENS.textoTenue, cursor: 'default' },
  }
  const p = paletas[estado]
  return {
    background: p.bg, color: p.fg, cursor: p.cursor,
    borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 600,
    textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
}

function calcularHoras(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const horaFinal = 23 // el complejo cierra a medianoche (ver reservas/servicios.py)
  const horas = []
  for (let h = horaInicio; h <= horaFinal; h++) {
    horas.push(h)
  }
  return horas
}

function horaTexto(hora) {
  return `${String(hora).padStart(2, '0')}:00`
}

function preguntarAcademia(academias) {
  if (academias.length === 0) return null
  const opciones = academias.map((a, i) => `${i + 1}. ${a.nombre}`).join('\n')
  const respuesta = window.prompt(
    `¿Es una academia? Escribe el numero de la lista, o dejalo vacio si es un cliente:\n${opciones}`,
  )
  if (!respuesta) return null
  const indice = Number(respuesta) - 1
  return academias[indice] ? academias[indice].id : null
}

export default function PanelDisponibilidad() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null)
  const [academias, setAcademias] = useState([])

  useEffect(() => {
    let vigente = true
    async function cargarDatos() {
      setCargando(true)
      setError('')
      setReservaSeleccionada(null)
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
    return () => {
      vigente = false
    }
  }, [fecha])

  function reservaEnCelda(canchaId, hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find(
      (r) => r.hora_inicio === horaComparar && r.canchas.includes(canchaId),
    )
  }

  async function reservarCelda(canchaId, hora) {
    const cliente = window.prompt('Nombre del cliente para esta hora:')
    if (!cliente) return
    const academiaId = preguntarAcademia(academias)
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'individual',
          canchas: [canchaId],
          academia: academiaId,
        }),
      })
      setReservas((anteriores) => [...anteriores, nueva])
    } catch (err) {
      window.alert(err.message)
    }
  }

  function reservaCompletaEnHora(hora) {
    const horaComparar = `${String(hora).padStart(2, '0')}:00:00`
    return reservas.find((r) => r.modalidad === 'completo' && r.hora_inicio === horaComparar)
  }

  async function reservarCampoCompleto(hora) {
    const cliente = window.prompt('Nombre del cliente (campo completo):')
    if (!cliente) return
    const academiaId = preguntarAcademia(academias)
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'completo',
          canchas: canchas.map((c) => c.id),
          academia: academiaId,
        }),
      })
      setReservas((anteriores) => [...anteriores, nueva])
    } catch (err) {
      window.alert(err.message)
    }
  }

  const horas = calcularHoras(tarifas)

  return (
    <div style={{ fontFamily: FUENTE }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: TOKENS.texto }}>Reservas</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="fecha" style={{ fontSize: 13, color: TOKENS.textoSuave }}>Fecha</label>
          <input
            id="fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={{
              border: `1px solid ${TOKENS.bordeInput}`, borderRadius: 8, padding: '7px 10px',
              fontSize: 13, fontFamily: FUENTE, color: TOKENS.texto, background: 'white', colorScheme: 'light',
            }}
          />
        </div>
      </div>

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: TOKENS.peligro }}>{error}</p>}

      {!cargando && !error && (
        <div style={{ ...estiloTarjeta, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: TOKENS.fondoSuave, borderBottom: `1px solid ${TOKENS.borde}` }}>
                <th style={estiloEncabezado}>Hora</th>
                {canchas.map((c) => (
                  <th key={c.id} style={estiloEncabezado}>Cancha {c.numero}</th>
                ))}
                <th style={estiloEncabezado}>Campo completo</th>
              </tr>
            </thead>
            <tbody>
              {horas.map((hora) => {
                const completa = reservaCompletaEnHora(hora)
                const hayCanchaOcupada = canchas.some((c) => reservaEnCelda(c.id, hora))
                return (
                  <tr key={hora} style={{ borderBottom: `1px solid ${TOKENS.bordeSuave}` }}>
                    <td style={{ padding: '10px 16px', color: TOKENS.textoSuave }}>{horaTexto(hora)}</td>
                    {canchas.map((c) => {
                      const reserva = reservaEnCelda(c.id, hora)
                      return (
                        <td key={c.id} style={{ padding: '6px 8px' }}>
                          <div
                            style={celdaEstilo(reserva ? 'ocupado' : 'libre')}
                            onClick={() => {
                              if (reserva) {
                                setReservaSeleccionada(reserva)
                              } else {
                                reservarCelda(c.id, hora)
                              }
                            }}
                          >
                            {reserva ? reserva.cliente_nombre : 'Libre'}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '6px 8px' }}>
                      <div
                        style={celdaEstilo(completa ? 'ocupado' : hayCanchaOcupada ? 'bloqueada' : 'libre')}
                        onClick={() => {
                          if (completa) {
                            setReservaSeleccionada(completa)
                          } else if (!hayCanchaOcupada) {
                            reservarCampoCompleto(hora)
                          }
                        }}
                      >
                        {completa ? completa.cliente_nombre : hayCanchaOcupada ? '-' : 'Reservar todo'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...estiloTarjeta, marginBottom: 20 }}>
        <Observaciones key={`observaciones-${fecha}`} fecha={fecha} />
      </div>

      <div style={estiloTarjeta}>
        <ResumenPagos key={`resumen-pagos-${fecha}`} fecha={fecha} />
      </div>

      {reservaSeleccionada && (
        <ReservaDetalle
          reserva={reservaSeleccionada}
          onCerrar={() => setReservaSeleccionada(null)}
          onActualizar={(actualizada) => {
            setReservas((anteriores) =>
              anteriores.map((r) => (r.id === actualizada.id ? actualizada : r)),
            )
            setReservaSeleccionada(actualizada)
          }}
          onCancelada={(id) => {
            setReservas((anteriores) => anteriores.filter((r) => r.id !== id))
            setReservaSeleccionada(null)
          }}
        />
      )}
    </div>
  )
}
