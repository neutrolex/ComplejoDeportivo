import { useState } from 'react'
import { apiFetch } from '../api'

export default function ResumenPagos({ fecha }) {
  const [totales, setTotales] = useState(null)
  const [error, setError] = useState('')

  async function verTotales() {
    setError('')
    try {
      const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      setTotales(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Totales del dia</h3>
      <button onClick={verTotales}>Ver totales del dia</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {totales && (
        <ul>
          <li>Total efectivo: S/ {totales.total_efectivo}</li>
          <li>Total Yape: S/ {totales.total_yape}</li>
          <li>Total general: S/ {totales.total_general}</li>
        </ul>
      )}
    </div>
  )
}
