"""Genera hojas de consulta ficticias "llenadas a mano" para pruebas y demo.

Uso: python3 scripts/generar-hojas-demo.py <Caveat.ttf> [<Kalam.ttf>]
Los datos son inventados y coinciden con src/hojas/demo.ts.
"""
import random
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ANCHO, ALTO = 1240, 1754
TIPO = "DejaVuSans.ttf"


def fuente(ruta, tam):
    try:
        return ImageFont.truetype(ruta, tam)
    except OSError:
        return ImageFont.load_default(tam)


HOJAS = [
    {
        "Nombre(s)": "Rosa Elena",
        "Primer apellido": "Martínez",
        "Segundo apellido": "Cruz",
        "Fecha de nacimiento": "14/03/1978",
        "Celular": "951 123 4567",
        "CURP": "~~ MACR78 ~~",
        "Comunidad": "San Miguel del Valle",
        "Municipio": "Tlacolula",
        "Fecha": "20/11/2026",
        "Médica o médico": "Dra. Laura Gómez",
        "Motivo de consulta": "Tamizaje de rutina",
        "Peso (kg)": "68.5",
        "Talla (cm)": "156",
        "Presión arterial": "130/85",
        "Frec. cardiaca": "78",
        "Temperatura (°C)": "36.6",
        "Antecedentes": "Madre con cáncer de mama. G3 P3.",
        "Exploración física": "Mamas simétricas, sin nódulos palpables.",
        "Diagnóstico": "Sana. Exploración mamaria normal.",
        "Plan": "Mastografía en 1 año. Papanicolaou en próxima brigada.",
    },
    {
        "Nombre(s)": "Guadalupe",
        "Primer apellido": "Hernández",
        "Segundo apellido": "López",
        "Fecha de nacimiento": "02/08/65",
        "Celular": "~~~~~~",
        "CURP": "",
        "Comunidad": "Santa Ana",
        "Municipio": "Zaachila",
        "Fecha": "20/11/2026",
        "Médica o médico": "Dr. Andrés Ruiz",
        "Motivo de consulta": "Bolita en mama izquierda",
        "Peso (kg)": "74",
        "Talla (cm)": "",
        "Presión arterial": "140/90",
        "Frec. cardiaca": "~~",
        "Temperatura (°C)": "36.8",
        "Antecedentes": "",
        "Exploración física": "Nódulo de 1.5 cm en cuadrante superior externo izq., móvil.",
        "Diagnóstico": "Nódulo mamario izquierdo a estudiar.",
        "Plan": "Ultrasonido mamario. Referir a ginecología.",
    },
]

SECCIONES = [
    ("Datos de la paciente", [
        ["Nombre(s)", "Primer apellido", "Segundo apellido"],
        ["Fecha de nacimiento", "Celular", "CURP"],
        ["Comunidad", "Municipio"],
    ]),
    ("Visita", [["Fecha", "Médica o médico"], ["Motivo de consulta"]]),
    ("Signos vitales", [
        ["Peso (kg)", "Talla (cm)", "Presión arterial"],
        ["Frec. cardiaca", "Temperatura (°C)"],
    ]),
    ("Valoración", [["Antecedentes"], ["Exploración física"], ["Diagnóstico"], ["Plan"]]),
]


def garabato(d, x, y, w, rnd):
    """Tachón ilegible."""
    puntos = [(x + i * 6, y + rnd.randint(-10, 10)) for i in range(w // 6)]
    d.line(puntos, fill=(30, 40, 110), width=3)


def generar(datos, letra, salida, semilla):
    rnd = random.Random(semilla)
    img = Image.new("RGB", (ANCHO, ALTO), (250, 248, 240))
    d = ImageDraw.Draw(img)
    titulo, rotulo, mano = fuente(TIPO, 40), fuente(TIPO, 20), fuente(letra, 46)
    d.text((80, 60), "EIRA A.C. · Brigada de salud", font=titulo, fill=(20, 20, 20))
    d.text((80, 112), "Hoja de consulta (formato de prueba, datos ficticios)", font=rotulo, fill=(90, 90, 90))
    y = 170
    for seccion, filas in SECCIONES:
        d.rectangle((70, y, ANCHO - 70, y + 34), fill=(225, 225, 225))
        d.text((82, y + 5), seccion.upper(), font=rotulo, fill=(30, 30, 30))
        y += 50
        for fila in filas:
            ancho = (ANCHO - 140) // len(fila)
            alto = 120 if len(fila) == 1 and seccion == "Valoración" else 92
            for i, campo in enumerate(fila):
                x = 70 + i * ancho
                d.text((x + 8, y), campo, font=rotulo, fill=(70, 70, 70))
                d.line((x + 8, y + alto - 12, x + ancho - 16, y + alto - 12), fill=(150, 150, 150), width=2)
                valor = datos.get(campo, "")
                bx, by = x + 14 + rnd.randint(-4, 6), y + 26 + rnd.randint(-5, 5)
                if valor.startswith("~"):
                    garabato(d, bx, by + 22, min(ancho - 40, 220), rnd)
                elif valor:
                    capa = Image.new("RGBA", (ancho + 200, 90), (0, 0, 0, 0))
                    ImageDraw.Draw(capa).text((0, 0), valor, font=mano, fill=(25, 35, 120, 255))
                    capa = capa.rotate(rnd.uniform(-1.6, 1.6), resample=Image.BICUBIC)
                    img.paste(capa, (bx, by), capa)
            y += alto + 6
        y += 10
    # Foto de celular: leve giro, sombra y desenfoque.
    img = img.rotate(rnd.uniform(-2, 2), resample=Image.BICUBIC, expand=True, fillcolor=(90, 80, 70))
    sombra = Image.new("L", img.size, 0)
    ImageDraw.Draw(sombra).rectangle((0, 0, img.size[0], img.size[1] // 3), fill=25)
    img = Image.composite(Image.new("RGB", img.size, (0, 0, 0)), img, sombra.filter(ImageFilter.GaussianBlur(200)))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(salida, "JPEG", quality=82)


if __name__ == "__main__":
    letras = sys.argv[1:] or ["Caveat.ttf"]
    for i, datos in enumerate(HOJAS):
        generar(datos, letras[i % len(letras)], f"public/demo/hojas/hoja-{i + 1}.jpg", i)
