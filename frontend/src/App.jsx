import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import PanelDisponibilidad from './components/PanelDisponibilidad'

function Contenido() {
  const { autenticado, cerrarSesion } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <div>
      <button onClick={cerrarSesion}>Cerrar sesion</button>
      <PanelDisponibilidad />
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
