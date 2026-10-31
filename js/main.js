/*
 * Bootstrap. Wait for DOM, then start the setup screen.
 */
window.addEventListener('DOMContentLoaded', function () {
  if (!window.GAME || !GAME.ui) {
    document.body.innerHTML =
      '<pre style="color:#e2475a;padding:20px">Failed to load game modules. Check file paths in index.html.</pre>';
    return;
  }
  GAME.ui.start();
});
