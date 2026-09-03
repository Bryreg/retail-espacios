export const meta = {
  name: 'vitrina-retail',
  description: 'Orquestación sistemas-maestros para retail-espacios: el Maestro define QUÉ agentes lanzar según el pedido; construcción paralela, conciliación, iteración y verificación',
  whenToUse: 'Features de retail-espacios que crucen varias especialidades (UI 3D, APIs, dinero, roles, analytics). Pasar el pedido vía args: {pedido: "...", outputs: "features/<slug>/outputs"}',
  phases: [
    { title: 'Planificación', detail: 'El Maestro analiza pedido+repo y define el equipo ad-hoc (la librería de agentes es catálogo, no mandato)' },
    { title: 'Construcción', detail: 'El equipo definido por el Maestro trabaja en paralelo, territorios disjuntos' },
    { title: 'Conciliación', detail: 'Cruce estructurado de outputs contra el código real (git diff)' },
    { title: 'Iteración', detail: 'Reajuste de agentes con conflictos bloqueantes (máx 3 rondas)' },
    { title: 'Verificación', detail: 'tsc --noEmit, import backend, checklist de la spec' },
    { title: 'Entrega', detail: 'Síntesis del maestro: equipo elegido, historial, conflictos abiertos' },
  ],
}

// Se corre DESDE la raíz del repo. El framework vive en el submodule.
const AGDIR = 'systems-master/.claude/skills/agentes'
const PEDIDO = (args && args.pedido) || 'Ver features/ y docs/ESTADO.md; el pedido concreto llega por args.pedido'
const OUT = (args && args.outputs) || 'features/vitrinas-3d/outputs'
const SPEC = (args && args.spec) || 'features/vitrinas-3d/spec.md'

const CONTEXTO = [
  'CONTEXTO OBLIGATORIO — leé estos archivos ANTES de trabajar:',
  '1. docs/ESTADO.md — REGLAS DURAS del proyecto (romperlas rompe producción). Leelo COMPLETO: sin migraciones, modelo dual layout↔spaces, códigos SEDE-CODE, el 3D pinta no construye, rutas literales antes de paramétricas, el dinero no viaja al worker.',
  '2. ' + SPEC + ' — la spec de esta feature.',
  '',
  'NO hagas commit ni push — eso lo hace el orquestador humano después de revisar.',
  'Escribí tu entregable COMPLETO (no un resumen) en el archivo de salida indicado. Tu retorno estructurado NO lo ve un humano: es data para el orquestador.',
].join('\n')

const EQUIPO_SCHEMA = {
  type: 'object',
  required: ['analisis', 'equipo'],
  properties: {
    analisis: { type: 'string', description: 'Qué dimensiones tiene el pedido y qué rol cubre cada una' },
    equipo: {
      type: 'array', minItems: 3, maxItems: 6,
      items: {
        type: 'object',
        required: ['id', 'nombre', 'modelo', 'tipo', 'mision'],
        properties: {
          id: { type: 'string', description: 'kebab-case único' },
          nombre: { type: 'string' },
          modelo: { type: 'string', enum: ['sonnet', 'opus', 'haiku'], description: 'sonnet=construir código; opus=validación pesada; haiku=mecánico' },
          tipo: { type: 'string', enum: ['builder', 'auditor'] },
          mision: { type: 'string', description: 'Prompt COMPLETO y autocontenido: rol, tareas verificables, qué explorar primero, guardrails, contenido del entregable' },
          definicion_base: { type: 'string', description: 'Ruta a un agente-*.md de la librería si reutiliza uno, o "nueva"' },
        },
      },
    },
  },
}

