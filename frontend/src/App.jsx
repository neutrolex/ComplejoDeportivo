import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './components/Login'
import PanelLayout from './components/PanelLayout'
import PanelDisponibilidad from './components/PanelDisponibilidad'
import HorariosPublicos from './components/HorariosPublicos'
import DashboardFinanciero from './components/DashboardFinanciero'
import Academias from './components/Academias'
import Inventario from './components/Inventario'

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

function InventarioConLogin() {
  const { autenticado } = useAuth()

  if (!autenticado) {
    return <Login />
  }

  return (
    <PanelLayout>
      <Inventario />
    </PanelLayout>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/horarios" element={<HorariosPublicos />} />
            <Route path="/dashboard" element={<DashboardConLogin />} />
            <Route path="/horarios-fijos" element={<AcademiasConLogin />} />
            <Route path="/inventario" element={<InventarioConLogin />} />
            <Route path="/" element={<PanelConLogin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
