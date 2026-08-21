import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import ReservaDetalle from './ReservaDetalle'

function formatearFecha(fecha) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export default function PanelDisponibilidad() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null)

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true)
      setError('')
      try {
        const [canchasData, tarifasData, reservasData] = await Promise.all([
          apiFetch('/canchas/'),
          apiFetch('/tarifas/'),
          apiFetch(`/reservas/?fecha=${fecha}`),
        ])
        setCanchas(canchasData)
        setTarifas(tarifasData)
        setReservas(reservasData)
      } catch (err) {
        setError(err.message)
      } finally {
        setCargando(false)
      }
    }
    cargarDatos()
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
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'individual',
          canchas: [canchaId],
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
    try {
      const nueva = await apiFetch('/reservas/', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          hora_inicio: horaTexto(hora),
          cliente_nombre: cliente,
          modalidad: 'completo',
          canchas: canchas.map((c) => c.id),
        }),
      })
      setReservas((anteriores) => [...anteriores, nueva])
    } catch (err) {
      window.alert(err.message)
    }
  }

  const horas = calcularHoras(tarifas)

  return (
    <div>
      <label htmlFor="fecha">Fecha</label>
      <input
        id="fecha"
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
      />

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!cargando && !error && (
        <table border="1" cellPadding="4">
          <thead>
            <tr>
              <th>Hora</th>
              {canchas.map((c) => (
                <th key={c.id}>Cancha {c.numero}</th>
              ))}
              <th>Campo completo</th>
            </tr>
          </thead>
          <tbody>
            {horas.map((hora) => (
              <tr key={hora}>
                <td>{horaTexto(hora)}</td>
                {canchas.map((c) => {
                  const reserva = reservaEnCelda(c.id, hora)
                  return (
                    <td
                      key={c.id}
                      style={{
                        background: reserva ? '#f8b4b4' : '#b4f8c8',
                        cursor: reserva ? 'default' : 'pointer',
                      }}
                      onClick={() => {
                        if (reserva) {
                          setReservaSeleccionada(reserva)
                        } else {
                          reservarCelda(c.id, hora)
                        }
                      }}
                    >
                      {reserva ? reserva.cliente_nombre : 'Libre'}
                    </td>
                  )
                })}
                {(() => {
                  const completa = reservaCompletaEnHora(hora)
                  const hayCanchaOcupada = canchas.some((c) => reservaEnCelda(c.id, hora))
                  return (
                    <td
                      style={{
                        background: completa ? '#f8b4b4' : hayCanchaOcupada ? '#dddddd' : '#b4f8c8',
                        cursor: completa || hayCanchaOcupada ? 'default' : 'pointer',
                      }}
                      onClick={() => {
                        if (completa) {
                          setReservaSeleccionada(completa)
                        } else if (!hayCanchaOcupada) {
                          reservarCampoCompleto(hora)
                        }
                      }}
                    >
                      {completa ? completa.cliente_nombre : hayCanchaOcupada ? '-' : 'Reservar todo'}
                    </td>
                  )
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
