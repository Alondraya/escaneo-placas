(function () {
  const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  // ===== SERVICE WORKER (offline) =====
  if ("serviceWorker" in navigator && isSecure) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then(() => console.log("PWA lista (service worker registrado)."))
        .catch((e) => console.warn("No se pudo registrar el service worker:", e));
    });
  }

  // ===== BOTÓN INSTALAR =====
  const btnInstall = document.getElementById("btnInstall");
  let deferredPrompt = null;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall && !isStandalone) btnInstall.style.display = "inline-flex";
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (btnInstall) btnInstall.style.display = "none";
    if (window.showToast) window.showToast("✅ Aplicación instalada.");
  });

  if (btnInstall) {
    // iOS no dispara beforeinstallprompt: mostramos el botón con instrucciones
    if (isIOS && !isStandalone) btnInstall.style.display = "inline-flex";

    btnInstall.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (window.showToast && outcome === "accepted") {
          window.showToast("Instalando aplicación...");
        }
        deferredPrompt = null;
        btnInstall.style.display = "none";
      } else if (isIOS) {
        alert(
          "Para instalar en iPhone/iPad:\n\n1. Pulsa el botón Compartir de Safari.\n2. Elige 'Añadir a pantalla de inicio'."
        );
      } else {
        alert(
          "Para instalar:\n\nEn Chrome/Edge pulsa el menú (⋮) y elige 'Instalar aplicación' o 'Aplicación'.\n\nNota: debe abrirse desde https:// o localhost."
        );
      }
    });
  }

  // ===== ATAJOS (#scan / #dashboard) =====
  function aplicarHash() {
    const hash = (location.hash || "").replace("#", "");
    if (hash === "dashboard") {
      const btn = document.querySelector('.tab-btn[data-tab="dashboard"]');
      btn && btn.click();
    } else if (hash === "scan") {
      const btn = document.querySelector('.tab-btn[data-tab="scan"]');
      btn && btn.click();
    }
  }
  window.addEventListener("hashchange", aplicarHash);
  window.addEventListener("load", aplicarHash);
})();