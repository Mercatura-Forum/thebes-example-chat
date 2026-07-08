import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from './components/MemphisGate'
import { Layout } from './components/Layout'
import { Salon } from './pages/Salon'
import { Room } from './pages/Room'
import { Members } from './pages/Members'
import { Profile } from './pages/Profile'

// Open-demo shell: salon (rooms + hero) / room feed / members / profile.
export function App() {
  return (
    <MemphisGate appName="Agora" tagline="Sign in to join the salon.">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Salon />} />
          <Route path="/r/:id" element={<Room />} />
          <Route path="/members" element={<Members />} />
          <Route path="/me" element={<Profile />} />
          <Route path="*" element={<Salon />} />
        </Route>
      </Routes>
    </MemphisGate>
  )
}
