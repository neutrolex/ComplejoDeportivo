import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import PanelDisponibilidad from './components/PanelDisponibilidad'
import HorariosPublicos from './components/HorariosPublicos'

function PanelConLogin() {
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
      <BrowserRouter>
        <Routes>
          <Route path="/horarios" element={<HorariosPublicos />} />
          <Route path="/" element={<PanelConLogin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
