import { useEffect, useState } from 'react'
import { NOMBRES_DIA, formatearFecha, lunesDeLaSemana, sumarDias } from '../utils/fecha'

const NOMBRE_COMPLEJO = 'Complejo Deportivo la 7'
const WHATSAPP_URL = 'https://wa.me/51981154002'
const WHATSAPP_TEXTO = '+51 981 154 002'

const TOKENS = {
  fondo: '#FAFAFB',
  fondoSuave: '#F7F8FA',
  texto: '#1F2430',
  textoSuave: '#6B7280',
  textoTenue: '#8A8F98',
  borde: '#E4E6EA',
  bordeSuave: '#EEF0F2',
  bordeInput: '#D8DADF',
  acento: '#12946B',
}

const BASE_URL = import.meta.env.VITE_API_URL

async function obtenerDisponibilidadPublica(fecha) {
  const respuesta = await fetch(`${BASE_URL}/publico/disponibilidad/?fecha=${fecha}`)
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}))
    throw new Error(cuerpo.detail || `Error ${respuesta.status}`)
  }
  return respuesta.json()
}

const COLORES = {
  libre: { bg: '#DCF7E3', fg: '#1B7A43' },
  ocupado: { bg: '#FBE0DA', fg: '#B23A17' },
  academia: { bg: '#FBF0CB', fg: '#8A6D14' },
}

function estadoDeLaCelda(celda) {
  if (celda.estado === 'libre') return 'libre'
  return celda.academia ? 'academia' : 'ocupado'
}

function textoDeLaCelda(celda) {
  if (celda.estado === 'libre') return 'Libre'
  return celda.academia || 'Ocupado'
}

function celdaEstilo(estado) {
  return {
    background: COLORES[estado].bg,
    color: COLORES[estado].fg,
    borderRadius: 7,
    padding: '6px 8px',
    fontSize: 11.5,
    fontWeight: 600,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function formatearRangoSemana(lunes) {
  const domingo = sumarDias(lunes, 6)
  return `${lunes.slice(8, 10)}/${lunes.slice(5, 7)} - ${domingo.slice(8, 10)}/${domingo.slice(5, 7)}`
}

const COLUMNAS_GRID = '110px repeat(4, 1fr) 1.3fr'

export default function HorariosPublicos() {
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [disponibilidad, setDisponibilidad] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    async function cargarDisponibilidad() {
      setCargando(true)
      setError('')
      try {
        const data = await obtenerDisponibilidadPublica(fecha)
        if (!vigente) return
        setDisponibilidad(data)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarDisponibilidad()
    return () => {
      vigente = false
    }
  }, [fecha])

  const lunes = lunesDeLaSemana(fecha)
  const diasSemana = NOMBRES_DIA.map((nombre, i) => {
    const fechaDia = sumarDias(lunes, i)
    return { nombre, fecha: fechaDia, dia: Number(fechaDia.slice(8, 10)) }
  })

  return (
    <div style={{
      minHeight: '100vh', width: '100vw', position: 'relative', left: '50%', marginLeft: '-50vw',
      background: TOKENS.fondo, color: TOKENS.texto, textAlign: 'left',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: `1px solid ${TOKENS.borde}` }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{NOMBRE_COMPLEJO}</div>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            height: 40, padding: '0 18px', borderRadius: 9, background: TOKENS.acento,
            color: 'white', fontWeight: 600, fontSize: 13, display: 'flex',
            alignItems: 'center', textDecoration: 'none',
          }}
        >
          Reservar por WhatsApp
        </a>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', color: TOKENS.texto }}>Encontrá tu horario libre al instante</h1>
        <p style={{ fontSize: 14, color: TOKENS.textoSuave, margin: 0 }}>
          Disponibilidad de nuestras 4 canchas, actualizada por el equipo del complejo.
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto 48px', padding: '0 32px' }}>
        <div
          style={{
            background: 'white', border: `1px solid ${TOKENS.borde}`, borderRadius: 16,
            boxShadow: '0 1px 2px rgba(20,20,30,0.04), 0 8px 24px rgba(20,20,30,0.05)',
            padding: '24px 24px 8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button
              onClick={() => setFecha(sumarDias(fecha, -7))}
              aria-label="Semana anterior"
              style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${TOKENS.bordeInput}`, background: 'white', color: TOKENS.texto, fontSize: 15, cursor: 'pointer' }}
            >
              ‹
            </button>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{formatearRangoSemana(lunes)}</div>
            <button
              onClick={() => setFecha(sumarDias(fecha, 7))}
              aria-label="Semana siguiente"
              style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${TOKENS.bordeInput}`, background: 'white', color: TOKENS.texto, fontSize: 15, cursor: 'pointer' }}
            >
              ›
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {diasSemana.map((d) => {
              const seleccionado = d.fecha === fecha
              return (
                <button
                  key={d.fecha}
                  onClick={() => setFecha(d.fecha)}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 3, height: 54, borderRadius: 11,
                    border: `1px solid ${seleccionado ? TOKENS.acento : TOKENS.bordeInput}`,
                    background: seleccionado ? TOKENS.acento : 'white',
                    color: seleccionado ? 'white' : TOKENS.texto,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.75 }}>{d.nombre}</span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{d.dia}</span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            {[['libre', 'Libre'], ['ocupado', 'Ocupado'], ['academia', 'Academia']].map(([clave, texto]) => (
              <div key={clave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORES[clave].fg, display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: TOKENS.textoSuave }}>{texto}</span>
              </div>
            ))}
          </div>

          {cargando && !disponibilidad && <p>Cargando...</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}

          {!error && disponibilidad && (
            <div style={{
              border: `1px solid ${TOKENS.borde}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20,
              opacity: cargando ? 0.55 : 1, transition: 'opacity 0.15s',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS_GRID, background: TOKENS.fondoSuave, padding: '10px 14px', borderBottom: `1px solid ${TOKENS.borde}` }}>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textTransform: 'uppercase' }}>Hora</div>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textAlign: 'center' }}>C1</div>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textAlign: 'center' }}>C2</div>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textAlign: 'center' }}>C3</div>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textAlign: 'center' }}>C4</div>
                <div style={{ fontSize: 11, color: TOKENS.textoSuave, textAlign: 'center' }}>Campo completo</div>
              </div>
              {disponibilidad.horas.map((h) => (
                <div
                  key={h.hora}
                  style={{ display: 'grid', gridTemplateColumns: COLUMNAS_GRID, alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${TOKENS.bordeSuave}` }}
                >
                  <div style={{ fontSize: 12.5 }}>{h.hora}</div>
                  {['1', '2', '3', '4'].map((numero) => {
                    const celda = h.canchas[numero] ?? { estado: 'libre' }
                    return (
                      <div key={numero} style={{ padding: '0 4px' }}>
                        <div style={celdaEstilo(estadoDeLaCelda(celda))}>
                          {textoDeLaCelda(celda)}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ padding: '0 4px' }}>
                    <div style={celdaEstilo(estadoDeLaCelda(h.campo_completo))}>
                      {textoDeLaCelda(h.campo_completo)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '0 32px 40px' }}>
        <p style={{ fontSize: 12, color: TOKENS.textoTenue, margin: '0 0 4px' }}>
          Los horarios los actualiza el personal del complejo — pueden variar.
        </p>
        <p style={{ fontSize: 12, color: TOKENS.textoTenue, margin: 0 }}>WhatsApp: {WHATSAPP_TEXTO}</p>
      </div>
    </div>
  )
}
