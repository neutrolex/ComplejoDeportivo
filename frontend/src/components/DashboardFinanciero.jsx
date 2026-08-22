import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'
import { formatearFecha } from '../utils/fecha'

const TARJETAS = [
  { clave: 'total_efectivo', titulo: 'Efectivo', color: '#1B7A43', fondo: '#DCF7E3' },
  { clave: 'total_yape', titulo: 'Yape', color: '#5A4FCF', fondo: '#E7E4FB' },
  { clave: 'total_general', titulo: 'Total del dia', color: '#1F2430', fondo: '#F7F8FA', destacada: true },
]

export default function DashboardFinanciero() {
  const hoy = formatearFecha(new Date())
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    async function cargarTotales() {
      setCargando(true)
      setError('')
      try {
        const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${hoy}`)
        if (!vigente) return
        setTotales(data)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarTotales()
    return () => {
      vigente = false
    }
  }, [hoy])

  return (
    <div style={{ minHeight: '100vh', padding: 24, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1F2430', background: '#FAFAFB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ margin: 0, color: '#1F2430' }}>Dashboard financiero</h2>
        <Link to="/" style={{ color: '#12946B' }}>Volver al panel</Link>
      </div>
      <p style={{ color: '#6B7280', marginTop: 4, marginBottom: 24 }}>Hoy, {hoy}</p>

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!cargando && !error && totales && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {TARJETAS.map((t) => (
            <div
              key={t.clave}
              style={{
                background: t.fondo, borderRadius: 14, padding: '20px 24px', minWidth: 180,
                border: t.destacada ? '2px solid #1F2430' : '1px solid transparent',
              }}
            >
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>{t.titulo}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: t.color }}>S/ {totales[t.clave]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
