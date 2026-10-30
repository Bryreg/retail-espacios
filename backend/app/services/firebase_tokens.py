"""Verificación de ID tokens de Firebase — sin el SDK de Firebase.

El backend nunca corre ``firebase-admin``: sería una dependencia pesada (trae
``grpc``) para hacer algo que un JWT ya sabe hacer. Lo único que hace falta es
verificar la firma RS256 contra las claves públicas que Google publica para
``securetoken.google.com``, y eso lo da ``PyJWT[crypto]``, que el repo ya trae.

**Interfaz inyectable.** ``VerificadorDeIdToken`` es el contrato; el único uso
en producción es ``VerificadorFirebase``. Los tests no hacen red: inyectan un
verificador falso (subclase mínima) o construyen un ``VerificadorFirebase``
con un ``_transporte`` de prueba que devuelve un JWKS armado con una clave RSA
propia del test — la clase real corre igual, sin tocar la red.

**Seguridad, en orden:**

1. El header del token dicta el algoritmo, y de ahí sólo se acepta ``RS256``
   — rechaza ``none`` y ``HS256`` (la confusión clásica: firmar con HMAC
   usando la clave pública RSA como si fuera un secreto compartido) ANTES de
   tocar la red o el caché.
2. La clave para verificar sale del JWKS por ``kid``, nunca del propio token.
   Un ``kid`` que no está en el JWKS (uno inventado, o uno de un proyecto de
   Firebase distinto con OTRO JWKS) no verifica: no hay «URL de JWKS» en el
   token que se pueda redirigir.
3. ``jwt.decode`` recibe ``algorithms=["RS256"]`` otra vez, como cinturón y
   tirantes: aunque algo más arriba se equivocara, la librería igual se
   niega a aceptar cualquier otro algoritmo.
4. ``aud`` contra ``FIREBASE_PROJECT_ID``, ``iss`` contra
   ``https://securetoken.google.com/<project_id>`` y ``exp`` — los tres los
   valida ``jwt.decode`` por parámetro, no a mano después.
"""
import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Optional

import jwt
from jwt import algorithms as jwt_algorithms

log = logging.getLogger("recabra.firebase_tokens")

# Endpoint JWKS estándar de securetoken (el mismo que documenta Firebase).
JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

# Si Google no manda Cache-Control (o no se pudo leer), cuánto se guarda el
# JWKS antes de refrescar solo. Las claves de Google rotan con horas de
# margen, así que este valor sólo importa si la cabecera falta.
TTL_POR_DEFECTO_SEGUNDOS = 6 * 60 * 60

_CACHE_CONTROL_MAX_AGE = re.compile(r"max-age=(\d+)")


@dataclass(frozen=True)
class ClaimsVerificadas:
    """Lo que queda de un ID token después de verificarlo — nada más."""

    uid: str
    email: Optional[str]
    email_verificado: bool
    proveedor: Optional[str]  # "password", "google.com", ...
    nombre: Optional[str]
    # El segundo factor con que entró («phone», «totp»), si entró con uno. Lo
    # exige la consola del operador con `OPERADOR_EXIGE_MFA=1` (P1-13).
    segundo_factor: Optional[str] = None


class VerificadorDeIdToken:
    """La interfaz. Los tests inyectan su propia implementación."""

    def verificar(self, id_token: str) -> Optional[ClaimsVerificadas]:
        raise NotImplementedError


# Lo que ``VerificadorFirebase`` necesita de una petición HTTP GET: código,
# cuerpo y el valor crudo de la cabecera Cache-Control (o "" si no vino).
# Se puede inyectar en el constructor para probar sin red.
Transporte = Callable[[str], tuple[int, bytes, str]]


def _transporte_real(url: str) -> tuple[int, bytes, str]:
    pedido = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=10) as r:
            return r.status, r.read(), r.headers.get("Cache-Control", "") or ""
    except urllib.error.HTTPError as e:
        return e.code, e.read(), ""


def _max_age(cache_control: str) -> Optional[int]:
    m = _CACHE_CONTROL_MAX_AGE.search(cache_control or "")
    return int(m.group(1)) if m else None


