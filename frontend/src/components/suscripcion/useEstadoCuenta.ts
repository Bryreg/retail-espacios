import { useCallback, useEffect, useState } from "react";
import { describeError } from "../../api/client";
import { getEstadoCuenta } from "../../api/suscripcion";
import { useAuthStore } from "../../store/authStore";

/** Cada cuánto se vuelve a preguntar el estado de la cuenta. La sincronización
 *  de los planos ya consulta cada 20 s, así que esto no despierta al servidor
 *  más de lo que ya está despierto. */
export const CONSULTA_ESTADO_MS = 3 * 60_000;

/** El estado de cuenta EN VIVO (C2): lo consultan `BloqueoCuenta` y la franja,
 *  al montarse, cada `CONSULTA_ESTADO_MS` y con «Reintentar».
 *
 *  `aviso_cuenta` llegaba una vez, en el login, y el interceptor sólo se
 *  enteraba de un CORTE (un 402): nada le avisaba a la pantalla que la cuenta
 *  había vuelto a estar al día, así que después de un pago la gente del
 *  supermercado seguía bloqueada hasta volver a entrar. Con esto, lo que dice
 *  el servidor se escribe en el store —también «al día», que limpia el aviso—
 *  y `App.tsx` y la franja se redibujan solos.
 *
 *  `duena` lo decide el servidor (la membresía `owner`), no el rol del token:
 *  sólo con `duena === true` se ofrece «Ver suscripción». */
export function useEstadoCuentaVivo() {
  const token = useAuthStore((s) => s.token);
  const actualizarAvisoCuenta = useAuthStore((s) => s.actualizarAvisoCuenta);
  const [duena, setDuena] = useState<boolean | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revisar = useCallback(async () => {
    setRevisando(true);
    try {
      const r = await getEstadoCuenta();
      setDuena(r.duena);
      setError(null);
      actualizarAvisoCuenta(r.estado === "activo" ? null : { estado: r.estado, motivo: r.motivo });
    } catch (err) {
      setError(describeError(err, "No se pudo consultar el estado de la cuenta. Probá de nuevo en un rato."));
    } finally {
      setRevisando(false);
    }
  }, [actualizarAvisoCuenta]);

  useEffect(() => {
    if (!token) return;
    void revisar();
    const reloj = window.setInterval(() => void revisar(), CONSULTA_ESTADO_MS);
    return () => window.clearInterval(reloj);
  }, [token, revisar]);

  return { revisar, revisando, duena, error };
}
