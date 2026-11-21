import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Ajustes } from './pages/Ajustes'
import { BuscarPaciente } from './pages/BuscarPaciente'
import { Cuenta } from './pages/Cuenta'
import { Expediente } from './pages/Expediente'
import { NuevaConsulta } from './pages/NuevaConsulta'
import { NuevaPaciente } from './pages/NuevaPaciente'
import { RegistroHistorial } from './pages/RegistroHistorial'

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
          <Route
            path="pacientes/:pacienteId/antecedentes/nuevo"
            element={
              <RegistroHistorial key="antecedente" clase="antecedente" />
            }
          />
          <Route
            path="pacientes/:pacienteId/atencion-externa/nuevo"
            element={<RegistroHistorial key="externa" clase="externa" />}
          />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="cuenta" element={<Cuenta />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
