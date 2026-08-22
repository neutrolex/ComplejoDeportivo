import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FUENTE, TOKENS } from '../theme'

const NAV = [
  { to: '/', label: 'Reservas', icono: '🗓️' },
  { to: '/dashboard', label: 'Dashboard', icono: '📊' },
]

export default function PanelLayout({ children }) {
  const location = useLocation()
  const { cerrarSesion } = useAuth()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: TOKENS.fondo, color: TOKENS.texto, fontFamily: FUENTE }}>
      <aside style={{
        width: 224, flexShrink: 0, background: TOKENS.tarjeta, borderRight: `1px solid ${TOKENS.borde}`,
        padding: '22px 0', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, background: TOKENS.acento, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16,
          }}>
            ⚽
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Campos</div>
            <div style={{ fontSize: 11, color: TOKENS.textoTenue }}>Panel de administración</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textoTenue, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 12px', marginBottom: 8 }}>
            Principal
          </div>
          {NAV.map((item) => {
            const activo = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 9, textDecoration: 'none', fontSize: 14,
                  background: activo ? TOKENS.acento : 'transparent',
                  color: activo ? 'white' : TOKENS.textoSuave,
                  fontWeight: activo ? 600 : 500,
                  boxShadow: activo ? '0 2px 6px rgba(29,209,227,0.35)' : 'none',
                }}
              >
                <span aria-hidden="true">{item.icono}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '0 20px' }}>
          <button
            onClick={cerrarSesion}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 9, border: `1px solid ${TOKENS.borde}`,
              background: 'white', color: TOKENS.textoSuave, cursor: 'pointer', fontSize: 13,
            }}
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 28, overflowX: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
