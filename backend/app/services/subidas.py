"""Límites de tamaño para lo que entra por HTTP: subidas y cuerpo del pedido.

Dos herramientas, el mismo problema de fondo (hallazgo hardening-1 y -1c de la
auditoría integral): **la app comparaba contra el límite DESPUÉS de tener todo
en RAM**, y para el cuerpo del pedido no comparaba contra nada.

* `leer_con_tope` — reemplaza el patrón `data = await file.read()` seguido de
  `if len(data) > MAX: 413`. Ese patrón devuelve el 413 correcto, pero recién
  después de haber bufferizado el archivo ENTERO. El Dockerfile arranca uvicorn
  con `--workers 1`: un único proceso atiende todo el supermercado, así que un
  archivo de varios GB no "hace lento" al servidor, lo mata — y el atacante ni
  siquiera necesita que le acepten el archivo, le alcanza con mandarlo. Leyendo
  de a 64 KiB y cortando apenas se pasa, el costo máximo de un ataque es un
  chunk de más.

* `LimiteDeCuerpo` — middleware ASGI puro que corta CUALQUIER cuerpo demasiado
  grande, antes de que ningún parser lo materialice y —esto es la gracia—
  **antes de cualquier autenticación**: `POST /api/auth/login` con 5 MB de
  contraseña se procesaba entero para terminar contestando 401.

Es ASGI puro y no `@app.middleware("http")` a propósito: `BaseHTTPMiddleware`
no puede intervenir el `receive` del pedido — vería el cuerpo ya leído por la
capa de abajo, que es justo lo que hay que evitar.
"""
import json

from fastapi import HTTPException
from starlette.datastructures import Headers

# Cuánto se lee por vuelta. 64 KiB es el mismo tamaño que usa el parser de
# multipart de Starlette: ni tantas vueltas como para que el loop pese, ni un
# bloque tan grande como para que "un chunk de más" signifique algo.
TAMANO_DE_CHUNK = 64 * 1024


async def leer_con_tope(upload, tope: int, detalle: str, codigo: int = 413) -> bytes:
    """Lee un `UploadFile` cortando apenas pasa `tope` bytes.

    `detalle` es el texto del error, y lo pone el llamador: cada endpoint ya
    tenía el suyo ("El archivo supera el límite de 10 MB", "La foto supera el
    límite de 10 MB", "El arte supera los 5 MB.") y esos textos los lee gente
    en la pantalla — no se unifican acá.

    `codigo` existe por `planograms.py`, que históricamente contesta 400 y no
    413 para este caso; se conserva su código tal cual.

    El `tope` se pasa por parámetro, nunca se lee de un módulo acá adentro:
    los tests lo bajan en caliente con `monkeypatch.setattr(files_mod,
    "MAX_FILE_SIZE", 100)`, así que el llamador tiene que leer SU constante en
    tiempo de llamada.
    """
    trozos: list[bytes] = []
    acumulado = 0
    while True:
        trozo = await upload.read(TAMANO_DE_CHUNK)
        if not trozo:
            break
        acumulado += len(trozo)
        if acumulado > tope:
            # Se corta acá: no se sigue leyendo ni se guarda lo leído. A lo
            # sumo entró un chunk de más por encima del tope.
            raise HTTPException(status_code=codigo, detail=detalle)
        trozos.append(trozo)
    return b"".join(trozos)


# ─── Límite de tamaño del cuerpo del pedido ──────────────────────────────────

# Los layouts por sede son el cuerpo JSON más pesado del sistema (cientos de
# KB con todos los muebles de una nave). 2 MiB deja margen de sobra y sigue
# siendo tres órdenes de magnitud menos de lo que hace falta para lastimar al
# proceso.
TOPE_JSON = 2 * 1024 * 1024
# 10 MB de archivo (el tope de `files.py` y `mounts.py`) más las cabeceras del
# formulario multipart. El tope propio de cada endpoint lo sigue aplicando
# `leer_con_tope` — catálogo, por ejemplo, corta en 5 MB mucho antes que esto.
TOPE_MULTIPART = 12 * 1024 * 1024

MENSAJE = "El pedido supera el tamaño máximo permitido."


class _CuerpoExcedido(Exception):
    """Señal interna: el cuerpo se pasó del tope y ya no se lee más."""


class LimiteDeCuerpo:
    """Corta el pedido cuyo cuerpo supera el tope, contando bytes de verdad.

    El `Content-Length` declarado sirve para rechazar de entrada (barato), pero
    NUNCA para permitir: un cuerpo con `Transfer-Encoding: chunked` no lo trae,
    y uno que miente declara menos de lo que manda. Lo que decide es el conteo
    real sobre el `receive`.
    """

    def __init__(self, app, tope_json: int = TOPE_JSON, tope_multipart: int = TOPE_MULTIPART):
        self.app = app
        self.tope_json = tope_json
        self.tope_multipart = tope_multipart

    def _tope_para(self, cabeceras: Headers) -> int:
        tipo = (cabeceras.get("content-type") or "").split(";")[0].strip().lower()
        if tipo == "multipart/form-data":
            return self.tope_multipart
        return self.tope_json

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        cabeceras = Headers(scope=scope)
        tope = self._tope_para(cabeceras)

        declarado = cabeceras.get("content-length")
        if declarado is not None and declarado.strip().isdigit():
            if int(declarado) > tope:
                await self._rechazar(send)
                return

        estado = {"contado": 0, "excedido": False, "respuesta_iniciada": False}

        async def receive_limitado():
            if estado["excedido"]:
                # Si la capa de abajo insiste en leer, se le sigue cortando.
                raise _CuerpoExcedido()
            mensaje = await receive()
            if mensaje.get("type") == "http.request":
                estado["contado"] += len(mensaje.get("body") or b"")
                if estado["contado"] > tope:
                    estado["excedido"] = True
                    raise _CuerpoExcedido()
            return mensaje

        async def send_vigilado(mensaje):
            if mensaje.get("type") == "http.response.start":
                estado["respuesta_iniciada"] = True
            await send(mensaje)

        try:
            await self.app(scope, receive_limitado, send_vigilado)
        except _CuerpoExcedido:
            if not estado["respuesta_iniciada"]:
                await self._rechazar(send)
            # Si la respuesta ya había arrancado no hay 413 que mandar: el
            # cliente ya recibió cabeceras. Se corta y listo.

    async def _rechazar(self, send):
        cuerpo = json.dumps({"detail": MENSAJE}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(cuerpo)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": cuerpo})
