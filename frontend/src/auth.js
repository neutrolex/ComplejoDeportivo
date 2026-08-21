const CLAVE_ACCESS = 'complejo_access_token'
const CLAVE_REFRESH = 'complejo_refresh_token'

export function guardarTokens({ access, refresh }) {
  localStorage.setItem(CLAVE_ACCESS, access)
  localStorage.setItem(CLAVE_REFRESH, refresh)
}

export function obtenerAccessToken() {
  return localStorage.getItem(CLAVE_ACCESS)
}

export function borrarTokens() {
  localStorage.removeItem(CLAVE_ACCESS)
  localStorage.removeItem(CLAVE_REFRESH)
}

export function haySesionActiva() {
  return Boolean(obtenerAccessToken())
}
