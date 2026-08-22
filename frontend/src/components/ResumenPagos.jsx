import { useState } from 'react'
import { apiFetch } from '../api'
import { FUENTE, TOKENS } from '../theme'

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
    <div style={{ fontFamily: FUENTE }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Totales del dia</h3>
      <button
        onClick={verTotales}
        style={{
          padding: '8px 16px', borderRadius: 8, border: `1px solid ${TOKENS.bordeInput}`,
          background: 'white', color: TOKENS.texto, fontSize: 13, cursor: 'pointer',
        }}
      >
        Ver totales del dia
      </button>
      {error && <p style={{ color: TOKENS.peligro }}>{error}</p>}
      {totales && (
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ background: TOKENS.libreFondo, borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ fontSize: 11, color: TOKENS.textoSuave }}>Efectivo</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TOKENS.libreTexto }}>S/ {totales.total_efectivo}</div>
          </div>
          <div style={{ background: TOKENS.yapeFondo, borderRadius: 10, padding: '10px 16px' }}>
            <div style={{ fontSize: 11, color: TOKENS.textoSuave }}>Yape</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TOKENS.yape }}>S/ {totales.total_yape}</div>
          </div>
          <div style={{ background: TOKENS.fondoSuave, borderRadius: 10, padding: '10px 16px', border: `1px solid ${TOKENS.borde}` }}>
            <div style={{ fontSize: 11, color: TOKENS.textoSuave }}>Total general</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TOKENS.texto }}>S/ {totales.total_general}</div>
          </div>
        </div>
      )}
    </div>
  )
}
