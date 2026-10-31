(() => {
  const zeilen = [];
  const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };

  // **Fehler einsammeln.** Ein geworfener Zuhoerer verschwindet spurlos — und ein Fehler im
  // Bildlauf ist genau das: die Schleife bricht ab, das Bild bleibt stehen, und niemand sagt warum.
  if (!window.__fehlerLog) {
    window.__fehlerLog = [];
    window.addEventListener('error', (e) => window.__fehlerLog.push('error: ' + e.message));
    window.addEventListener('unhandledrejection', (e) => window.__fehlerLog.push('rejection: ' + e.reason));
  }

  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf(welt, 'click');

  return new Promise((fertig) => {
    let runden = 0;
    const pruefen = () => {
      runden += 1;
      if (runden < 30) { requestAnimationFrame(pruefen); return; }

      zeilen.push('viewport: ' + document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight);
      zeilen.push('ansicht: ' + ['screen-chat', 'screen-os', 'screen-web']
        .filter((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); }).join(','));
      zeilen.push('fehler: ' + (window.__fehlerLog.length ? window.__fehlerLog.slice(0, 4).join(' || ') : '(keine)'));

      const canvas = document.getElementById('world');
      const r = canvas.getBoundingClientRect();
      zeilen.push('canvas: ' + Math.round(r.width) + 'x' + Math.round(r.height) + '  sichtbar=' + (r.width > 1 && r.height > 1));

      // **Ist das Canvas gezeichnet?** Ein leerer Rahmen sieht aus wie ein Fehler; ein gefuellter
      // nicht. Deshalb wird die Bildflaeche gelesen und gezaehlt, wie viele Pixel hell sind.
      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const w = canvas.width, h = canvas.height;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let hell = 0, summe = 0;
        for (let i = 0; i < px.length; i += 4) {
          const v = px[i] + px[i + 1] + px[i + 2];
          summe += v;
          if (v > 90) hell += 1;
        }
        zeilen.push('canvas-pixel: ' + w + 'x' + h + '  helle=' + hell + '  mittel=' + Math.round(summe / (px.length / 4) / 3));
      } catch (e) {
        zeilen.push('canvas-pixel: nicht lesbar (' + e.message + ')');
      }

      const labels = [...document.querySelectorAll('.label')];
      const sichtbarLabel = labels.filter((l) => getComputedStyle(l).display !== 'none');
      zeilen.push('beschriftungen: ' + labels.length + ' im Baum, ' + sichtbarLabel.length + ' sichtbar');
      zeilen.push('  namen: ' + sichtbarLabel.slice(0, 12).map((l) => l.textContent.trim()).join(' | '));

      const hud = document.getElementById('hudLine');
      zeilen.push('hud: ' + (hud ? hud.textContent.trim() : 'FEHLT'));

      // Die Zonen des Docks: leer heisst „kein Panel darin" — und ein leerer Streifen sieht aus
      // wie ein Fehler, obwohl er nur die Zone ist.
      for (const zone of ['left', 'right', 'bottom']) {
        const el = document.querySelector('.zone-' + zone);
        if (!el) { zeilen.push('zone-' + zone + ': FEHLT'); continue; }
        const zr = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const kopf = el.querySelector('.panelhead b');
        zeilen.push('zone-' + zone + ': ' + Math.round(zr.width) + 'x' + Math.round(zr.height) +
          ' display=' + cs.display + ' basis=' + cs.flexBasis + ' panel=' + (kopf ? kopf.textContent : '—'));
      }

      fertig(zeilen.join('\n'));
    };
    requestAnimationFrame(pruefen);
  });
})()
