# shaileshmaddikera.github.io

My personal site, live at **https://shaileshmaddikera.github.io**.

Hand-built: plain HTML, CSS and JavaScript with no build step. GitHub Pages serves this folder as-is.
The opening title is a real-time 3D scene in [Three.js](https://threejs.org) (r160, MIT, in `assets/vendor/three`), using the Cinzel typeface (SIL OFL 1.1, `assets/fonts`). Browsers without WebGL get a 2D version of the intro.

- `index.html`: the page
- `assets/style.css`: design tokens (light and dark), layout and animations
- `assets/intro3d.js`: the 3D title (one camera shot per letter)
- `assets/main.js`: the 2D fallback intro, hero dot field, scroll reveals and the ⌘K quick menu
- `?nointro` skips the intro (handy for screenshots). Links to a section, like `/#work`, skip it too.

Run it locally with `python3 -m http.server`, then open http://localhost:8000.
