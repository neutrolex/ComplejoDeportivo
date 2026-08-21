import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'

function Contenido() {
  const { autenticado, cerrarSesion } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <div>
      <button onClick={cerrarSesion}>Cerrar sesion</button>
      <p>Sesion iniciada. El panel de disponibilidad se agrega en la Tarea 13.</p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Contenido />
    </AuthProvider>
  )
}

export default App
