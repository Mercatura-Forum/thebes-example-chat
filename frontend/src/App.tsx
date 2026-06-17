import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from '@thebes/sdk'
import { Layout } from './components/Layout'
import { Room } from './pages/Room'
import { Members } from './pages/Members'
import { Profile } from './pages/Profile'

// Separate pages under one shell: room (feed) / members / profile.
export function App() {
  return (
    <MemphisGate appName="Agora" tagline="Sign in to join the room.">
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Room />} />
        <Route path="/members" element={<Members />} />
        <Route path="/me" element={<Profile />} />
        <Route path="*" element={<Room />} />
      </Route>
    </Routes>
    </MemphisGate>
  )
}
