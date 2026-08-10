import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Comportamiento del menú lateral en móvil, compartido por los dos layouts.
 *
 * Existía como estado suelto (`sidebarOpen`) sin nada alrededor, y le faltaban
 * tres cosas que un panel deslizante da por supuestas — las tres verificadas en
 * un navegador móvil antes de escribir esto:
 *
 *   1. No se cerraba al navegar. Tocabas "Aportes", la ruta cambiaba… y el menú
 *      seguía encima tapando la página recién abierta. Había que cerrarlo a mano
 *      para ver a dónde habías ido.
 *   2. El fondo seguía haciendo scroll por debajo del panel abierto (medido:
 *      0 → 400 px), así que al cerrarlo aparecías en otro punto de la página.
 *   3. Escape no lo cerraba.
 *
 * Además devuelve los manejadores para cerrarlo arrastrando hacia la izquierda,
 * que es como se cierra un panel así en un teléfono. El arrastre escribe el
 * transform en línea SOLO mientras el dedo está apoyado y lo retira al soltar,
 * de modo que en escritorio (donde la clase `lg:translate-x-0` manda) nunca hay
 * un estilo en línea compitiendo con ella.
 */

// Umbral en píxeles a partir del cual soltar el dedo cierra el panel. Por
// debajo, vuelve a su sitio: un roce accidental no debe cerrar el menú.
const UMBRAL_CIERRE = 70;

export function useDrawerMovil(abierto, setAbierto) {
    const { pathname } = useLocation();
    const panelRef = useRef(null);
    const inicioX = useRef(null);
    const [arrastreX, setArrastreX] = useState(0);

    const cerrar = useCallback(() => setAbierto(false), [setAbierto]);

    // 1 · Cerrar al cambiar de ruta.
    //
    // Depende solo de `pathname`, no de `abierto`: si dependiera de ambos, al
    // abrirlo se dispararía y lo cerraría en el acto.
    useEffect(() => {
        setAbierto(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // 2 · Bloquear el scroll del fondo mientras está abierto.
    useEffect(() => {
        if (!abierto) return;
        const previo = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previo; };
    }, [abierto]);

    // 3 · Escape cierra.
    useEffect(() => {
        if (!abierto) return;
        const alPulsar = (e) => { if (e.key === 'Escape') cerrar(); };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [abierto, cerrar]);

    // 4 · Arrastre para cerrar.
    const onTouchStart = useCallback((e) => {
        if (!abierto) return;
        inicioX.current = e.touches[0].clientX;
    }, [abierto]);

    const onTouchMove = useCallback((e) => {
        if (inicioX.current === null) return;
        // Solo cuenta el movimiento hacia la izquierda: tirar hacia la derecha
        // no debe despegar el panel del borde de la pantalla.
        const delta = Math.min(0, e.touches[0].clientX - inicioX.current);
        setArrastreX(delta);
    }, []);

    const onTouchEnd = useCallback(() => {
        if (inicioX.current === null) return;
        const recorrido = arrastreX;
        inicioX.current = null;
        setArrastreX(0);
        if (recorrido < -UMBRAL_CIERRE) cerrar();
    }, [arrastreX, cerrar]);

    const propsArrastre = {
        ref: panelRef,
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel: onTouchEnd,
        // Mientras se arrastra se quita la transición: si no, el panel iría
        // siempre 300 ms por detrás del dedo y se sentiría pegajoso.
        style: arrastreX !== 0
            ? { transform: `translateX(${arrastreX}px)`, transition: 'none' }
            : undefined,
    };

    return { cerrar, propsArrastre, arrastrando: arrastreX !== 0 };
}

export default useDrawerMovil;
