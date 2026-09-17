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
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
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
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function imageToCanvas(imgData) {
    const c = document.createElement("canvas");
    c.width = imgData.width;
    c.height = imgData.height;
    c.getContext("2d").putImageData(imgData, 0, 0);
    return c;
  }

  async function ensureWorker() {
    if (worker) return worker;
    ocrStatus.textContent = "Cargando motor OCR (primera vez puede tardar ~30s)...";
    worker = await Tesseract.createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          ocrStatus.textContent = "Leyendo placa... " + Math.round(m.progress * 100) + "%";
        }
      },
    });
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      tessedit_pageseg_mode: "7",
      preserve_interword_spaces: "0",
    });
    return worker;
  }

  // ── Image processing helpers ──

  function toGray(imgData) {
    const d = imgData.data;
    const g = new Uint8ClampedArray(d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      g[i >> 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    return { data: g, width: imgData.width, height: imgData.height };
  }

  function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]]++;
    const total = gray.data.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let threshold = 0;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = i;
      }
    }
    return threshold;
  }

  function binarize(imgData) {
    const gray = toGray(imgData);
    const thresh = otsuThreshold(gray);
    const out = new ImageData(imgData.width, imgData.height);
    const d = out.data;
    const g = gray.data;
    for (let i = 0; i < g.length; i++) {
      const v = g[i] > thresh ? 255 : 0;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    return out;
  }

  function cropRegion(imgData, yRatio, hRatio) {
    const y = Math.floor(imgData.height * yRatio);
    const h = Math.floor(imgData.height * hRatio);
    const c = document.createElement("canvas");
    c.width = imgData.width;
    c.height = h;
    const ctx = c.getContext("2d");
    const tmp = imageToCanvas(imgData);
    ctx.drawImage(tmp, 0, y, imgData.width, h, 0, 0, imgData.width, h);
    const scaled = document.createElement("canvas");
    const newW = imgData.width * 2;
    const newH = h * 2;
    scaled.width = newW;
    scaled.height = newH;
    const sctx = scaled.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(c, 0, 0, newW, newH);
    return scaled;
  }

  function invertCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  function sharpenCanvas(src) {
    const ctx = src.getContext("2d");
    const imgData = ctx.getImageData(0, 0, src.width, src.height);
    const d = imgData.data;
    const w = src.width;
    const out = new ImageData(w, src.height);
    const od = out.data;
    // 3x3 sharpen kernel
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < src.height - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let r = 0, g = 0, b = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4;
            const ki = (ky + 1) * 3 + (kx + 1);
            r += d[idx] * kernel[ki];
            g += d[idx + 1] * kernel[ki];
            b += d[idx + 2] * kernel[ki];
          }
        }
        const oi = (y * w + x) * 4;
        od[oi] = Math.min(255, Math.max(0, r));
        od[oi + 1] = Math.min(255, Math.max(0, g));
        od[oi + 2] = Math.min(255, Math.max(0, b));
        od[oi + 3] = 255;
      }
    }
    src.getContext("2d").putImageData(out, 0, 0);
    return src;
  }

  // ── Plate text cleaning ──

  function cleanPlateText(raw) {
    let t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (t.length > 10) t = t.substring(0, 10);

    // Common OCR confusions for plates
    const fixes = [
      [/[|]/g, "I"], [/[{}]/g, "O"], [/[`]/g, ""],
      [/^0([A-Z])/, "O$1"], // leading O misread as 0
      [/([A-Z])0([A-Z])/, "$1O$2"], // O in letter position
    ];
    for (const [pat, rep] of fixes) t = t.replace(pat, rep);

    // Venezuelan plate patterns
    const patterns = [
      { re: /^([A-Z]{3})(\d{3})$/, type: "3+3" },
      { re: /^([A-Z]{3})(\d{4})$/, type: "3+4" },
      { re: /^([A-Z]{3})(\d{2})$/, type: "3+2" },
      { re: /^([A-Z]{2})(\d{3,4})$/, type: "2+3/4" },
      { re: /^([A-Z]{4})(\d{2,4})$/, type: "4+2/4" },
    ];

    for (const { re } of patterns) {
      const m = t.match(re);
      if (m) return m[1] + "-" + m[2];
    }

    // Fallback: split in middle
    if (t.length >= 3) {
      const mid = Math.ceil(t.length / 2);
      return t.substring(0, mid) + "-" + t.substring(mid);
    }
    return t;
  }

  function isValidPlateFormat(text) {
    return /^[A-Z]{2,4}-?\d{2,4}$/.test(text);
  }

  // ── Core OCR ──

  async function runOCR(canvasEl) {
    const w = await ensureWorker();
    const result = await w.recognize(canvasEl);
    return { text: result.data.text, confidence: result.data.confidence };
  }

  async function recognizePlate() {
    if (!tesseractReady) {
      showToast("Motor OCR no disponible (requiere internet). Ingresa la placa manualmente.", true);
      return "";
    }
    const imgData = captureFrame();
    if (!imgData) return "";
    overlay.classList.add("visible");
    ocrStatus.textContent = "Analizando placa...";
    try {
      await ensureWorker();

      // Try multiple crop regions where plates typically appear
      const crops = [
        { yRatio: 0.40, hRatio: 0.25, label: "zona media" },
        { yRatio: 0.50, hRatio: 0.20, label: "zona baja" },
        { yRatio: 0.35, hRatio: 0.30, label: "zona amplia" },
      ];

      const candidates = [];

      for (const crop of crops) {
        const cropped = cropRegion(imgData, crop.yRatio, crop.hRatio);
        ocrStatus.textContent = "Escaneando " + crop.label + "...";

        // Attempt 1: Binarized (Otsu threshold)
        const binImg = binarize(cropped.getContext("2d").getImageData(0, 0, cropped.width, cropped.height));
        const binCanvas = imageToCanvas(binImg);
        try {
          const r1 = await runOCR(binCanvas);
          const c1 = cleanPlateText(r1.text);
          if (c1) candidates.push({ text: c1, conf: r1.confidence, source: crop.label + "+bin" });
        } catch (e) { /* skip */ }

        // Attempt 2: Sharpened + binarized
        try {
          const sharpCanvas = crop.cloneNode(true);
          sharpCanvas.getContext("2d").drawImage(crop, 0, 0);
          sharpenCanvas(sharpCanvas);
          const sharpImg = sharpCanvas.getContext("2d").getImageData(0, 0, sharpCanvas.width, sharpCanvas.height);
          const sharpBin = binarize(sharpImg);
          const r2 = await runOCR(imageToCanvas(sharpBin));
          const c2 = cleanPlateText(r2.text);
          if (c2) candidates.push({ text: c2, conf: r2.confidence, source: crop.label + "+sharp" });
        } catch (e) { /* skip */ }

        // Attempt 3: Inverted (for dark plates or dark backgrounds)
        try {
          const invCanvas = crop.cloneNode(true);
          invCanvas.getContext("2d").drawImage(crop, 0, 0);
          invertCanvas(invCanvas);
          const invBin = binarize(invCanvas.getContext("2d").getImageData(0, 0, invCanvas.width, invCanvas.height));
          const r3 = await runOCR(imageToCanvas(invBin));
          const c3 = cleanPlateText(r3.text);
          if (c3) candidates.push({ text: c3, conf: r3.confidence, source: crop.label + "+inv" });
        } catch (e) { /* skip */ }

        // Attempt 4: Direct (no binarization) for high contrast images
        try {
          const scaled = document.createElement("canvas");
          scaled.width = cropped.width;
          scaled.height = cropped.height;
          scaled.getContext("2d").drawImage(cropped, 0, 0);
          const r4 = await runOCR(scaled);
          const c4 = cleanPlateText(r4.text);
          if (c4) candidates.push({ text: c4, conf: r4.confidence, source: crop.label + "+raw" });
        } catch (e) { /* skip */ }
      }

      overlay.classList.remove("visible");

      if (candidates.length === 0) return "";

      // Score candidates: prefer valid plate format, then higher confidence
      candidates.sort((a, b) => {
        const aValid = isValidPlateFormat(a.text) ? 1000 : 0;
        const bValid = isValidPlateFormat(b.text) ? 1000 : 0;
        return (bValid + b.conf) - (aValid + a.conf);
      });

      // Check if top candidates agree (more reliable)
      const top = candidates[0];
      const agreementCount = candidates.filter((c) => c.text === top.text).length;

      if (agreementCount >= 2 || (isValidPlateFormat(top.text) && top.conf > 40)) {
        ocrStatus.textContent = "Placa detectada: " + top.text;
        return top.text;
      }

      // If only one candidate with decent confidence
      if (top.conf > 30) {
        ocrStatus.textContent = "Posible placa: " + top.text;
        return top.text;
      }

      return "";
    } catch (e) {
      console.error("OCR error:", e);
      overlay.classList.remove("visible");
      return "";
    }
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
      showToast("Placa detectada: " + placa + " (verifica si es correcta)");
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
