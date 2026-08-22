import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { iniciarSesion } = useAuth()

  async function manejarSubmit(evento) {
    evento.preventDefault()
    setError('')
    try {
      await iniciarSesion(usuario, password)
    } catch (err) {
      setError(err.message)
    }
  }

  const estiloInput = {
    border: '1px solid #D8DADF', borderRadius: 8, padding: '8px 10px', fontSize: 13,
    background: 'white', color: '#1F2430', colorScheme: 'light',
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100vw', position: 'relative', left: '50%', marginLeft: '-50vw',
      background: '#FAFAFB', color: '#1F2430', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <form
        onSubmit={manejarSubmit}
        style={{
          background: 'white', border: '1px solid #E4E6EA', borderRadius: 14, padding: 28,
          width: 280, display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <h1 style={{ color: '#1F2430', fontSize: 22, margin: '0 0 8px' }}>Ingresar</h1>
        <div>
          <label htmlFor="usuario" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Usuario</label>
          <input
            id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)}
            style={{ ...estiloInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...estiloInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          type="submit"
          style={{
            padding: '9px 0', borderRadius: 8, border: 'none', background: '#1F2430',
            color: 'white', fontSize: 14, cursor: 'pointer',
          }}
        >
          Entrar
        </button>
      </form>
    </div>
  )
}
