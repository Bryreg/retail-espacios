# Red Team Fase 2 — puntero

El informe completo está en **`features/clientes/outputs/red-team-privilegio.md`**
(el contrato `equipo-fase-2.md` nombra este archivo; la misión del auditor nombra
aquél — es el mismo trabajo, escrito una sola vez para que no se bifurque).

Los ataques ejecutables viven en `backend/tests/test_plataforma_ataques.py`
(30 tests: 25 pasan, 5 `xfail(strict=True)`, uno por hallazgo abierto).

| id | severidad | una línea |
|---|---|---|
| R-0 | bloqueante para el cierre (no es vulnerabilidad) | La suite completa está verde **una sola vez**: la primera corrida deja `backend/retail_espacios.db` con el cliente `nuevomarket` adentro y la segunda arranca en rojo. Antes de medir regresión: `rm -f backend/retail_espacios.db backend/recabra_*.db`. |
| R-1 | mayor | El estado de cuenta se lee sin credencial: un GET anónimo distingue 401 (sana) de 402 (suspendida / solo lectura). |
| R-2 | mayor | El `motivo` que escribe el operador le llega a cualquiera en `gracia` y `solo_lectura`, incluida la contraseña compartida de worker. |
| R-3 | menor | El tope de 2 fundaciones es un `count()` sin barrera en la base: dos altas simultáneas dejan 3. |
| R-4 | menor | Un alta que falla en el paso irreversible deja un `Usuario` huérfano grabado. |
| R-5 | menor (latente) | `crear_cliente` adopta una base que ya existe en vez de rechazarla; con otro nombre de base de producción sería escalada total. |

Los 20 ataques del catálogo de la misión (frontera de operador, superficie de
denegación, alta como abuso) se ejecutaron todos: la tabla completa de
resistió/cedió, los `archivo:línea` de cada defecto y las sospechas sin test
están en el informe.
