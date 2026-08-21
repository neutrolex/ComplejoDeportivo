import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

function formatearFecha(fecha) {
  return fecha.toISOString().slice(0, 10)
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
            </tr>
          </thead>
          <tbody>
            {horas.map((hora) => (
              <tr key={hora}>
                <td>{horaTexto(hora)}</td>
                {canchas.map((c) => {
                  const reserva = reservaEnCelda(c.id, hora)
                  return (
                    <td key={c.id} style={{ background: reserva ? '#f8b4b4' : '#b4f8c8' }}>
                      {reserva ? reserva.cliente_nombre : 'Libre'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
