import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../config/api';
import { CLAVE_VISIBILIDAD, esSeccionVisible, parsearVisibilidad } from '../utils/seccionesVisibles';

/**
 * Provee a toda la app qué secciones están visibles para los socios.
 *
 * Una sola petición compartida en vez de que cada página consulte por su cuenta:
 * el Panel Ejecutivo, el menú lateral y la tarjeta "Mi posición en el fondo"
 * consultan lo mismo, y si cada uno pidiera el AppSetting por separado podrían
 * quedar momentáneamente en desacuerdo (una sección visible y otra no en la
 * misma pantalla, según qué respuesta llegó primero).
 *
 * Principio de fallo seguro: si la consulta falla o aún no ha llegado, se usan
 * los defaults del catálogo — NUNCA se asume "oculto". Un problema de red no
 * debe hacer desaparecer contenido que el comité sí aprobó mostrar.
 */

const VisibilidadContext = createContext(null);

// Caché local de la última configuración conocida.
//
// Sin ella hay un parpadeo real: el provider arranca con `mapa = null`, así que
// durante el primer render se usan los defaults del catálogo (todo oculto) y,
// cuando llega la respuesta, las secciones habilitadas APARECEN de golpe. En una
// página larga eso además desplaza el contenido bajo el cursor.
//
// Hidratar de localStorage arranca con lo que el socio vio la última vez, y la
// respuesta del servidor solo corrige si algo cambió. No es una frontera de
// seguridad —quien edite su localStorage solo se muestra a sí mismo secciones
// con datos agregados del fondo que su rol ya puede pedir por API— sino una
// mejora de percepción.
const CACHE_KEY = 'credifuturo.visibilidadSecciones';

const leerCache = () => {
    try {
        const crudo = localStorage.getItem(CACHE_KEY);
        return crudo ? parsearVisibilidad(crudo) : null;
    } catch {
        return null;
    }
};

const escribirCache = (mapa) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(mapa)); } catch { /* modo privado, cuota llena */ }
};

export const VisibilidadProvider = ({ children, user }) => {
    // Se hidrata de forma SÍNCRONA en la inicialización del estado, no en un
    // useEffect: un efecto corre después del primer render, que es justo el
    // render donde se vería el parpadeo.
    const [mapa, setMapa] = useState(leerCache);
    const [cargando, setCargando] = useState(false);

    // Vista previa: ids que el admin fuerza a "visible" en SU propia sesión desde
    // Cambios, para ver una sección oculta con datos reales antes de decidir si la
    // vuelve a mostrar a los socios. Vive solo en memoria de este componente — no
    // se guarda en el AppSetting ni en localStorage — así que nunca se filtra a
    // otro usuario ni sobrevive a un refresco de página: es una lupa temporal
    // sobre el estado real, no una decisión.
    const [previewIds, setPreviewIds] = useState([]);

    const cargar = useCallback(async () => {
        // Sin sesión el endpoint responde 401 — no tiene sentido pedirlo desde el
        // login. Se conserva la caché (no se pone en null) para que al volver a
        // entrar la primera pantalla ya salga bien, sin el parpadeo. La config es
        // global del fondo, igual para todos los roles, así que no hay nada de un
        // usuario que se filtre al siguiente.
        if (!user) { setMapa(leerCache()); return; }
        setCargando(true);
        try {
            const res = await api.get(`/admin/settings/${CLAVE_VISIBILIDAD}`);
            const fresco = parsearVisibilidad(res.data?.value);
            setMapa(fresco);
            escribirCache(fresco);
        } catch {
            // Silencioso a propósito: esto no es una función que el socio pidió,
            // es configuración de fondo. Se conserva la caché (o se cae a los
            // defaults si no hay) en vez de ocultar contenido por un fallo de red.
        } finally {
            setCargando(false);
        }
    }, [user]);

    // Se recarga cuando cambia el usuario (login/logout), no solo al montar:
    // el provider vive por encima del router, así que sin esta dependencia la
    // configuración quedaría con lo que hubiera al abrir la pestaña.
    useEffect(() => { cargar(); }, [cargar]);

    // La vista previa gana sobre el estado real: es justamente para eso — ver una
    // sección oculta como si estuviera visible, sin tocar la configuración guardada.
    const esVisible = useCallback(
        (id) => esSeccionVisible(mapa, id) || previewIds.includes(id),
        [mapa, previewIds]
    );

    const activarVistaPrevia = useCallback((id) => {
        setPreviewIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    }, []);

    const salirVistaPrevia = useCallback(() => setPreviewIds([]), []);

    /** Guarda el mapa completo (solo admin; el backend rechaza a los demás). */
    const guardar = useCallback(async (nuevoMapa) => {
        // El estado local solo se actualiza si el PUT tuvo éxito: si el servidor
        // rechaza, la pantalla sigue mostrando lo que de verdad está guardado en
        // vez de una configuración que el admin cree aplicada y no lo está.
        await api.put(`/admin/settings/${CLAVE_VISIBILIDAD}`, { value: JSON.stringify(nuevoMapa) });
        setMapa(nuevoMapa);
        escribirCache(nuevoMapa);
    }, []);

    return (
        <VisibilidadContext.Provider value={{
            mapa, cargando, esVisible, guardar, recargar: cargar,
            previewIds, activarVistaPrevia, salirVistaPrevia,
        }}>
            {children}
        </VisibilidadContext.Provider>
    );
};

/**
 * Hook de consulta. Devuelve `esVisible(id)` incluso fuera del provider (cae a
 * los defaults del catálogo) para que ningún componente reviente por montarse
 * en un árbol sin provider — p. ej. en una prueba aislada.
 */
export const useVisibilidad = () => {
    const ctx = useContext(VisibilidadContext);
    if (!ctx) {
        return {
            mapa: null,
            cargando: false,
            esVisible: (id) => esSeccionVisible(null, id),
            guardar: async () => { throw new Error('VisibilidadProvider no está montado'); },
            recargar: async () => {},
            previewIds: [],
            activarVistaPrevia: () => {},
            salirVistaPrevia: () => {},
        };
    }
    return ctx;
};

export default VisibilidadContext;
