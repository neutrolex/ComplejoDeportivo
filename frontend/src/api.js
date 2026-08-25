import { borrarTokens, obtenerAccessToken } from './auth'

const BASE_URL = import.meta.env.VITE_API_URL

// Los errores de DRF con serializers anidados vienen como
// {"horarios": [{}, {"non_field_errors": ["..."]}]}: el primer elemento del
// arreglo es el objeto vacio de una fila valida, y mostrarlo tal cual le
// deja al usuario un "[object Object]". Se baja por arreglos y objetos
// hasta encontrar el primer string real.
function primerMensaje(valor, profundidad = 0) {
  if (typeof valor === 'string') return valor
  if (profundidad >= 5 || valor === null || typeof valor !== 'object') return null
  const items = Array.isArray(valor) ? valor : Object.values(valor)
  for (const item of items) {
    const encontrado = primerMensaje(item, profundidad + 1)
    if (encontrado) return encontrado
  }
  return null
}

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
    const mensaje = cuerpo.detail || primerMensaje(cuerpo) || `Error ${respuesta.status}`
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
