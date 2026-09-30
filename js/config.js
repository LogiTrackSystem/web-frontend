/**
 * Configuración del frontend de LogiTrack.
 *
 * Por defecto apunta al API Gateway (http://localhost:8002).
 * Se puede sobrescribir:
 *  1. Con el parámetro de URL:  ?api=http://192.168.1.20:8002
 *  2. Desde el panel:           ⚙️ Configurar API (botón en la barra lateral)
 */
const CONFIG = {
  API_BASE_URL: "http://localhost:8002",
  // 20 s: holgado para accesos por túnel/red lenta, pero sigue fallando rápido.
  // Las operaciones largas (ETL) manejan su propio timeout en api.js.
  API_TIMEOUT_MS: 20000,
};

(function resolvApiUrl() {
  try {
    const qParams = new URLSearchParams(window.location.search);
    const fromUrl = qParams.get("api");
    if (fromUrl) {
      CONFIG.API_BASE_URL = fromUrl.replace(/\/+$/, "");
      // Persistir el parámetro: si abrís con ?api=..., queda guardado en
      // localStorage y las próximas visitas ya usan esa URL sin repetirlo.
      try {
        localStorage.setItem("logitrack_api_url", CONFIG.API_BASE_URL);
      } catch (_err) {
        /* modo privado o storage bloqueado: se sigue igual */
      }
      return;
    }
    const saved = localStorage.getItem("logitrack_api_url");
    if (saved) {
      CONFIG.API_BASE_URL = saved.replace(/\/+$/, "");
    }
  } catch (_err) {
    /* segui con el valor por defecto */
  }
})();