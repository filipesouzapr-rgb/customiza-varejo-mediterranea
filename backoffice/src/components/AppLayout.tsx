import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { NOME_ESTABELECIMENTO } from '../lib/config'

export function AppLayout() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-titulo">{NOME_ESTABELECIMENTO}</span>
        <nav>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/produtos">Produtos</NavLink>
          <NavLink to="/fiado">Fiado</NavLink>
        </nav>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
