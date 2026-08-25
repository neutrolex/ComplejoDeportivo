import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import PanelLayout from './components/PanelLayout'
import PanelDisponibilidad from './components/PanelDisponibilidad'
import HorariosPublicos from './components/HorariosPublicos'
import DashboardFinanciero from './components/DashboardFinanciero'
import Academias from './components/Academias'

function PanelConLogin() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <PanelLayout>
      <PanelDisponibilidad />
    </PanelLayout>
  )
}

function DashboardConLogin() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <PanelLayout>
      <DashboardFinanciero />
    </PanelLayout>
  )
}

function AcademiasConLogin() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <PanelLayout>
      <Academias />
    </PanelLayout>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/horarios" element={<HorariosPublicos />} />
          <Route path="/dashboard" element={<DashboardConLogin />} />
          <Route path="/academias" element={<AcademiasConLogin />} />
          <Route path="/" element={<PanelConLogin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
