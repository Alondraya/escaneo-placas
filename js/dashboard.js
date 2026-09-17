(function () {
  const $ = (id) => document.getElementById(id);

  const COLORS = {
    "Moto": "#60a5fa",
    "Carro (Sedan)": "#34d399",
    "SUV / Camioneta": "#fbbf24",
    "Camión": "#f472b6",
    "Bus / Van": "#a78bfa",
    "Encava": "#f43f5e",
    "Iveco": "#38bdf8",
    "Otro": "#94a3b8",
  };

  let chartTipo = null;
  let chartPersonas = null;
  let chartVehiculo = null;
  let chartEstado = null;

  const PALETA_VEHICULOS = [
    "#3b82f6", "#ef4444", "#fbbf24", "#22c55e", "#a78bfa",
    "#14b8a6", "#f97316", "#ec4899", "#84cc16", "#06b6d4",
  ];

  const PALETA_ESTADOS = [
    "#3b82f6", "#ef4444", "#fbbf24", "#22c55e", "#a78bfa", "#14b8a6",
    "#f97316", "#ec4899", "#84cc16", "#06b6d4", "#8b5cf6", "#eab308",
    "#10b981", "#f43f5e", "#0ea5e9", "#d946ef", "#84cc16", "#fb923c",
    "#22d3ee", "#a3e635", "#f87171", "#c084fc", "#38bdf8", "#facc15",
  ];

  // ===== OBTENER DATOS FILTRADOS =====
  function getFiltros() {
    const q = $("filtroBusqueda").value.trim().toLowerCase();
    const tipo = $("filtroTipo").value;
    const estado = $("filtroEstado").value;
    const desde = $("filtroDesde").value;
    const hasta = $("filtroHasta").value;
    return { q, tipo, estado, desde, hasta };
  }

  function aplicarFiltros(list) {
    const f = getFiltros();
    return list.filter((r) => {
      if (f.tipo && r.tipoVehiculo !== f.tipo) return false;
      if (f.estado && r.estado !== f.estado) return false;
      if (f.q) {
        const hay =
          (r.placa || "").toLowerCase().includes(f.q) ||
          (r.vehiculo || "").toLowerCase().includes(f.q) ||
          (r.estado || "").toLowerCase().includes(f.q) ||
          (r.responsable || "").toLowerCase().includes(f.q) ||
          (r.registrador || "").toLowerCase().includes(f.q);
        if (!hay) return false;
      }
      if (f.desde || f.hasta) {
        const [d, m, y] = r.fecha.split("/").map(Number);
        const ts = new Date(y, m - 1, d);
        if (f.desde) {
          const dd = f.desde.split("-").map(Number);
          if (ts < new Date(dd[0], dd[1] - 1, dd[2])) return false;
        }
        if (f.hasta) {
          const hh = f.hasta.split("-").map(Number);
          if (ts > new Date(hh[0], hh[1] - 1, hh[2])) return false;
        }
      }
      return true;
    });
  }

  // ===== FILTRO DE TIPO DINÁMICO =====
  function refreshTipoFilter(list) {
    const sel = $("filtroTipo");
    const actual = sel.value;
    const base = ["Moto", "Carro (Sedan)", "SUV / Camioneta", "Camión", "Bus / Van", "Encava", "Iveco", "Otro"];
    const personalizados = [...new Set(list.map((r) => r.tipoVehiculo).filter(Boolean))]
      .filter((t) => !base.includes(t))
      .sort();
    const opciones = base.concat(personalizados);
    sel.innerHTML =
      `<option value="">Todos los tipos</option>` +
      opciones.map((t) => `<option>${t}</option>`).join("");
    if (opciones.includes(actual) || actual === "") sel.value = actual;
  }

  // ===== ESTADÍSTICAS =====
  function renderStats(data) {
    const totalPlacas = data.length;
    const totalPersonas = data.reduce((s, r) => s + r.totalPersonas, 0);
    const hombres = data.reduce((s, r) => s + (r.adultosHombres || 0), 0);
    const mujeres = data.reduce((s, r) => s + (r.adultosMujeres || 0), 0);
    const ninos = data.reduce((s, r) => s + (r.ninos || 0), 0);
    const ninas = data.reduce((s, r) => s + (r.ninas || 0), 0);

    $("statTotalPlacas").textContent = totalPlacas;
    $("statTotalPersonas").textContent = totalPersonas;
    $("statHombres").textContent = hombres;
    $("statMujeres").textContent = mujeres;
    $("statNinos").textContent = ninos;
    $("statNinas").textContent = ninas;
  }

  // ===== GRÁFICOS =====
  function renderTipoChart(data) {
    const conteo = {};
    data.forEach((r) => (conteo[r.tipoVehiculo] = (conteo[r.tipoVehiculo] || 0) + 1));
    const labels = Object.keys(conteo);
    const valores = Object.values(conteo);
    const colores = labels.map((l, i) => COLORS[l] || PALETA_ESTADOS[i % PALETA_ESTADOS.length]);

    if (chartTipo) chartTipo.destroy();
    chartTipo = new Chart($("chartTipo"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: valores, backgroundColor: colores, borderWidth: 2, borderColor: "#1e293b" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#e2e8f0" } },
          title: { display: false },
        },
      },
    });
  }

  function renderPersonasChart(data) {
    const hombres = data.reduce((s, r) => s + (r.adultosHombres || 0), 0);
    const mujeres = data.reduce((s, r) => s + (r.adultosMujeres || 0), 0);
    const ninos = data.reduce((s, r) => s + (r.ninos || 0), 0);
    const ninas = data.reduce((s, r) => s + (r.ninas || 0), 0);

    if (chartPersonas) chartPersonas.destroy();
    chartPersonas = new Chart($("chartPersonas"), {
      type: "doughnut",
      data: {
        labels: ["Hombres", "Mujeres", "Niños", "Niñas"],
        datasets: [{
          data: [hombres, mujeres, ninos, ninas],
          backgroundColor: ["#60a5fa", "#f472b6", "#fbbf24", "#a78bfa"],
          borderWidth: 2, borderColor: "#1e293b",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#e2e8f0" } },
        },
      },
    });
  }

  function renderVehiculoChart(data) {
    const conteo = {};
    data.forEach((r) => (conteo[r.vehiculo] = (conteo[r.vehiculo] || 0) + 1));
    const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const labels = entradas.map((e) => e[0]);
    const valores = entradas.map((e) => e[1]);

    if (chartVehiculo) chartVehiculo.destroy();
    chartVehiculo = new Chart($("chartVehiculo"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Registros",
          data: valores,
          backgroundColor: labels.map((_, i) => PALETA_VEHICULOS[i % PALETA_VEHICULOS.length]),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "#1e293b" }, beginAtZero: true },
        },
      },
    });
  }

  function renderEstadoChart(data) {
    const conteo = {};
    data.forEach((r) => {
      const e = r.estado || "Sin estado";
      conteo[e] = (conteo[e] || 0) + 1;
    });
    const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    const labels = entradas.map((e) => e[0]);
    const valores = entradas.map((e) => e[1]);

    if (chartEstado) chartEstado.destroy();
    chartEstado = new Chart($("chartEstado"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Registros",
          data: valores,
          backgroundColor: labels.map((_, i) => PALETA_ESTADOS[i % PALETA_ESTADOS.length]),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
          y: { ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "#1e293b" }, beginAtZero: true },
        },
      },
    });
  }

  // ===== TABLA =====
  function renderTabla(data) {
    const tbody = $("tbodyRegistros");
    if (!data.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="14">Sin registros. <br>Usa la pestaña "Escanear / Registrar" para cargar placas.</td></tr>`;
      return;
    }
    tbody.innerHTML = data
      .slice()
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .map(
        (r) => `
        <tr>
          <td><span class="plate-chip">${esc(r.placa)}</span></td>
          <td><span class="tipo-badge">${esc(r.tipoVehiculo)}</span></td>
          <td>${esc(r.vehiculo)}</td>
          <td><span class="tipo-badge">${esc(r.estado || "-")}</span></td>
          <td>${n(r.adultosHombres)}</td>
          <td>${n(r.adultosMujeres)}</td>
          <td>${n(r.ninos)}</td>
          <td>${n(r.ninas)}</td>
          <td><b>${n(r.totalPersonas)}</b></td>
          <td>${esc(r.responsable || "-")}</td>
          <td>${esc(r.registrador)}</td>
          <td>${esc(r.fecha)}</td>
          <td>${esc(r.hora)}</td>
          <td><button class="btn-danger-sm" data-id="${esc(r.id)}" title="Eliminar">🗑</button></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll(".btn-danger-sm").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("¿Eliminar el registro de la placa " + btn.parentElement.parentElement.querySelector(".plate-chip").textContent + "?")) {
          window.DB.remove(btn.dataset.id);
          showToast("Registro eliminado.");
          render();
        }
      });
    });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const n = (v) => Number(v) || 0;

  // ===== RENDER PRINCIPAL =====
  function render() {
    const todos = window.DB.load();
    const data = aplicarFiltros(todos);
    refreshTipoFilter(todos);
    renderStats(data);
    renderTabla(data);

    if (typeof Chart === "undefined") {
      const aviso = document.getElementById("chartAviso");
      if (aviso) aviso.style.display = "block";
      return;
    }
    const aviso = document.getElementById("chartAviso");
    if (aviso) aviso.style.display = "none";
    safeChart(renderTipoChart, data);
    safeChart(renderPersonasChart, data);
    safeChart(renderVehiculoChart, data);
    safeChart(renderEstadoChart, data);
  }

  function safeChart(fn, data) {
    try {
      fn(data);
    } catch (e) {
      console.error("Error al renderizar gráfico:", e);
      const aviso = document.getElementById("chartAviso");
      if (aviso) aviso.style.display = "block";
    }
  }

  // ===== EVENTOS DE FILTROS =====
  ["filtroBusqueda", "filtroTipo", "filtroEstado", "filtroDesde", "filtroHasta"].forEach((id) => {
    $(id).addEventListener("input", () => render());
  });

  $("btnExportCsv").addEventListener("click", () => {
    const data = aplicarFiltros(window.DB.load());
    if (!data.length) {
      showToast("No hay registros para exportar.", true);
      return;
    }
    window.DB.exportCSV(data);
    showToast("CSV exportado (" + data.length + " registros).");
  });

  window.DashboardRender = render;
})();