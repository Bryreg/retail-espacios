# AGENTS.md

## Maestro Framework
Base framework: `./systems-master/.claude/`

- Skills compartidos: `./systems-master/.claude/skills/design/`
- Agentes especializados: `./systems-master/.claude/skills/agentes/`
- Workflow template: `./systems-master/.claude/workflows/`

## Project-specific overrides
- Skills locales de retail-espacios (`banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`, `ui-ux-pro-max`) permanecen en `.claude/skills/` y tienen prioridad sobre los equivalentes del maestro cuando haya conflicto de nombre.
- El workflow específico del dominio retail vive en `.claude/workflows/vitrina-workflow.js` y reutiliza los agentes del maestro (`agente-frontend`, `agente-backend`, `agente-contador`, `agente-legal`, `agente-analytics`, `conciliador`).
