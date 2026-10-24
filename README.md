# MiRuta

Planificador de viajes para iPhone: funciona como web instalable (PWA), sin necesidad de App Store ni cuenta de desarrollador de Apple. Sirve para planificar antes del viaje, controlar gastos durante el viaje y apuntar ideas y notas. Funciona con o sin conexión.

## Qué incluye

- **Listado de viajes** con nombre, fecha de inicio y de regreso. Botón **+** para añadir uno nuevo.
- **Detalle de cada viaje**, con estos apartados:
  - **Fechas**: nombre, inicio y regreso.
  - **Desplazamientos**: día, origen, destino, coste en € y estado (✓ OK en verde / ● Pendiente en rojo). Suma total.
  - **Alojamientos**: entrada, salida, ubicación y precio total. Calcula noches, precio medio por noche y estado. Suma total.
  - **Pendientes**: lista editable y eliminable.
  - **Gastos de vida**: día del viaje, importe, categoría (desplegable ordenado alfabéticamente) y explicación. Suma total y gasto medio por día.
  - **Ideas**: texto con clasificación en Turismo o Restauración y filtro.
  - **Notas del viaje**: texto libre.
  - **Resumen de gastos**: desplazamientos + alojamientos + gastos de vida = total del viaje.

## Instalar en el iPhone

1. Abre la URL de la app en **Safari** (no en Chrome: en iPhone solo Safari permite añadir a pantalla de inicio).
2. Pulsa el botón **Compartir** (cuadrado con flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio**.
4. Abre MiRuta desde ese icono. Ya funciona sin conexión.

## Publicarla en GitHub Pages

1. En GitHub, entra en el repositorio → **Settings** → **Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Tras un minuto, la app estará en `https://not-xly.github.io/miruta/`.

## Importante sobre los datos

Los datos se guardan **en el propio dispositivo** (localStorage), no en un servidor:

- Usa siempre el icono de la pantalla de inicio. Safari y la app instalada tienen almacenamientos separados, así que los viajes creados en una no aparecen en la otra.
- Si borras los datos del navegador de Safari, se pierden los viajes.
- Si en el futuro cambias de iPhone, los datos no se transfieren solos.

## Estructura

| Archivo | Función |
| --- | --- |
| `index.html` | Pantallas y estructura |
| `styles.css` | Diseño (modo claro y oscuro, optimizado para iPhone) |
| `app.js` | Lógica, cálculos y guardado local |
| `sw.js` | Service worker: permite el uso sin conexión |
| `manifest.webmanifest` | Datos para instalarla como app |
| `*.png` | Iconos |

Sin dependencias ni build: basta con servir la carpeta en cualquier hosting estático.