class VerificadorFirebase(VerificadorDeIdToken):
    """Baja el JWKS de Google, lo cachea por ``kid`` y verifica RS256 contra él."""

    def __init__(
        self,
        project_id: str,
        jwks_url: str = JWKS_URL,
        transporte: Transporte = _transporte_real,
    ):
        self.project_id = project_id
        self.jwks_url = jwks_url
        self._transporte = transporte
        self._candado = threading.Lock()
        self._claves: dict[str, dict] = {}
        self._vence_en: float = 0.0

    # ─── JWKS ───────────────────────────────────────────────────────────────

    def _jwks(self, forzar: bool = False) -> dict[str, dict]:
        ahora = time.monotonic()
        if not forzar:
            with self._candado:
                if self._claves and ahora < self._vence_en:
                    return self._claves

        try:
            codigo, cuerpo, cache_control = self._transporte(self.jwks_url)
        except Exception:
            log.exception("No se pudo bajar el JWKS de Firebase")
            with self._candado:
                return self._claves  # lo que hubiera cacheado, o vacío

        if codigo != 200:
            log.error("El JWKS de Firebase respondió HTTP %s", codigo)
            with self._candado:
                return self._claves

        try:
            data = json.loads(cuerpo)
            claves = {k["kid"]: k for k in data.get("keys", []) if isinstance(k, dict) and "kid" in k}
        except (ValueError, KeyError, TypeError):
            log.error("El JWKS de Firebase vino con un formato inesperado")
            with self._candado:
                return self._claves

        ttl = _max_age(cache_control) or TTL_POR_DEFECTO_SEGUNDOS
        with self._candado:
            self._claves = claves
            self._vence_en = ahora + ttl
            return self._claves

    # ─── Verificación ───────────────────────────────────────────────────────

    def verificar(self, id_token: str) -> Optional[ClaimsVerificadas]:
        if not id_token or not isinstance(id_token, str):
            return None
        try:
            header = jwt.get_unverified_header(id_token)
        except jwt.PyJWTError:
            return None

        # Alg lo dicta el header ANTES de tocar el JWKS: rechazar acá `none` y
        # `HS256` cierra la confusión de algoritmo sin gastar una consulta.
        if header.get("alg") != "RS256":
            return None
        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            return None

        jwk = self._jwks().get(kid)
        if jwk is None:
            # El kid pudo haber rotado hace un instante: UN reintento forzado,
            # nunca un bucle — si tampoco está ahí, no es nuestro.
            jwk = self._jwks(forzar=True).get(kid)
            if jwk is None:
                return None

        try:
            clave_publica = jwt_algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        except (ValueError, TypeError, KeyError):
            log.warning("La clave JWKS con kid=%s no se pudo interpretar", kid)
            return None

        try:
            payload = jwt.decode(
                id_token,
                key=clave_publica,
                algorithms=["RS256"],
                audience=self.project_id,
                issuer=f"https://securetoken.google.com/{self.project_id}",
                # Tolerancia de reloj. Sin esto, un servidor cuyo reloj esté
                # aunque sea MEDIO SEGUNDO detrás del de Google rechaza todo
                # token recién emitido con ImmatureSignatureError (iat "del
                # futuro") — medido de verdad contra Firebase en el smoke test
                # de esta fase: 0.5 s de desfase bastaron. 60 s es la
                # tolerancia estándar (los SDK de Google usan del orden de
                # 10-60 s) y aplica también a exp: un token muere hasta 60 s
                # más tarde, lo cual no cambia nada material con TTLs de 1 h.
                leeway=60,
            )
        except jwt.PyJWTError:
            return None

        uid = payload.get("sub") or payload.get("user_id")
        if not isinstance(uid, str) or not uid:
            return None

        firebase_claims = payload.get("firebase")
        proveedor = firebase_claims.get("sign_in_provider") if isinstance(firebase_claims, dict) else None
        segundo = firebase_claims.get("sign_in_second_factor") if isinstance(firebase_claims, dict) else None
        email = payload.get("email")

        return ClaimsVerificadas(
            uid=uid,
            email=email if isinstance(email, str) else None,
            email_verificado=bool(payload.get("email_verified", False)),
            proveedor=proveedor if isinstance(proveedor, str) else None,
            nombre=payload.get("name") if isinstance(payload.get("name"), str) else None,
            segundo_factor=segundo if isinstance(segundo, str) and segundo else None,
        )


# ─── Dependencia FastAPI ───────────────────────────────────────────────────────
#
# Una instancia por `project_id`, reconstruida sólo si la variable de entorno
# cambia (los tests la pisan entre pruebas). `None` cuando falta la variable:
# el router lo traduce a 503 sin tocar nada más de la app.

_instancia: Optional[VerificadorFirebase] = None
_instancia_project_id: Optional[str] = None


def get_verificador() -> Optional[VerificadorDeIdToken]:
    """Dependencia FastAPI: el verificador vigente, o None si falta configurar."""
    import os

    global _instancia, _instancia_project_id
    project_id = (os.getenv("FIREBASE_PROJECT_ID") or "").strip()
    if not project_id:
        return None
    if _instancia is None or _instancia_project_id != project_id:
        _instancia = VerificadorFirebase(project_id)
        _instancia_project_id = project_id
    return _instancia
