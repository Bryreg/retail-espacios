export const meta = {
  name: 'vitrina-retail',
  description: 'Orquestación para features de retail-espacios (vitrinas, contratos, análisis)',
  phases: [
    { title: 'Especificación', detail: 'Spec del dominio retail (spaces, leases, suppliers)' },
    { title: 'Disparo', detail: 'Lanzar agentes especializados en paralelo' },
    { title: 'Conciliación', detail: 'Validar coherencia retail: tarifas, períodos, ocupación' },
    { title: 'Iteración', detail: 'Reajustar si hay conflictos' }
  ]
}

// Pseudocódigo:
// 1. Recibe spec: "Crear vitrina con tarifas de referencia y ocupación por período"
// 2. Dispara 5 agentes:
//    - Frontend: UI del mapa 3D, selector de periodo, panel de contrato
//    - Backend: APIs spaces, leases, suppliers, tarifas
//    - Contador: Validar rentabilidad ($/mes vs tarifa referencia)
//    - Legal: PII, contratos, términos
//    - Analytics: Dashboard de ocupación, rentabilidad por sede
// 3. Conciliador: ¿El mapa pinta lo que dice la BD? ¿Tarifas coherentes?
// 4. Iteración hasta listo
