import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

function preferenciaInicial() {
  try {
    const guardado = localStorage.getItem('tema')
    if (guardado === 'oscuro' || guardado === 'claro') return guardado
  } catch {
    // localStorage puede no estar disponible (ventana privada, etc.)
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(preferenciaInicial)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'oscuro')
    try {
      localStorage.setItem('tema', tema)
    } catch {
      // si no se puede persistir, el toggle sigue funcionando por la sesión
    }
  }, [tema])

  function alternarTema() {
    setTema((actual) => (actual === 'oscuro' ? 'claro' : 'oscuro'))
  }

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
