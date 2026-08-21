import { borrarTokens, obtenerAccessToken } from './auth'

const BASE_URL = import.meta.env.VITE_API_URL

export async function apiFetch(ruta, opciones = {}) {
  const token = obtenerAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    ...opciones.headers,
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const respuesta = await fetch(`${BASE_URL}${ruta}`, { ...opciones, headers })

  if (respuesta.status === 401) {
    borrarTokens()
    window.location.reload()
    throw new Error('Sesion expirada')
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}))
    const mensaje = cuerpo.detail || Object.values(cuerpo).flat()[0] || `Error ${respuesta.status}`
    throw new Error(mensaje)
  }

  if (respuesta.status === 204) {
    return null
  }
  return respuesta.json()
}

export async function login(usuario, password) {
  const respuesta = await fetch(`${BASE_URL}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password }),
  })
  if (!respuesta.ok) {
    throw new Error('Usuario o contraseña incorrectos')
  }
  return respuesta.json()
}
