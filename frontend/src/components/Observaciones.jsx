import { useEffect, useState } from 'react'
import { apiFetch } from '../api'

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
    <div style={{ marginTop: 16 }}>
      <h3>Observaciones del dia</h3>
      <textarea rows={4} cols={50} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div>
        <button onClick={guardar} disabled={guardando}>
          Guardar
        </button>
        {mensaje && <span style={{ marginLeft: 8 }}>{mensaje}</span>}
      </div>
    </div>
  )
}
