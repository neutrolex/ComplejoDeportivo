import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { FUENTE, TOKENS } from '../theme'

export default function Observaciones({ fecha }) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    apiFetch(`/observaciones/${fecha}/`).then((data) => setTexto(data.texto))
  }, [fecha])

  async function guardar() {
    setGuardando(true)
    setMensaje('')
    try {
      await apiFetch(`/observaciones/${fecha}/`, {
        method: 'PUT',
        body: JSON.stringify({ texto }),
      })
      setMensaje('Guardado.')
    } catch (err) {
      setMensaje(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ fontFamily: FUENTE }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Observaciones del dia</h3>
      <textarea
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe observaciones del dia..."
        style={{
          width: '100%', boxSizing: 'border-box', border: `1px solid ${TOKENS.bordeInput}`,
          borderRadius: 8, padding: 10, fontFamily: FUENTE, fontSize: 13, resize: 'vertical',
          background: 'white', color: TOKENS.texto, colorScheme: 'light',
        }}
      />
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={guardar}
          disabled={guardando}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', background: TOKENS.texto,
            color: 'white', fontSize: 13, cursor: guardando ? 'default' : 'pointer',
          }}
        >
          Guardar
        </button>
        {mensaje && <span style={{ fontSize: 13, color: TOKENS.textoSuave }}>{mensaje}</span>}
      </div>
    </div>
  )
}
