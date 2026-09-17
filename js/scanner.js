const Scanner = (() => {
  let stream = null;
  let isActive = false;
  let worker = null;
  let tesseractReady = typeof Tesseract !== "undefined";

  const video = document.getElementById("video");
  const canvas = document.getElementById("captureCanvas");
  const placeholder = document.getElementById("cameraPlaceholder");
  const btnStream = document.getElementById("btnStream");
  const btnCapture = document.getElementById("btnCapture");
  const btnRetry = document.getElementById("btnRetry");
  const wrap = document.querySelector(".video-wrap");
  const overlay = document.getElementById("ocrOverlay");
  const ocrStatus = document.getElementById("ocrStatus");

  const COLOR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ";

  async function startCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Tu navegador no permite acceso a la cámara (usa Chrome/Edge).", true);
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      video.classList.add("visible");
      placeholder.classList.add("hidden");
      wrap.classList.add("scanning");
      isActive = true;
      btnCapture.disabled = false;
      btnStream.textContent = "📷 Cámara Activa";
      btnStream.style.background = "#16a34a";
    } catch (err) {
      showToast("Error al activar la cámara: " + err.message, true);
      console.error(err);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.classList.remove("visible");
    placeholder.classList.remove("hidden");
    wrap.classList.remove("scanning");
    isActive = false;
    btnCapture.disabled = true;
    btnStream.textContent = "🔴 Activar Cámara";
    btnStream.style.background = "";
  }

  function captureFrame() {
    if (!isActive || !video.videoWidth) return null;
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return cropPlateRegion(ctx);
  }

  function cropPlateRegion(ctx) {
    // Recorta la región central/inferior donde normalmente va la placa
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    let cx = w * 0.5;
    let cy = h * 0.5;
    let pw = w * 0.85;
    let ph = h * 0.35;
    const sx = Math.max(0, Math.round(cx - pw / 2));
    const sy = Math.max(0, Math.round(cy - ph / 2));
    const sw = Math.min(w - sx, Math.round(pw));
    const sh = Math.min(h - sy, Math.round(ph));
    const data = ctx.getImageData(sx, sy, sw, sh);

    const out = document.createElement("canvas");
    out.width = sw * 2;
    out.height = sh * 2;
    const octx = out.getContext("2d");
    const temp = document.createElement("canvas");
    temp.width = sw;
    temp.height = sh;
    const tctx = temp.getContext("2d");
    tctx.putImageData(preprocess(data), 0, 0);
    octx.imageSmoothingEnabled = true;
    octx.drawImage(temp, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function preprocess(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30);
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    return imageData;
  }

  async function ensureWorker() {
    if (worker) return worker;
    ocrStatus.textContent = "Cargando motor de OCR (primera vez puede tardar)...";
    worker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          ocrStatus.textContent = "Leyendo placa... " + Math.round(m.progress * 100) + "%";
        }
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist: COLOR_WHITELIST,
      preserve_interword_spaces: "0",
    });
    return worker;
  }

  async function recognizePlate() {
    if (!tesseractReady) {
      showToast("Motor OCR no disponible (requiere internet). Ingresa la placa manualmente.", true);
      return "";
    }
    const dataUrl = captureFrame();
    if (!dataUrl) return "";
    overlay.classList.add("visible");
    ocrStatus.textContent = "Analizando placa...";
    try {
      const w = await ensureWorker();
      ocrStatus.textContent = "Leyendo placa...";
      const { data } = await w.recognize(dataUrl);
      const texto = cleanText(data.text);
      overlay.classList.remove("visible");
      return texto;
    } catch (e) {
      console.error(e);
      overlay.classList.remove("visible");
      return "";
    }
  }

  function cleanText(raw) {
    let t = raw.toUpperCase().replace(/[^A-Z0-9\- ]/g, "");
    t = t.replace(/[IV]{1,3}\s+/g, "");
    t = t.replace(/\s+/g, "-");
    t = t.replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
    return t;
  }

  async function capture() {
    if (!isActive) return;
    const placa = await recognizePlate();
    const inpPlaca = document.getElementById("inpPlaca");
    inpPlaca.value = placa || "";
    inpPlaca.dispatchEvent(new Event("input"));
    btnCapture.disabled = true;
    btnRetry.style.display = "inline-block";
    wrap.classList.remove("scanning");
    if (placa) {
      showToast("Placa detectada: " + placa);
    } else {
      showToast("No se pudo leer la placa. Corrígela manualmente.", true);
      inpPlaca.focus();
    }
  }

  function resetForNext() {
    btnCapture.disabled = false;
    if (isActive) wrap.classList.add("scanning");
    btnRetry.style.display = "none";
  }

  btnStream.addEventListener("click", () => {
    if (isActive) stopCamera();
    else startCamera();
  });
  btnCapture.addEventListener("click", capture);
  btnRetry.addEventListener("click", () => {
    resetForNext();
    capture();
  });

  return { isActive: () => isActive, resetForNext };
})();