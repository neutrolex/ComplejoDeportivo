import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { FUENTE, TOKENS, estiloTarjeta } from '../theme'

const TARJETAS_PERIODO = [
  { clave: 'hoy', titulo: 'Hoy', icono: '📅' },
  { clave: 'ayer', titulo: 'Ayer', icono: '🕓' },
  { clave: 'esta_semana', titulo: 'Esta semana', icono: '📈' },
  { clave: 'este_mes', titulo: 'Este mes', icono: '🗓️' },
]

function TarjetaPeriodo({ titulo, icono, monto, reservas }) {
  return (
    <div style={{ ...estiloTarjeta, flex: 1, minWidth: 170 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: TOKENS.acentoSuave, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
        }}>
          {icono}
        </div>
        <div style={{ fontSize: 13, color: TOKENS.textoSuave, fontWeight: 500 }}>{titulo}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>S/{monto}</div>
      <div style={{ fontSize: 12, color: TOKENS.textoTenue, marginTop: 4 }}>{reservas} reservas</div>
    </div>
  )
}

function TarjetaMetodo({ icono, titulo, monto, color, fondo }) {
  return (
    <div style={{ ...estiloTarjeta, flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: fondo, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
      }}>
        {icono}
      </div>
      <div>
        <div style={{ fontSize: 12, color: TOKENS.textoSuave }}>{titulo}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color }}>S/{monto}</div>
      </div>
    </div>
  )
}

function GraficoIngresosDiarios({ dias }) {
  const puntos = dias.map((d) => ({ fecha: d.fecha, yape: Number(d.yape), efectivo: Number(d.efectivo) }))
  const maxValor = Math.max(1, ...puntos.map((p) => Math.max(p.yape, p.efectivo)))
  const ancho = 900
  const alto = 200
  const margenIzq = 34
  const margenSup = 10
  const anchoUtil = ancho - margenIzq - 10
  const altoUtil = alto - margenSup

  const x = (i) => margenIzq + (i / (puntos.length - 1)) * anchoUtil
  const y = (v) => margenSup + altoUtil - (v / maxValor) * altoUtil

  const lineaYape = puntos.map((p, i) => `${x(i)},${y(p.yape)}`).join(' ')
  const lineaEfectivo = puntos.map((p, i) => `${x(i)},${y(p.efectivo)}`).join(' ')
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValor * f))

  return (
    <div>
      <svg viewBox={`0 0 ${ancho} ${alto + 46}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={margenIzq} y1={y(t)} x2={ancho - 10} y2={y(t)} stroke={TOKENS.bordeSuave} strokeWidth="1" />
            <text x={margenIzq - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={TOKENS.textoTenue}>{t}</text>
          </g>
        ))}
        <polyline points={lineaEfectivo} fill="none" stroke={TOKENS.libreTexto} strokeWidth="2" />
        <polyline points={lineaYape} fill="none" stroke={TOKENS.yape} strokeWidth="2" />
        {puntos.map((p, i) => (
          <text
            key={p.fecha}
            x={x(i)}
            y={alto + 18}
            textAnchor="end"
            fontSize="8"
            fill={TOKENS.textoTenue}
            transform={`rotate(-45 ${x(i)} ${alto + 18})`}
          >
            {p.fecha.slice(8, 10)}/{p.fecha.slice(5, 7)}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <Leyenda color={TOKENS.yape} texto="Yape" />
        <Leyenda color={TOKENS.libreTexto} texto="Efectivo" />
      </div>
    </div>
  )
}

function Leyenda({ color, texto }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TOKENS.textoSuave }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
      {texto}
    </div>
  )
}

function YapeVsEfectivo({ totalYape, totalEfectivo }) {
  const suma = totalYape + totalEfectivo
  if (suma === 0) {
    return <p style={{ color: TOKENS.textoTenue, fontSize: 13 }}>Sin pagos registrados aún.</p>
  }
  const pctYape = Math.round((totalYape / suma) * 100)
  const pctEfectivo = 100 - pctYape
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ width: `${pctYape}%`, background: TOKENS.yape }} />
        <div style={{ width: `${pctEfectivo}%`, background: TOKENS.libreTexto }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Leyenda color={TOKENS.yape} texto="Yape" />
          <span style={{ fontWeight: 600 }}>{pctYape}% (S/{totalYape.toFixed(2)})</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Leyenda color={TOKENS.libreTexto} texto="Efectivo" />
          <span style={{ fontWeight: 600 }}>{pctEfectivo}% (S/{totalEfectivo.toFixed(2)})</span>
        </div>
      </div>
    </div>
  )
}

function IngresosPorCancha({ filas }) {
  const maxMonto = Math.max(1, ...filas.map((f) => Number(f.monto)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {filas.map((f) => (
        <div key={f.cancha} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 96, fontSize: 12, color: TOKENS.textoSuave, flexShrink: 0 }}>{f.cancha}</div>
          <div style={{ flex: 1, background: TOKENS.fondoSuave, borderRadius: 6, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(Number(f.monto) / maxMonto) * 100}%`, minWidth: Number(f.monto) > 0 ? 4 : 0,
                background: TOKENS.acento, height: 18, borderRadius: 6,
              }}
            />
          </div>
          <div style={{ width: 70, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>S/{f.monto}</div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardFinanciero() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const data = await apiFetch('/reservas/dashboard-financiero/')
        if (!vigente) return
        setDatos(data)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargar()
    return () => {
      vigente = false
    }
  }, [])

  return (
    <div style={{ fontFamily: FUENTE }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, color: TOKENS.texto }}>Dashboard financiero</h2>

      {cargando && <p>Cargando...</p>}
      {error && <p style={{ color: TOKENS.peligro }}>{error}</p>}

      {!cargando && !error && datos && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            {TARJETAS_PERIODO.map((t) => (
              <TarjetaPeriodo
                key={t.clave}
                titulo={t.titulo}
                icono={t.icono}
                monto={datos[t.clave].monto}
                reservas={datos[t.clave].reservas}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <TarjetaMetodo
              icono="📱" titulo="Total Yape (30 días)" monto={datos.total_yape_30_dias}
              color={TOKENS.yape} fondo={TOKENS.yapeFondo}
            />
            <TarjetaMetodo
              icono="💵" titulo="Total Efectivo (30 días)" monto={datos.total_efectivo_30_dias}
              color={TOKENS.libreTexto} fondo={TOKENS.libreFondo}
            />
          </div>

          <div style={{ ...estiloTarjeta, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Ingresos diarios (últimos 30 días)</h3>
            <GraficoIngresosDiarios dias={datos.ingresos_diarios_30_dias} />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ ...estiloTarjeta, flex: 1, minWidth: 260 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Yape vs Efectivo</h3>
              <YapeVsEfectivo
                totalYape={Number(datos.total_yape_30_dias)}
                totalEfectivo={Number(datos.total_efectivo_30_dias)}
              />
            </div>
            <div style={{ ...estiloTarjeta, flex: 1, minWidth: 320 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Ingresos por cancha (30 días)</h3>
              <IngresosPorCancha filas={datos.ingresos_por_cancha_30_dias} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
