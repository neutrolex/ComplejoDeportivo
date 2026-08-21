import { useState } from 'react'
import { apiFetch } from '../api'

const COLOR_METODO = {
  efectivo: '#cfe0ff',
  yape: '#ffd0d0',
}

export default function ReservaDetalle({ reserva, onCerrar, onActualizar, onCancelada }) {
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [tipo, setTipo] = useState('saldo')
  const [error, setError] = useState('')

  async function agregarPago(evento) {
    evento.preventDefault()
    setError('')
    try {
      const pago = await apiFetch(`/reservas/${reserva.id}/pagos/`, {
        method: 'POST',
        body: JSON.stringify({ monto, metodo, tipo }),
      })
      onActualizar({ ...reserva, pagos: [...reserva.pagos, pago] })
      setMonto('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function cancelarReserva() {
    if (!window.confirm(`¿Cancelar la reserva de ${reserva.cliente_nombre}?`)) return
    setError('')
    try {
      await apiFetch(`/reservas/${reserva.id}/cancelar/`, { method: 'POST' })
      onCancelada(reserva.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ border: '1px solid #333', padding: 16, marginTop: 16 }}>
      <button onClick={onCerrar}>Cerrar</button>
      <h2>{reserva.cliente_nombre}</h2>
      <p>
        {reserva.fecha} - {reserva.hora_inicio.slice(0, 5)} a {reserva.hora_fin.slice(0, 5)}
      </p>
      <p>Tarifa de referencia: S/ {reserva.precio_total} (no es necesariamente lo cobrado)</p>

      <h3>Pagos</h3>
      <ul>
        {reserva.pagos.map((p) => (
          <li key={p.id} style={{ background: COLOR_METODO[p.metodo] }}>
            S/ {p.monto} - {p.metodo} - {p.tipo}
          </li>
        ))}
      </ul>

      <form onSubmit={agregarPago}>
        <input
          type="number"
          step="0.01"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
        />
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="yape">Yape</option>
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="adelanto">Adelanto</option>
          <option value="saldo">Saldo</option>
        </select>
        <button type="submit">Agregar pago</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={cancelarReserva} style={{ marginTop: 12 }}>
        Cancelar reserva
      </button>
    </div>
  )
}
