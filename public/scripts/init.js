// Trazabilidad init scripts - combined from layout.tsx inline scripts

// Script 1: Reset logic - clear ALL localStorage if ?reset= is in the URL
(function () {
  try {
    // Silence Puter.js console messages
    window.__puter_quiet = true;
    var p = new URLSearchParams(window.location.search);
    if (p.has('reset')) {
      // NUCLEAR: borrar absolutamente todo localStorage y sessionStorage
      try { localStorage.clear(); } catch (e) { }
      try { sessionStorage.clear(); } catch (e) { }
      // Limpiar caches del navegador
      if ('caches' in window) {
        caches.keys().then(function (names) {
          names.forEach(function (n) { caches.delete(n); });
        }).catch(function () { });
      }
      // Desregistrar service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister(); });
        }).catch(function () { });
      }
      // Limpiar la URL y recargar de forma limpia
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload(true);
    }
  } catch (e) { }
})();

// Script 2: Set global reset flag
if (new URLSearchParams(window.location.search).has('reset')) {
  window.__TRZ_RESET = 1;
}

// Script 3: Version check - force reload if build hash changed
(function () {
  try {
    if (window.__TRZ_VER_CHECKED) return;
    window.__TRZ_VER_CHECKED = true;
    var links = document.querySelectorAll('script[src*="_next"]');
    var hashes = [];
    links.forEach(function (s) { var m = s.src.match(/[a-f0-9]{8,}/); if (m) hashes.push(m[0]); });
    var ver = hashes.join('_');
    var prev = sessionStorage.getItem('_trz_v');
    if (prev && prev !== ver) {
      sessionStorage.setItem('_trz_v', ver);
      window.location.reload(true);
    } else if (!prev) {
      sessionStorage.setItem('_trz_v', ver);
    }
  } catch (e) { }
})();

// Script 4: Force HTML reload via fetch + compare - bypasses CDN cache
(function () {
  try {
    if (window.__TRZ_HTML_CHECKED) return;
    window.__TRZ_HTML_CHECKED = true;
    // Fetch the HTML fresh (bypass browser cache) and check if chunk hashes changed
    fetch(window.location.pathname + '?_trz_check=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        // Extract chunk hashes from the fetched HTML
        var newHashes = (html.match(/chunks\/([a-f0-9]{16})\.js/g) || []).sort().join(',');
        var oldHashes = sessionStorage.getItem('_trz_chunks');
        if (oldHashes && oldHashes !== newHashes) {
          sessionStorage.setItem('_trz_chunks', newHashes);
          // Force hard reload to get new HTML + new chunks
          window.location.reload(true);
        } else if (!oldHashes) {
          sessionStorage.setItem('_trz_chunks', newHashes);
        }
      })
      .catch(function () { });
  } catch (e) { }
})();
