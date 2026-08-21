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

  return (
    <form onSubmit={manejarSubmit}>
      <h1>Ingresar</h1>
      <div>
        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Entrar</button>
    </form>
  )
}
