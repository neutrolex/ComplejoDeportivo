import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import PanelDisponibilidad from './components/PanelDisponibilidad'
import HorariosPublicos from './components/HorariosPublicos'
import DashboardFinanciero from './components/DashboardFinanciero'

function PanelConLogin() {
  const { autenticado, cerrarSesion } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        <Link to="/dashboard">Dashboard financiero</Link>
        <button onClick={cerrarSesion}>Cerrar sesion</button>
      </div>
      <PanelDisponibilidad />
    </div>
  )
}

function DashboardConLogin() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return <DashboardFinanciero />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/horarios" element={<HorariosPublicos />} />
          <Route path="/dashboard" element={<DashboardConLogin />} />
          <Route path="/" element={<PanelConLogin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
