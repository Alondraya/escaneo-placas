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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
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
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
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

      const img = new Image();
      img.src = dataUrl;
      await new Promise((r) => (img.onload = r));

      const cropCanvas = document.createElement("canvas");
      const cw = img.width;
      const ch = Math.round(img.height * 0.35);
      const cy = Math.round(img.height * 0.35);
      cropCanvas.width = cw;
      cropCanvas.height = ch;
      const cctx = cropCanvas.getContext("2d");
      cctx.drawImage(img, 0, cy, cw, ch, 0, 0, cw, ch);

      const enhanced = enhanceForOCR(cropCanvas);
      const { data } = await w.recognize(enhanced.toDataURL("image/png"));
      const texto = cleanPlateText(data.text);
      overlay.classList.remove("visible");
      return texto;
    } catch (e) {
      console.error(e);
      overlay.classList.remove("visible");
      return "";
    }
  }

  function enhanceForOCR(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const out = document.createElement("canvas");
    out.width = w * 2;
    out.height = h * 2;
    const ctx = out.getContext("2d");

    ctx.filter = "contrast(1.8) brightness(1.1)";
    ctx.drawImage(srcCanvas, 0, 0, out.width, out.height);
    ctx.filter = "none";

    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const bw = gray > 140 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  function cleanPlateText(raw) {
    let t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (t.length > 8) t = t.substring(0, 8);
    if (t.length >= 3) {
      const patterns = [
        /^([A-Z]{3})(\d{3})$/,
        /^([A-Z]{3})(\d{2})$/,
        /^([A-Z]{3})(\d{4})$/,
        /^([A-Z]{2,4})(\d{2,4})$/,
      ];
      for (const p of patterns) {
        const m = t.match(p);
        if (m) return m[1] + "-" + m[2];
      }
    }
    if (t.length >= 3) {
      const mid = Math.ceil(t.length / 2);
      return t.substring(0, mid) + "-" + t.substring(mid);
    }
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
      showToast("Placa detectada: " + placa + " (corrígela si es necesario)");
      inpPlaca.focus();
      inpPlaca.select();
    } else {
      showToast("No se pudo leer la placa. Escríbela manualmente.", true);
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