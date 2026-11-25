# Hierro y Colmillo

Estrategia en tiempo real para el navegador: **Humanos contra Orcos**.
Todo el arte y el sonido se generan por código. Sin dependencias ni instalación.

## Jugar
Online: https://gonzalodecastro.github.io/warcrito/

Abrí `index.html` con doble clic (Chrome, Edge o Firefox, con teclado y mouse).

## Qué incluye
- 2 facciones con 6 unidades y 8 edificios cada una, y mejoras de armas, armaduras y proyectiles.
- Oro, madera y alimento; niebla de guerra; minimapa; grupos de control.
- 3 mapas (Valle Verde, El Río Partido, Bosque Cerrado) y rival en Fácil, Normal o Difícil.
- Rasgos propios: los clérigos curan, los chamanes dan Furia; el caballero es más rápido y el ogro más fuerte.

## Controles principales
Clic / arrastrar para seleccionar, clic derecho para ordenar, `A` atacar, `B` construir,
`Ctrl+1..9` grupos, flechas o borde para mover la cámara, rueda para zoom, `F10` pausa.
La lista completa está en "Cómo se juega".

## Código
`js/data.js` (números de balance) · `js/map.js` · `js/sim.js` (reglas) · `js/ai.js` ·
`js/art.js` · `js/render.js` · `js/audio.js` · `js/ui.js`

Prueba sin navegador (computadora contra computadora): `node test/sim-test.js`
