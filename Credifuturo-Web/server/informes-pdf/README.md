# Informes en PDF para la Junta

Los informes que se comparten con la Junta Administrativa se publican en PDF con
un formato común, el del documento de referencia
`shared-informes/Interes_Proporcional_Retanqueos.pdf`: banda verde con el
título, secciones numeradas, tablas con fila destacada y pie de página.

`plantilla.py` implementa ese formato (las medidas y colores se tomaron del PDF
de referencia); cada informe es un guion aparte que lo usa.

## Generar

Requiere `reportlab` (no es dependencia de la aplicación; solo hace falta para
regenerar un informe):

```bash
python3 -m venv .venv && .venv/bin/pip install reportlab
.venv/bin/python abonos_extraordinarios.py     # escribe en ../shared-informes/
```

## Publicar un informe nuevo

1. Escribir el guion aquí y generar el PDF en `server/shared-informes/`.
2. Añadir el nombre del archivo a `JUNTA_INFORMES_VISIBLES`, en
   `server/routes/admin.js` — sin eso solo lo ve el administrador.
