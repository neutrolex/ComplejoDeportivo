import { useState } from 'react'
import { apiFetch } from '../api'
import { FUENTE, TOKENS } from '../theme'

const COLOR_METODO = {
  efectivo: { bg: TOKENS.libreFondo, fg: TOKENS.libreTexto },
  yape: { bg: TOKENS.yapeFondo, fg: TOKENS.yape },
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

  const estiloInput = {
    border: `1px solid ${TOKENS.bordeInput}`, borderRadius: 8, padding: '8px 10px',
    fontFamily: FUENTE, fontSize: 13, background: 'white', color: TOKENS.texto, colorScheme: 'light',
  }
  const estiloBoton = {
    padding: '8px 16px', borderRadius: 8, border: 'none', background: TOKENS.texto,
    color: 'white', fontSize: 13, cursor: 'pointer',
  }

  return (
    <div style={{
      fontFamily: FUENTE, background: TOKENS.tarjeta, border: `1px solid ${TOKENS.borde}`,
      borderRadius: 14, padding: 20, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, color: TOKENS.texto }}>{reserva.cliente_nombre}</h2>
          <p style={{ margin: 0, fontSize: 13, color: TOKENS.textoSuave }}>
            {reserva.fecha} - {reserva.hora_inicio.slice(0, 5)} a {reserva.hora_fin.slice(0, 5)}
          </p>
        </div>
        <button
          onClick={onCerrar}
          style={{ border: 'none', background: 'transparent', color: TOKENS.textoSuave, cursor: 'pointer', fontSize: 13 }}
        >
          Cerrar
        </button>
      </div>
      <p style={{ fontSize: 13, color: TOKENS.textoSuave, margin: '10px 0 16px' }}>
        Tarifa de referencia: S/ {reserva.precio_total} (no es necesariamente lo cobrado)
      </p>

      <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Pagos</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {reserva.pagos.map((p) => (
          <div
            key={p.id}
            style={{
              background: COLOR_METODO[p.metodo].bg, color: COLOR_METODO[p.metodo].fg,
              borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600,
            }}
          >
            S/ {p.monto} - {p.metodo} - {p.tipo}
          </div>
        ))}
      </div>

      <form onSubmit={agregarPago} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          style={{ ...estiloInput, width: 100 }}
        />
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} style={estiloInput}>
          <option value="efectivo">Efectivo</option>
          <option value="yape">Yape</option>
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={estiloInput}>
          <option value="adelanto">Adelanto</option>
          <option value="saldo">Saldo</option>
        </select>
        <button type="submit" style={estiloBoton}>Agregar pago</button>
      </form>
      {error && <p style={{ color: TOKENS.peligro, fontSize: 13 }}>{error}</p>}

      <button
        onClick={cancelarReserva}
        style={{
          marginTop: 16, padding: '8px 16px', borderRadius: 8, border: `1px solid ${TOKENS.peligro}`,
          background: 'white', color: TOKENS.peligro, fontSize: 13, cursor: 'pointer',
        }}
      >
        Cancelar reserva
      </button>
    </div>
  )
}
