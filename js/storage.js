const DB = (() => {
  const API = "/api/registros";
  const KEY = "placas_registros_v1";
  let cache = [];
  let online = false;
  let inicializado = false;

  // ---------- Respaldo local ----------
  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  // ---------- Inicialización ----------
  async function init() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      cache = await res.json();
      online = true;
    } catch (e) {
      cache = loadLocal();
      online = false;
    }
    inicializado = true;
    return online;
  }

  // ---------- Lectura (sincrónica, desde caché) ----------
  function load() {
    return cache;
  }

  function isOnline() {
    return online;
  }

  function isReady() {
    return inicializado;
  }

  // ---------- Escritura ----------
  async function add(registro) {
    cache.push(registro);
    saveLocal();
    if (online) {
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registro),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch (e) {
        online = false;
      }
    }
    return cache;
  }

  async function remove(id) {
    cache = cache.filter((r) => String(r.id) !== String(id));
    saveLocal();
    if (online) {
      try {
        const res = await fetch(API + "/" + encodeURIComponent(id), { method: "DELETE" });
        if (!res.ok) throw new Error("HTTP " + res.status);
      } catch (e) {
        online = false;
      }
    }
    return cache;
  }

  async function clear() {
    const ids = cache.map((r) => r.id);
    cache = [];
    saveLocal();
    if (online) {
      try {
        await Promise.all(ids.map((id) => fetch(API + "/" + encodeURIComponent(id), { method: "DELETE" })));
      } catch (e) {
        online = false;
      }
    }
  }

  // ---------- Sincronización con el servidor ----------
  async function refresh() {
    if (!online) {
      // Intenta reconectar
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const cambio = data.length !== cache.length;
        cache = data;
        online = true;
        return cambio;
      } catch (e) {
        return false;
      }
    }
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const cambio =
        data.length !== cache.length ||
        JSON.stringify(data.map((r) => r.id)) !== JSON.stringify(cache.map((r) => r.id));
      cache = data;
      return cambio;
    } catch (e) {
      online = false;
      return false;
    }
  }

  // ---------- Exportación CSV ----------
  function exportCSV(list) {
    const encabezados = [
      "Placa", "Tipo de Vehiculo", "Vehiculo", "Estado", "Adultos Hombres",
      "Adultos Mujeres", "Ninos", "Ninas", "Total Personas",
      "Responsable", "Operador", "Fecha", "Hora", "Dia"
    ];
    const filas = list.map((r) => [
      r.placa, r.tipoVehiculo, r.vehiculo, r.estado,
      r.adultosHombres, r.adultosMujeres, r.ninos, r.ninas, r.totalPersonas,
      r.responsable, r.registrador, r.fecha, r.hora, r.dia
    ]);
    const csv = [encabezados, ...filas]
      .map((f) => f.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registro_placas_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init, load, add, remove, clear, refresh, isOnline, isReady, exportCSV };
})();

window.DB = DB;