const BUILDER_SCHEMA = {
  type: 'object',
  required: ['resumen', 'entregables', 'archivos_tocados', 'endpoints', 'gaps'],
  properties: {
    resumen: { type: 'string' },
    entregables: { type: 'array', items: { type: 'string' } },
    archivos_tocados: { type: 'array', items: { type: 'string' } },
    endpoints: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
}

const CONCILIADOR_SCHEMA = {
  type: 'object',
  required: ['coherente', 'conflicts'],
  properties: {
    coherente: { type: 'boolean' },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'origen', 'destino', 'descripcion', 'severidad'],
        properties: {
          id: { type: 'string' },
          origen: { type: 'string' },
          destino: { type: 'string' },
          descripcion: { type: 'string' },
          severidad: { type: 'string', enum: ['bloqueante', 'advertencia'] },
        },
      },
    },
  },
}

const AJUSTES_SCHEMA = {
  type: 'object',
  required: ['ajustes'],
  properties: {
    ajustes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['agente', 'instrucciones'],
        properties: { agente: { type: 'string' }, instrucciones: { type: 'string' } },
      },
    },
  },
}

phase('Planificación')
log('Maestro analizando el problema y armando el equipo...')
const plan = await agent(
  'Sos el MAESTRO ORCHESTRATOR (Fable) de sistemas-maestros. Leé tu definición en ' + AGDIR + '/maestro-fable.md.\n\n' +
  'PEDIDO DEL USUARIO: "' + PEDIDO + '"\n\n' +
  'Tu primera tarea es DEFINIR EL EQUIPO: qué agentes hacen falta para ESTE problema en concreto. No hay roster fijo — el equipo sale del análisis del pedido, no de una plantilla.\n' +
  'Para decidir con fundamento: (1) leé ' + SPEC + ' y docs/ESTADO.md completos; (2) explorá la estructura real del repo (frontend/src, backend/app) para ver dónde está la complejidad de verdad; (3) revisá la librería de agentes en ' + AGDIR + '/ — es un catálogo, no un mandato: reutilizá los que calcen tal cual o adaptados, descartá los que no aporten, y creá roles NUEVOS si el problema pide un especialista que la librería no tiene.\n\n' +
  'Reglas del equipo: entre 3 y 6 agentes; cada builder debe poder trabajar EN PARALELO sin pisar los archivos de otro (repartí el territorio explícitamente en las misiones); cada misión debe ser autocontenida — el agente que la reciba no vio este análisis. Asigná modelo por costo/beneficio (sonnet=construir código, opus=razonamiento pesado, haiku=mecánico).',
  { label: 'maestro:planificación', phase: 'Planificación', schema: EQUIPO_SCHEMA }
)
if (!plan || !plan.equipo || !plan.equipo.length) {
  return { error: 'El Maestro no devolvió equipo — abortado', plan }
}
log('Equipo definido (' + plan.equipo.length + '): ' + plan.equipo.map(a => a.id + ' [' + a.modelo + ']').join(', '))

const TEAM = {}
for (const a of plan.equipo) TEAM[a.id] = a

function misionCompleta(a, ajuste, iter) {
  const outFile = OUT + '/' + a.id + '.md'
  let p = 'Sos "' + a.nombre + '" (' + a.tipo + ') del equipo sistemas-maestros armado para: "' + PEDIDO + '".\n\n' +
    'TU MISIÓN (definida por el Maestro):\n' + a.mision + '\n\n' +
    (a.definicion_base && a.definicion_base !== 'nueva' ? 'Tu definición base de rol (leela y respetá sus guardrails): ' + a.definicion_base + '\n' : '') +
    CONTEXTO + '\n\nTu archivo de salida: ' + outFile + ' (mkdir -p si hace falta).'
  if (a.tipo === 'builder') p += '\nComo builder: escribí CÓDIGO REAL en el repo y verificalo (frontend: cd frontend && npx tsc --noEmit; backend: cd backend && python -c "import app.main").'
  if (ajuste) {
    p += '\n\n=== AJUSTE DE ITERACIÓN ' + iter + ' (del Maestro, derivado del Conciliador) ===\n' + ajuste +
      '\nYa trabajaste en rondas anteriores: tu output previo está en ' + outFile + ' y tus cambios ya están en el repo. ACTUALIZÁ (no dupliques).'
  }
  return p
}

