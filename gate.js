// Turnstile gate: hides and locks the app until verified. Nothing is stored, so it returns on every load.
(function () {
  var passed = false;
  function blockKeys(e) { e.stopImmediatePropagation(); } // app shortcuts listen on document
  function lock(on) {
    for (var el of document.body.children) if (el.id !== 'humanGate') el.inert = on;
  }
  window.addEventListener('keydown', blockKeys, true);
  document.addEventListener('DOMContentLoaded', function () { if (!passed) lock(true); });

  window.onTurnstileSuccess = function () {
    passed = true;
    window.removeEventListener('keydown', blockKeys, true);
    lock(false);
    var gate = document.getElementById('humanGate');
    gate.classList.add('done');
    setTimeout(function () { gate.remove(); }, 400);
  };
})();
