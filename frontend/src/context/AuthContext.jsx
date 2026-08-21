import { createContext, useContext, useState } from 'react'
import { borrarTokens, guardarTokens, haySesionActiva } from '../auth'
import { login as loginApi } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [autenticado, setAutenticado] = useState(haySesionActiva())

  async function iniciarSesion(usuario, password) {
    const tokens = await loginApi(usuario, password)
    guardarTokens(tokens)
    setAutenticado(true)
  }

  function cerrarSesion() {
    borrarTokens()
    setAutenticado(false)
  }

  return (
    <AuthContext.Provider value={{ autenticado, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