const MAX_ITERATIONS = 3
const historial = []
const latest = {}
let veredicto = null
let ajustesPorAgente = null

for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
  const fase = iter === 1 ? 'Construcción' : 'Iteración'
  const ids = iter === 1 ? Object.keys(TEAM) : Object.keys(TEAM).filter(id => ajustesPorAgente && ajustesPorAgente[id])
  if (iter > 1 && ids.length === 0) break
  log('Ronda ' + iter + ': disparando ' + ids.length + ' agentes (' + ids.join(', ') + ')')

  const results = await parallel(ids.map(id => () =>
    agent(misionCompleta(TEAM[id], ajustesPorAgente ? ajustesPorAgente[id] : null, iter), {
      label: id + (iter > 1 ? ' r' + iter : ''),
      phase: fase,
      model: TEAM[id].modelo,
      schema: BUILDER_SCHEMA,
    })
  ))
  ids.forEach((id, i) => { if (results[i]) latest[id] = results[i] })
  const muertos = ids.filter((id, i) => !results[i])
  if (muertos.length) log('AVISO: agentes sin resultado esta ronda: ' + muertos.join(', '))

  log('Ronda ' + iter + ': conciliando...')
  veredicto = await agent(
    'Sos el CONCILIADOR AGENT de sistemas-maestros. Leé tu definición en ' + AGDIR + '/conciliador.md y cumplila al pie de la letra — generalizada: el equipo es este, dinámico, definido por el Maestro:\n' + JSON.stringify(plan.equipo.map(a => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, mision: a.mision }))) + '\n\n' +
    'Leé TODOS los outputs completos en ' + OUT + '/ (ls primero) y verificá contra el código real: git diff --stat y git diff sobre backend/ y frontend/ (un output que declara algo que el diff no muestra ES un conflicto bloqueante).\n' +
    'Cruces obligatorios: contratos de API consumidos vs expuestos (por rol admin/worker incluido); reglas de validación vs lo que el código implementa; métricas vs campos reales del esquema; gaps declarados — ¿resueltos o abiertos?; cumplimiento de las REGLAS DURAS de docs/ESTADO.md.\n' +
    'Resúmenes de esta ronda:\n' + JSON.stringify(latest) + '\n' +
    'origen/destino son ids del equipo. coherente=true SOLO sin bloqueantes. No propongas soluciones. Sé determinista.',
    { label: 'reconciliation r' + iter, phase: 'Conciliación', model: 'haiku', schema: CONCILIADOR_SCHEMA }
  )
  if (!veredicto) { log('Conciliador sin resultado — corto la iteración'); break }
  historial.push({ ronda: iter, agentes: ids, conflicts: veredicto.conflicts, coherente: veredicto.coherente })
  const bloqueantes = veredicto.conflicts.filter(c => c.severidad === 'bloqueante')
  log('Ronda ' + iter + ': ' + veredicto.conflicts.length + ' conflictos (' + bloqueantes.length + ' bloqueantes), coherente=' + veredicto.coherente)

  if (veredicto.coherente || bloqueantes.length === 0) break
  if (iter === MAX_ITERATIONS) { log('MAX_ITERATIONS alcanzado con conflictos abiertos — se reportarán explícitamente'); break }

  const ajustes = await agent(
    'Sos el MAESTRO ORCHESTRATOR (Fable). Vos armaste este equipo: ' + JSON.stringify(plan.equipo.map(a => ({ id: a.id, nombre: a.nombre, tipo: a.tipo }))) + '\n' +
    'El Conciliador (fuente de verdad — no modifiques su veredicto) reportó:\n' + JSON.stringify(veredicto.conflicts) + '\n' +
    'Resúmenes: ' + JSON.stringify(latest) + '\n' +
    'Para cada conflicto BLOQUEANTE decidí qué agente(s) deben ajustar su trabajo y redactá instrucciones PRECISAS. Usá exactamente los ids del equipo. Un solo bloque por agente.',
    { label: 'maestro:ajustes r' + iter, phase: 'Iteración', schema: AJUSTES_SCHEMA }
  )
  ajustesPorAgente = {}
  if (ajustes && ajustes.ajustes.length) {
    for (const a of ajustes.ajustes) {
      if (!TEAM[a.agente]) { log('AVISO: id desconocido "' + a.agente + '" — ignorado'); continue }
      ajustesPorAgente[a.agente] = (ajustesPorAgente[a.agente] ? ajustesPorAgente[a.agente] + '\n' : '') + a.instrucciones
    }
  }
  if (!Object.keys(ajustesPorAgente).length) {
    for (const c of bloqueantes) { if (TEAM[c.destino]) ajustesPorAgente[c.destino] = (ajustesPorAgente[c.destino] || '') + '\nResolver: ' + c.descripcion }
    log('Fallback determinista sobre destinos de conflictos bloqueantes')
  }
}

