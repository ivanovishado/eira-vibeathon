import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Ajustes } from './pages/Ajustes'
import { BuscarPaciente } from './pages/BuscarPaciente'
import { Expediente } from './pages/Expediente'
import { NuevaConsulta } from './pages/NuevaConsulta'
import { NuevaPaciente } from './pages/NuevaPaciente'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BuscarPaciente />} />
          <Route path="pacientes/nueva" element={<NuevaPaciente />} />
          <Route path="pacientes/:pacienteId" element={<Expediente />} />
          <Route
            path="pacientes/:pacienteId/consultas/nueva"
            element={<NuevaConsulta />}
          />
          <Route path="ajustes" element={<Ajustes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
