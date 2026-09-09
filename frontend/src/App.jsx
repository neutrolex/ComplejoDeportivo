import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './modules/auth/Login'
import PanelLayout from './components/PanelLayout'
import PanelDisponibilidad from './modules/reservas/PanelDisponibilidad'
import HorariosPublicos from './modules/disponibilidad/HorariosPublicos'
import DashboardFinanciero from './modules/finanzas/DashboardFinanciero'
import Academias from './modules/horarios-fijos/Academias'
import Inventario from './modules/inventario/Inventario'

function PanelConLogin({ children }) {
  const { autenticado } = useAuth()
  return autenticado ? <PanelLayout>{children}</PanelLayout> : <Login />
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/horarios" element={<HorariosPublicos />} />
            <Route path="/dashboard" element={<PanelConLogin key="DashboardFinanciero"><DashboardFinanciero /></PanelConLogin>} />
            <Route path="/horarios-fijos" element={<PanelConLogin key="Academias"><Academias /></PanelConLogin>} />
            <Route path="/inventario" element={<PanelConLogin key="Inventario"><Inventario /></PanelConLogin>} />
            <Route path="/" element={<PanelConLogin key="PanelDisponibilidad"><PanelDisponibilidad /></PanelConLogin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