phase('Verificación')
const verificacion = await agent(
  'Sos el agente de VERIFICACIÓN en este repo:\n' +
  '1. cd frontend && npx tsc --noEmit (npm install --legacy-peer-deps si falta node_modules) — resultado EXACTO.\n' +
  '2. cd backend && python -m pytest -q — suite COMPLETA, exit code real. Y python -c "import app.main".\n' +
  '3. git diff --stat — qué se cambió de verdad.\n' +
  '4. Checklist de ' + SPEC + ': cada ítem de Verificación evaluado contra el CÓDIGO (no contra los reportes), con evidencia archivo:línea.\n' +
  'NO arregles nada: solo reportá. Un fallo reportado vale más que un éxito inventado.',
  { label: 'verificación', phase: 'Verificación', model: 'sonnet', schema: {
    type: 'object',
    required: ['tsc_ok', 'suite_ok', 'diff_stat', 'checklist', 'detalles'],
    properties: {
      tsc_ok: { type: 'boolean' }, suite_ok: { type: 'boolean' },
      diff_stat: { type: 'string' },
      checklist: { type: 'array', items: { type: 'object', required: ['item', 'estado', 'evidencia'], properties: {
        item: { type: 'string' }, estado: { type: 'string', enum: ['cumplido', 'parcial', 'pendiente'] }, evidencia: { type: 'string' } } } },
      detalles: { type: 'string' },
    },
  } }
)

phase('Entrega')
const sintesis = await agent(
  'Sos el MAESTRO ORCHESTRATOR (Fable). Cerrá el ciclo. Equipo y por qué: ' + JSON.stringify({ analisis: plan.analisis, equipo: plan.equipo.map(a => ({ id: a.id, nombre: a.nombre, modelo: a.modelo, tipo: a.tipo })) }) + '\n' +
  'Historial: ' + JSON.stringify(historial) + '\nVeredicto final: ' + JSON.stringify(veredicto) + '\nVerificación: ' + JSON.stringify(verificacion) + '\n' +
  'Leé los outputs completos en ' + OUT + '/ y redactá la ENTREGA FINAL en ' + OUT + '/ENTREGA.md: qué equipo armaste y por qué, qué construyó/halló cada agente (con archivos), coherencia, verificación, conflictos NO resueltos (explícitos, nunca ocultos), próximos pasos priorizados. Español, directo, sin humo. Recordá la regla de CLAUDE.md: si el cambio altera reglas o flujos de docs/ESTADO.md, se actualiza en el mismo PR.',
  { label: 'maestro:entrega', phase: 'Entrega' }
)

return {
  equipo: plan.equipo.map(a => ({ id: a.id, nombre: a.nombre, modelo: a.modelo, tipo: a.tipo, base: a.definicion_base })),
  analisis_maestro: plan.analisis,
  iteraciones: historial.length,
  coherente: veredicto ? veredicto.coherente : null,
  conflictos_finales: veredicto ? veredicto.conflicts : [],
  verificacion,
  resumenes: latest,
  sintesis,
}
