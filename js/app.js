(function () {
  const $ = (id) => document.getElementById(id);

  const inpPlaca = $("inpPlaca");
  const selTipo = $("selTipo");
  const selEstado = $("selEstado");
  const inpTipoOtro = $("inpTipoOtro");
  const fieldTipoOtro = $("fieldTipoOtro");
  const inpVehiculo = $("inpVehiculo");
  const inpRegistrador = $("inpRegistrador");
  const inpResponsable = $("inpResponsable");
  const listaResponsables = $("listaResponsables");
  const listaVehiculos = $("listaVehiculos");
  const listaRegistradores = $("listaRegistradores");
  const placaMsg = $("placaMsg");
  const saveMsg = $("saveMsg");
  const btnSave = $("btnSave");
  const boxDateTime = $("boxDateTime");
  const personsTotal = $("personsTotal");

  const DIA_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  window.showToast = function (msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show" + (isError ? " err" : "");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.className = "toast"), 2600);
  };

  // ===== TABS =====
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      $("view-" + tab).classList.add("active");
      if (tab === "dashboard") {
        window.DashboardRender && window.DashboardRender();
        window.DB && window.DB.refresh().then((cambio) => {
          actualizarEstadoConexion();
          if (cambio) {
            pillarTodos();
            window.DashboardRender && window.DashboardRender();
          }
        });
      }
    });
  });

  // ===== ESTADO DE CONEXIÓN =====
  function actualizarEstadoConexion() {
    const el = document.getElementById("connStatus");
    if (!el) return;
    if (window.DB.isOnline()) {
      el.className = "conn-status online";
      el.textContent = "🟢 En línea · datos compartidos";
      el.title = "Conectado al servidor. Los datos se comparten entre PC y móvil.";
    } else {
      el.className = "conn-status offline";
      el.textContent = "🔴 Sin servidor · datos locales";
      el.title = "No se pudo conectar al servidor. Se guardará localmente.";
    }
  }

  // ===== SINCRONIZACIÓN PERIÓDICA =====
  function iniciarSincronizacion() {
    setInterval(async () => {
      const cambio = await window.DB.refresh();
      actualizarEstadoConexion();
      if (cambio) {
        pillarTodos();
        window.DashboardRender && window.DashboardRender();
      }
    }, 5000);
  }

  // ===== RELOJ =====
  const fmt2 = (n) => String(n).padStart(2, "0");

  function tickClock() {
    const now = new Date();
    $("boxDateTime").querySelector(".big-time").textContent =
      fmt2(now.getHours()) + ":" + fmt2(now.getMinutes()) + ":" + fmt2(now.getSeconds());
    $("boxDateTime").querySelector(".big-date").textContent =
      fmt2(now.getDate()) + "/" + fmt2(now.getMonth() + 1) + "/" + now.getFullYear() +
      " · " + DIA_SEMANA[now.getDay()];
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ===== CONTADORES DE PERSONAS =====
  const personFields = ["adultosHombres", "adultosMujeres", "ninos", "ninas"];

  function updateTotal() {
    const total = personFields.reduce((s, f) => s + (parseInt($(f).value, 10) || 0), 0);
    personsTotal.querySelector("b").textContent = total;
    return total;
  }

  document.querySelectorAll(".counter .plus, .counter .minus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const el = $(field);
      let val = parseInt(el.value, 10) || 0;
      val += btn.classList.contains("plus") ? 1 : -1;
      el.value = Math.max(0, val);
      updateTotal();
    });
  });

  updateTotal();

  // ===== VALIDACIÓN DE PLACA =====
  inpPlaca.addEventListener("input", () => {
    const v = inpPlaca.value.toUpperCase().replace(/[^A-Z0-9\-]/g, "");
    inpPlaca.value = v;
    if (v.length >= 3) {
      const datos = cargarDatos();
      const existe = datos.filter((r) => r.placa === v);
      if (existe.length) {
        placaMsg.textContent = "⚠ Placa ya registrada " + existe.length + " vez/veces";
        placaMsg.classList.remove("ok");
      } else {
        placaMsg.textContent = "";
      }
    } else {
      placaMsg.textContent = "";
    }
  });

  // ===== DATALISTS =====
  function cargarDatos() {
    return window.DB.load();
  }

  function pillarVehiculos() {
    const datos = cargarDatos();
    const unicos = [...new Set(datos.map((r) => r.vehiculo).filter(Boolean))].sort();
    listaVehiculos.innerHTML = unicos.map((v) => `<option value="${v.replace(/"/g, "&quot;")}"></option>`).join("");
  }

  function pillarRegistradores() {
    const datos = cargarDatos();
    const unicos = [...new Set(datos.map((r) => r.registrador).filter(Boolean))].sort();
    listaRegistradores.innerHTML = unicos.map((v) => `<option value="${v.replace(/"/g, "&quot;")}"></option>`).join("");
  }

  function pillarResponsables() {
    const datos = cargarDatos();
    const unicos = [...new Set(datos.map((r) => r.responsable).filter(Boolean))].sort();
    listaResponsables.innerHTML = unicos.map((v) => `<option value="${v.replace(/"/g, "&quot;")}"></option>`).join("");
  }

  function pillarTodos() {
    pillarVehiculos();
    pillarRegistradores();
    pillarResponsables();
  }

  // ===== TIPO DE VEHÍCULO "OTRO" =====
  function toggleTipoOtro() {
    const esOtro = selTipo.value === "Otro";
    fieldTipoOtro.style.display = esOtro ? "flex" : "none";
    if (!esOtro) inpTipoOtro.value = "";
  }
  selTipo.addEventListener("change", toggleTipoOtro);
  toggleTipoOtro();

  // ===== GUARDAR =====
  btnSave.addEventListener("click", () => {
    const placa = inpPlaca.value.trim();
    const tipoSel = selTipo.value;
    const tipoOtro = inpTipoOtro.value.trim();
    const vehiculo = inpVehiculo.value.trim();
    const registrador = inpRegistrador.value.trim();
    const responsable = inpResponsable.value.trim();

    if (!placa) {
      placaMsg.textContent = "⚠ Ingresa el número de placa";
      inpPlaca.focus();
      return;
    }
    if (!tipoSel) {
      showToast("Selecciona el tipo de vehículo.", true);
      selTipo.focus();
      return;
    }
    if (tipoSel === "Otro" && !tipoOtro) {
      showToast("Especifica el tipo de vehículo (opción Otro).", true);
      inpTipoOtro.focus();
      return;
    }
    const tipo = tipoSel === "Otro" ? tipoOtro : tipoSel;
    if (!vehiculo) {
      showToast("Indica el vehículo (marca/modelo).", true);
      inpVehiculo.focus();
      return;
    }
    const estado = selEstado.value;
    if (!estado) {
      showToast("Selecciona el estado de Venezuela.", true);
      selEstado.focus();
      return;
    }
    if (!responsable) {
      showToast("Indica el responsable de la unidad (vehículo).", true);
      inpResponsable.focus();
      return;
    }
    if (!registrador) {
      showToast("Indica quién realiza el registro.", true);
      inpRegistrador.focus();
      return;
    }

    const now = new Date();
    const totalPersonas = personFields.reduce((s, f) => s + (parseInt($(f).value, 10) || 0), 0);

    const registro = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      placa: placa.toUpperCase(),
      tipoVehiculo: tipo,
      vehiculo: vehiculo,
      estado: estado,
      adultosHombres: parseInt($("adultosHombres").value, 10) || 0,
      adultosMujeres: parseInt($("adultosMujeres").value, 10) || 0,
      ninos: parseInt($("ninos").value, 10) || 0,
      ninas: parseInt($("ninas").value, 10) || 0,
      totalPersonas: totalPersonas,
      registrador: registrador,
      responsable: responsable,
      fecha: fmt2(now.getDate()) + "/" + fmt2(now.getMonth() + 1) + "/" + now.getFullYear(),
      hora: fmt2(now.getHours()) + ":" + fmt2(now.getMinutes()) + ":" + fmt2(now.getSeconds()),
      dia: DIA_SEMANA[now.getDay()],
      timestamp: now.toISOString(),
    };

    window.DB.add(registro);
    pillarTodos();

    showToast("✅ Registro guardado: " + registro.placa);
    saveMsg.textContent = "Registro guardado correctamente a las " + registro.hora;
    saveMsg.className = "save-msg ok";
    setTimeout(() => (saveMsg.className = "save-msg"), 3000);

    resetForm();
    Scanner.resetForNext();
  });

  function resetForm() {
    inpPlaca.value = "";
    selTipo.value = "";
    selEstado.value = "";
    inpTipoOtro.value = "";
    toggleTipoOtro();
    inpVehiculo.value = "";
    personFields.forEach((f) => ($(f).value = 0));
    inpResponsable.value = localStorage.getItem("ultimoResponsable") || "";
    inpRegistrador.value = localStorage.getItem("ultimoRegistrador") || "";
    placaMsg.textContent = "";
    updateTotal();
  }

  inpResponsable.addEventListener("change", () => {
    if (inpResponsable.value) localStorage.setItem("ultimoResponsable", inpResponsable.value);
  });

  inpRegistrador.addEventListener("change", () => {
    if (inpRegistrador.value) localStorage.setItem("ultimoRegistrador", inpRegistrador.value);
  });

  // ===== INICIALIZACIÓN =====
  (async function init() {
    inpPlaca.classList.add("placa-input");
    inpResponsable.value = localStorage.getItem("ultimoResponsable") || "";
    inpRegistrador.value = localStorage.getItem("ultimoRegistrador") || "";
    updateTotal();
    await window.DB.init();
    actualizarEstadoConexion();
    pillarTodos();
    window.DashboardRender && window.DashboardRender();
    iniciarSincronizacion();
  })();
})();