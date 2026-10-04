import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  const { user } = useAuth()
  return (
    <div className="app-layout">
      <Sidebar user={user} />
      <div className="main-area">
        <Topbar user={user} />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
