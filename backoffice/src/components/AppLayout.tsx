import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { NOME_ESTABELECIMENTO } from '../lib/config'

export function AppLayout() {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-titulo">{NOME_ESTABELECIMENTO}</span>
        <button
          type="button"
          className="app-menu-toggle"
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setMenuAberto((atual) => !atual)}
        >
          ☰
        </button>
        {/* fecha o menu ao clicar em qualquer link (delegação de evento) */}
        <nav className={menuAberto ? 'aberto' : ''} onClick={() => setMenuAberto(false)}>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/produtos">Produtos</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/vendas">Vendas</NavLink>
          <NavLink to="/fiado">Fiado</NavLink>
          <NavLink to="/contas-pagar">Contas a pagar</NavLink>
          <NavLink to="/quebras">Quebras</NavLink>
          <NavLink to="/caixa">Caixa</NavLink>
          <NavLink to="/parametros">Parâmetros</NavLink>
        </nav>
        <button type="button" className="app-sair" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
