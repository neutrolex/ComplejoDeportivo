import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from './ui/button'
import { Input } from './ui/input'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { iniciarSesion } = useAuth()

  async function manejarSubmit(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await iniciarSesion(usuario, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <form
        onSubmit={manejarSubmit}
        className="flex w-72 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-1 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">Campos</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">Panel de administración</div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="usuario">Usuario</label>
          <Input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">Contraseña</label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" disabled={enviando} className="mt-1">
          {enviando ? 'Ingresando...' : 'Entrar'}
        </Button>
      </form>
    </div>
  )
}
