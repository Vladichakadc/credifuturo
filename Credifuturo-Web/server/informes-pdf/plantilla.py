# -*- coding: utf-8 -*-
"""
Plantilla de informes para la Junta Administrativa de Credifuturo.

Reproduce el formato del documento de referencia
`shared-informes/Interes_Proporcional_Retanqueos.pdf` (banda verde con el
título, secciones numeradas con viñeta circular, tablas de dos o tres columnas
con fila destacada, bloques de fórmula y pie de página).

Las medidas —márgenes, altos de fila, interlineados, colores— se tomaron del
propio PDF de referencia, para que un informe nuevo se vea como parte de la
misma serie y no como un documento suelto.

Uso:  from plantilla import Informe
      doc = Informe(titulo1=..., titulo2=..., fecha=...)
      doc.seccion('Qué ocurría'); doc.parrafo('...'); doc.guardar('salida.pdf')
"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics

W, H = A4                      # 595.28 x 841.89

# ── Medidas tomadas del PDF de referencia ──────────────────────────────
MX          = 51.0             # margen izquierdo
CW          = 493.2            # ancho de contenido
MR          = MX + CW          # borde derecho
BANDA_H     = 147.4            # alto de la banda del encabezado
ACENTO_H    = 7.1              # franja de acento bajo la banda
TOP_P1      = 197.9            # arranque del contenido en la portada
TOP_PN      = 60.0             # arranque del contenido en páginas siguientes
FONDO_Y     = 800.0            # límite inferior del contenido
PIE_TOP     = 824.2
FILA_H      = 25.5             # alto de fila de tabla
PAD         = 8.5              # padding horizontal dentro de la tabla
ASC         = 0.793            # del alto de fuente hasta la línea base

# ── Colores ────────────────────────────────────────────────────────────
VERDE_OSC   = (0.02, 0.18, 0.09)
VERDE       = (0.09, 0.40, 0.20)
AMBAR       = (0.98, 0.75, 0.14)
MENTA       = (0.82, 0.98, 0.90)
MENTA_SUAVE = (0.93, 0.99, 0.96)
TINTA       = (0.07, 0.09, 0.15)
TEXTO       = (0.29, 0.33, 0.39)
GRIS        = (0.61, 0.64, 0.69)
LINEA       = (0.95, 0.96, 0.96)

REG, NEG    = 'Helvetica', 'Helvetica-Bold'
MONO, MONO_N = 'Courier', 'Courier-Bold'


def _runs(texto):
    """Parte el texto en tramos (contenido, negrita) usando **marcadores**."""
    partes, negrita = [], False
    for tramo in texto.split('**'):
        if tramo:
            partes.append((tramo, negrita))
        negrita = not negrita
    return partes


def _palabras(texto):
    """Palabras con su marca de negrita y si van pegadas a la anterior.

    Hace falta distinguirlo porque los marcadores de negrita parten el texto en
    tramos: en "quedaban **idénticas**: mismo" el espacio va antes de la palabra
    en negrita, pero los dos puntos que la siguen van pegados a ella.
    """
    salida, espacio_pendiente = [], True
    for tramo, neg in _runs(texto):
        piezas = tramo.split(' ')
        for i, p in enumerate(piezas):
            if p == '':
                espacio_pendiente = True
                continue
            salida.append((p, neg, not espacio_pendiente and bool(salida)))
            espacio_pendiente = i < len(piezas) - 1
    return salida


class Informe:
    def __init__(self, titulo1, titulo2, fecha, epigrafe='CREDIFUTURO · FONDO FAMILIAR'):
        self.titulo1, self.titulo2 = titulo1, titulo2
        self.fecha, self.epigrafe = fecha, epigrafe
        self.ops = []               # (pagina, funcion_de_dibujo)
        self.pagina = 1
        self.y = TOP_P1             # posición vertical, medida desde arriba
        self.n_seccion = 0
        self.primera_de_pagina = True

    # ── primitivas ────────────────────────────────────────────────────
    def _texto(self, x, top, txt, fuente=REG, tam=10.5, color=TEXTO, alineacion='izq'):
        pg = self.pagina
        ancho = pdfmetrics.stringWidth(txt, fuente, tam)
        if alineacion == 'der':
            x -= ancho
        elif alineacion == 'centro':
            x -= ancho / 2

        def dibujar(c, x=x, top=top, txt=txt, fuente=fuente, tam=tam, color=color):
            c.setFillColorRGB(*color)
            c.setFont(fuente, tam)
            c.drawString(x, H - top - ASC * tam, txt)
        self.ops.append((pg, dibujar))

    def _rect(self, x, top, w, h, color, radio=0):
        pg = self.pagina

        def dibujar(c):
            c.setFillColorRGB(*color)
            if radio:
                c.roundRect(x, H - top - h, w, h, radio, stroke=0, fill=1)
            else:
                c.rect(x, H - top - h, w, h, stroke=0, fill=1)
        self.ops.append((pg, dibujar))

    def _linea(self, top, grosor=0.85, x0=MX, x1=MR):
        pg = self.pagina

        def dibujar(c):
            c.setStrokeColorRGB(*LINEA)
            c.setLineWidth(grosor)
            c.line(x0, H - top, x1, H - top)
        self.ops.append((pg, dibujar))

    def _circulo(self, cx, ctop, r, color):
        pg = self.pagina

        def dibujar(c):
            c.setFillColorRGB(*color)
            c.circle(cx, H - ctop, r, stroke=0, fill=1)
        self.ops.append((pg, dibujar))

    # ── control de página ─────────────────────────────────────────────
    def _marcar(self):
        self.primera_de_pagina = False

    def _espacio(self, alto):
        """Salta de página si lo que viene no cabe completo."""
        if self.y + alto > FONDO_Y:
            self.pagina += 1
            self.y = TOP_PN
            self.primera_de_pagina = True

    # ── bloques ───────────────────────────────────────────────────────
    def seccion(self, titulo):
        self.n_seccion += 1
        self._espacio(70)
        if not self.primera_de_pagina:
            self.y += 32
            self._espacio(70)
        cy = self.y + 9.05
        self._circulo(59.55, cy, 9.05, VERDE)
        self._texto(59.55, self.y + 5.6, str(self.n_seccion), NEG, 9, (1, 1, 1), 'centro')
        self._texto(76.5, self.y + 2.4, titulo, NEG, 13, TINTA)
        self._linea(self.y + 31.7, 1.13)
        self.y += 43.2
        self._marcar()

    def parrafo(self, texto, tam=10.5, color=TEXTO, sangria=0, espacio=13.9):
        interlineado = tam * 1.152
        self._espacio(interlineado)   # el primer renglón también tiene que caber
        x0 = MX + sangria
        disp = CW - sangria
        renglon, ancho = [], 0.0
        for pal, neg, pega in _palabras(texto):
            f = NEG if neg else REG
            w = pdfmetrics.stringWidth(pal, f, tam)
            sep = 0 if (pega or not renglon) else pdfmetrics.stringWidth(' ', f, tam)
            if renglon and ancho + sep + w > disp:
                self._volcar(x0, renglon, tam, color)
                self.y += interlineado
                self._espacio(interlineado)
                renglon, ancho = [], 0.0
                sep = 0
            renglon.append((pal, f, sep))
            ancho += sep + w
        if renglon:
            self._volcar(x0, renglon, tam, color)
            self.y += interlineado
        self.y += espacio
        self._marcar()

    def _volcar(self, x0, renglon, tam, color):
        x = x0
        for pal, f, sep in renglon:
            x += sep
            self._texto(x, self.y, pal, f, tam, TINTA if f == NEG else color)
            x += pdfmetrics.stringWidth(pal, f, tam)

    def rotulo(self, texto, tam=10.5):
        """Título corto en negrita que introduce una tabla o un sub-tema."""
        self._espacio(tam * 1.152 + 8 + FILA_H * 2)
        self._texto(MX, self.y, texto, NEG, tam, TINTA)
        self.y += tam * 1.152 + 8
        self._marcar()

    def vinetas(self, items, espacio=12.0):
        for it in items:
            self._espacio(30)
            self._circulo(54.45, self.y + 4.65, 2.55, VERDE)
            self.parrafo(it, sangria=14.2, espacio=espacio)

    def formula(self, principal, secundaria=None):
        alto = 42.5 if secundaria else 27.0
        self._espacio(alto + 16)
        self._rect(MX, self.y, CW, alto, LINEA, radio=3)
        self._texto(MX + CW / 2, self.y + 8.1, principal, MONO_N, 11, VERDE, 'centro')
        if secundaria:
            self._texto(MX + CW / 2, self.y + 24.5, secundaria, MONO, 10, TINTA, 'centro')
        self.y += alto + 16
        self._marcar()

    def bloque_codigo(self, lineas):
        alto = 12 + 14.5 * len(lineas)
        self._espacio(alto + 16)
        self._rect(MX, self.y, CW, alto, LINEA, radio=3)
        for i, ln in enumerate(lineas):
            self._texto(MX + 14, self.y + 9 + 14.5 * i, ln, MONO, 9.5, TINTA)
        self.y += alto + 16
        self._marcar()

    def tabla(self, filas, encabezado=None, destacar=None):
        """filas = [(etiqueta, val1[, val2]), ...]. `destacar` = índice de fila resaltada."""
        n_col = max(len(f) for f in filas)
        cols = self._columnas(n_col)
        if encabezado:
            self._espacio(FILA_H * 2)
            for i, h in enumerate(encabezado):
                x, al = cols[i]
                self._texto(x, self.y + 4, h.upper(), NEG, 8, GRIS, al)
            self.y += 18
            self._linea(self.y, 1.13)
        else:
            self._espacio(FILA_H * 2)
            self._linea(self.y, 0.85)
        for idx, fila in enumerate(filas):
            self._espacio(FILA_H)
            resaltada = destacar is not None and idx == destacar
            if resaltada:
                self._rect(MX, self.y, CW, FILA_H, MENTA_SUAVE)
            f = NEG if resaltada else REG
            for i, celda in enumerate(fila):
                x, al = cols[i]
                if resaltada:
                    color = TINTA if i == 0 else VERDE
                else:
                    color = TINTA if (i == 0 and n_col > 2) else TEXTO
                self._texto(x, self.y + 8.7, str(celda), f, 10.5, color, al)
            self.y += FILA_H
            self._linea(self.y, 0.85)
        self.y += 18
        self._marcar()

    @staticmethod
    def _columnas(n_col):
        """Etiqueta a la izquierda; los valores, alineados a la derecha."""
        if n_col <= 2:
            return [(MX + PAD, 'izq'), (MR - PAD, 'der')]
        ancho_val = (CW - 210) / (n_col - 1)
        cols = [(MX + PAD, 'izq')]
        for i in range(n_col - 1):
            cols.append((MX + 210 + ancho_val * (i + 1) - PAD, 'der'))
        return cols

    def nota(self, texto):
        self.parrafo(texto, tam=10.0, color=GRIS, espacio=10)

    # ── portada y pie ─────────────────────────────────────────────────
    def _portada(self, c):
        c.setFillColorRGB(*VERDE_OSC)
        c.rect(0, H - BANDA_H, W, BANDA_H, stroke=0, fill=1)
        c.setFillColorRGB(*VERDE)
        c.rect(0, H - BANDA_H - ACENTO_H, W, ACENTO_H, stroke=0, fill=1)
        c.setFillColorRGB(*AMBAR)
        c.setFont(NEG, 10)
        c.drawString(MX, H - 37.4 - ASC * 10, self.epigrafe)
        c.setFillColorRGB(1, 1, 1)
        c.setFont(NEG, 20)
        c.drawString(MX, H - 63.5 - ASC * 20, self.titulo1)
        c.drawString(MX, H - 89.0 - ASC * 20, self.titulo2)
        c.setFillColorRGB(*MENTA)
        c.setFont(REG, 10.5)
        c.drawString(MX, H - 119.2 - ASC * 10.5, f'Informe para la Junta Administrativa · {self.fecha}')

    def _pie(self, c, pagina, total):
        c.setFillColorRGB(*GRIS)
        c.setFont(REG, 8)
        y = H - PIE_TOP - ASC * 8
        c.drawString(MX, y, f'Generado automáticamente · Sistema Credifuturo · {self.fecha}')
        etiqueta = f'Página {pagina} de {total}'
        c.drawString(MR - pdfmetrics.stringWidth(etiqueta, REG, 8), y, etiqueta)

    def guardar(self, ruta):
        total = self.pagina
        c = canvas.Canvas(ruta, pagesize=A4)
        c.setTitle(f'{self.titulo1} {self.titulo2}'.strip())
        c.setAuthor('Sistema Credifuturo')
        for pg in range(1, total + 1):
            if pg == 1:
                self._portada(c)
            for p, dibujar in self.ops:
                if p == pg:
                    dibujar(c)
            self._pie(c, pg, total)
            c.showPage()
        c.save()
        return ruta
