export const TOKENS = {
  fondo: '#F4F6F8',
  tarjeta: '#FFFFFF',
  fondoSuave: '#F7F8FA',
  texto: '#1F2430',
  textoSuave: '#6B7280',
  textoTenue: '#8A8F98',
  borde: '#E4E6EA',
  bordeSuave: '#EEF0F2',
  bordeInput: '#D8DADF',
  acento: '#1DD1E3',
  acentoSuave: '#E3FAFC',
  secundario: '#FF9912',
  secundarioSuave: '#FFF1DC',
  libreFondo: '#DCF7E3',
  libreTexto: '#1B7A43',
  ocupadoFondo: '#FBE0DA',
  ocupadoTexto: '#B23A17',
  yape: '#5A4FCF',
  yapeFondo: '#E7E4FB',
  peligro: '#B23A17',
}

export const FUENTE = 'system-ui, -apple-system, "Segoe UI", sans-serif'

export const estiloTarjeta = {
  background: TOKENS.tarjeta,
  border: `1px solid ${TOKENS.borde}`,
  borderRadius: 14,
  padding: 20,
  boxShadow: '0 1px 2px rgba(20,20,30,0.04)',
}

export function estiloInsignia(color, fondo) {
  return {
    width: 40, height: 40, borderRadius: 10, background: fondo, display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color,
  }
}
