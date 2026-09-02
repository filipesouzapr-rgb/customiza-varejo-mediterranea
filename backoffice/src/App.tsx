import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { ProdutosPage } from './pages/ProdutosPage'
import { FiadoPage } from './pages/FiadoPage'
import { DashboardPage } from './pages/DashboardPage'
import { useSession } from './lib/useSession'
import './App.css'

function App() {
  const { session, loading } = useSession()

  if (loading) return null

  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/produtos" element={<ProdutosPage />} />
        <Route path="/fiado" element={<FiadoPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
