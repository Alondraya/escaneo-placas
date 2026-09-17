const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, "..");
const DB_FILE = process.env.DB_PATH || path.join(__dirname, "placas.db");

// Crear directorio de la base de datos si no existe
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ================= BASE DE DATOS =================
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS registros (
    id TEXT PRIMARY KEY,
    placa TEXT NOT NULL,
    tipoVehiculo TEXT,
    vehiculo TEXT,
    estado TEXT,
    adultosHombres INTEGER DEFAULT 0,
    adultosMujeres INTEGER DEFAULT 0,
    ninos INTEGER DEFAULT 0,
    ninas INTEGER DEFAULT 0,
    totalPersonas INTEGER DEFAULT 0,
    registrador TEXT,
    responsable TEXT,
    fecha TEXT,
    hora TEXT,
    dia TEXT,
    timestamp TEXT
  );
`);

const CAMPOS = [
  "id", "placa", "tipoVehiculo", "vehiculo", "estado",
  "adultosHombres", "adultosMujeres", "ninos", "ninas", "totalPersonas",
  "registrador", "responsable", "fecha", "hora", "dia", "timestamp",
];

const CAMPOS_NUMERICOS = ["adultosHombres", "adultosMujeres", "ninos", "ninas", "totalPersonas"];

const INSERT_SQL = `
  INSERT INTO registros (${CAMPOS.join(", ")})
  VALUES (${CAMPOS.map(() => "?").join(", ")})
  ON CONFLICT(id) DO UPDATE SET
    ${CAMPOS.filter((c) => c !== "id").map((c) => `${c}=excluded.${c}`).join(", ")}
`;

// node:sqlite finaliza los statements reutilizados, por eso se preparan por operación.
function getAll() {
  return db.prepare(`SELECT * FROM registros ORDER BY timestamp DESC`).all().map(toClient);
}
function insertRegistro(reg) {
  db.prepare(INSERT_SQL).run(...CAMPOS.map((c) => reg[c] ?? ""));
}
function deleteRegistro(id) {
  db.prepare(`DELETE FROM registros WHERE id = ?`).run(id);
}
function contar() {
  return db.prepare(`SELECT COUNT(*) AS n FROM registros`).get().n;
}

// ================= UTILIDADES =================
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        const limpio = data.replace(/^\uFEFF/, "").trim();
        resolve(limpio ? JSON.parse(limpio) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function toClient(row) {
  const obj = {};
  CAMPOS.forEach((c) => (obj[c] = row[c] ?? null));
  return obj;
}

// ================= API =================
async function handleApi(req, res, url) {
  const partes = url.pathname.split("/").filter(Boolean); // ["api","registros", id?]

  if (url.pathname === "/api/health") {
    return sendJSON(res, 200, { status: "ok", total: contar() });
  }

  if (partes[1] === "registros") {
    const id = partes[2] ? decodeURIComponent(partes[2]) : null;

    if (req.method === "GET" && !id) {
      return sendJSON(res, 200, getAll());
    }

    if (req.method === "POST" && !id) {
      try {
        const body = await readBody(req);
        if (!body.id) body.id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        if (!body.placa) return sendJSON(res, 400, { error: "La placa es obligatoria" });
        CAMPOS.forEach((c) => {
          if (c === "id") return;
          if (body[c] === undefined || body[c] === null || body[c] === "") {
            body[c] = CAMPOS_NUMERICOS.includes(c) ? 0 : "";
          }
          if (CAMPOS_NUMERICOS.includes(c)) body[c] = Number(body[c]) || 0;
        });
        insertRegistro(body);
        return sendJSON(res, 201, { ok: true, id: body.id });
      } catch (e) {
        return sendJSON(res, 400, { error: "Error al guardar: " + e.message });
      }
    }

    if (req.method === "DELETE" && id) {
      deleteRegistro(id);
      return sendJSON(res, 200, { ok: true });
    }
  }

  return sendJSON(res, 404, { error: "No encontrado" });
}

// ================= SERVIDOR =================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }

  // Archivos estáticos
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.join(ROOT, rel);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Prohibido");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No encontrado");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  Object.values(interfaces).forEach((list) =>
    (list || []).forEach((i) => {
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
    })
  );

  console.log("==================================================");
  console.log("  CONTROL DE PLACAS - Servidor con SQLite");
  console.log("==================================================");
  console.log("  Base de datos: " + DB_FILE);
  console.log("  Registros actuales: " + contar());
  console.log("");
  console.log("  En esta PC   -> http://localhost:" + PORT);
  ips.forEach((ip) => console.log("  En el movil  -> http://" + ip + ":" + PORT));
  console.log("");
  console.log("  (La cámara en el móvil requiere HTTPS. Ver notas.)");
  console.log("  Para detener: Ctrl+C");
  console.log("==================================================");
});
