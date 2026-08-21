import React from 'react';
import { useLocation } from 'react-router-dom';
import PageHero from './PageHero';
import { infoDePagina } from '../../utils/paginasInfo';
import { useVisibilidad } from '../../context/VisibilidadContext';

/**
 * Resuelve el encabezado de presentación que corresponde a la ruta activa.
 *
 * Lo montan los dos layouts justo encima del <Outlet />. Ponerlo ahí y no en
 * cada página es lo que hace que una pantalla nueva herede su presentación sin
 * tocarla, y que no existan treinta copias del mismo bloque desincronizándose.
 *
 * Se puede apagar entero desde el menú "Cambios" (`landing.encabezados`).
 */
const PageHeroRuta = () => {
    const { pathname } = useLocation();
    const { esVisible } = useVisibilidad();

    if (!esVisible('landing.encabezados')) return null;

    const info = infoDePagina(pathname);
    if (!info) return null;

    return (
        <PageHero
            icono={info.icono}
            titulo={info.titulo}
            descripcion={info.descripcion}
            encontraras={info.encontraras}
        />
    );
};

export default PageHeroRuta;
