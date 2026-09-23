/**
 * LogiTrack — Panel de gestión
 * SPA en vanilla JS (sin build) que consume el API Gateway (FastAPI).
 */
"use strict";

/* ==================================================================
   1. Utilidades
   ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const shortId = (id) => (id ? String(id).slice(0, 8) : "—");
const fmtNum = (n) => (n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("es-AR"));
const fmtFecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtFechaHora = (iso) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function conTiempo(promise, ms = 400) {
  // Usado para dejar ver el spinner al menos un instante en cargas rápidas
  const delay = new Promise((r) => setTimeout(r, ms));
  const [result] = await Promise.all([promise, delay]);
  return result;
}

/* ==================================================================
   2. Constantes de dominio
   ================================================================== */

const ENVIO_ESTADOS = {
  pendiente: { label: "Pendiente", cls: "neutral" },
  en_transito: { label: "En tránsito", cls: "info" },
  con_incidencia: { label: "Con incidencia", cls: "warn" },
  devuelto: { label: "Devuelto", cls: "danger" },
  entregado: { label: "Entregado", cls: "success" },
};

const VEHICULO_TIPOS = ["Camión", "Camioneta", "Furgón", "Moto", "Trailer", "Utilitario"];
const VEHICULO_ESTADOS = {
  active: { label: "Activo", cls: "success" },
  inactive: { label: "Inactivo", cls: "neutral" },
  mantenimiento: { label: "Mantenimiento", cls: "warn" },
};
const CONDUCTOR_ESTADOS = {
  available: { label: "Disponible", cls: "success" },
  in_route: { label: "En ruta", cls: "info" },
  off: { label: "Fuera de servicio", cls: "neutral" },
};

const estadoBadge = (map, estado) => {
  const info = map[estado] || { label: estado || "—", cls: "neutral" };
  return `<span class="badge ${info.cls}"><span class="dot"></span>${escapeHtml(info.label)}</span>`;
};

/* ==================================================================
   3. Estado global
   ================================================================== */

const state = {
  view: "dashboard",
  vehicles: [],
  drivers: [],
  shipments: [],
  filtros: { estado: "", cliente_id: "" },
  envioSeleccionadoId: null,
  envioDetalle: null,
  envioEventos: [],
};

/* ==================================================================
   4. Helpers de UI
   ================================================================== */

function toast(msg, type = "info") {
  const container = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-msg">${escapeHtml(msg)}</span><button class="t-close" type="button" aria-label="Cerrar">×</button>`;
  container.appendChild(el);
  el.querySelector(".t-close").addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), 5000);
}

function openModal({ title, body, footer }) {
  $("#modal-root").innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
      </div>
    </div>`;
  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  const firstField = $("#modal-root input, #modal-root select, #modal-root textarea");
  if (firstField) setTimeout(() => firstField.focus(), 60);
}

function closeModal() {
  $("#modal-root").innerHTML = "";
}

function spinnerHtml() {
  return `<div class="spinner" role="status" aria-label="Cargando"></div>`;
}

function emptyState(emoji, text) {
  return `<div class="state-box"><span class="emoji">${emoji}</span>${escapeHtml(text)}</div>`;
}

/* ==================================================================
   5. Navegación
   ================================================================== */

const VIEWS = {
  dashboard: { title: "Dashboard", subtitle: "Resumen del sistema LogiTrack", render: renderDashboard, action: null },
  vehiculos: { title: "Vehículos", subtitle: "Flota de LogiTrack", render: renderVehiculos, action: { label: "＋ Nuevo vehículo", fn: modalNuevoVehiculo } },
  conductores: { title: "Conductores", subtitle: "Equipo de conducción", render: renderConductores, action: { label: "＋ Nuevo conductor", fn: modalNuevoConductor } },
  envios: { title: "Envíos", subtitle: "Ciclo de vida de los envíos", render: renderEnvios, action: { label: "＋ Nuevo envío", fn: modalNuevoEnvio } },
};

async function navigate(view, opts = {}) {
  if (opts.envioId !== undefined) {
    state.envioSeleccionadoId = opts.envioId;
  }
  if (opts.limpiarFiltros) {
    state.filtros = { estado: "", cliente_id: "" };
    state.envioSeleccionadoId = null;
  }
  state.view = view;
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.nav === view));

  const def = VIEWS[view];
  $("#view-title").textContent = def.title;
  $("#view-subtitle").textContent = def.subtitle;
  const actions = $("#topbar-actions");
  actions.innerHTML = "";
  if (def.action) {
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.type = "button";
    b.textContent = def.action.label;
    b.addEventListener("click", def.action.fn);
    actions.appendChild(b);
  }

  $("#view").innerHTML = spinnerHtml();
  try {
    await def.render();
  } catch (err) {
    $("#view").innerHTML = emptyState("⚠️", err.message || "Ocurrió un error inesperado");
    if (!(err instanceof ApiError)) console.error(err);
  }
  closeSidebarMobile();
}

/* ==================================================================
   6. Chequeo de salud de la API
   ================================================================== */

async function checkHealth() {
  const el = $("#api-status");
  const txt = $("#api-status-text");
  try {
    const h = await healthGateway();
    el.className = "api-status ok";
    txt.textContent = `API OK · ${h.service || "gateway"}`;
  } catch (err) {
    el.className = "api-status err";
    txt.textContent = `Sin API · ${CONFIG.API_BASE_URL}`;
  }
}

function modalConfigApi() {
  openModal({
    title: "Configurar API",
    body: `
      <div class="form-grid">
        <div class="field full">
          <label for="cfg-api-url">URL del API Gateway</label>
          <input id="cfg-api-url" type="url" value="${escapeHtml(CONFIG.API_BASE_URL)}" placeholder="http://localhost:8002" />
          <div class="hint">Ej.: http://localhost:8002 (local) o la IP de la máquina que corre el gateway.</div>
        </div>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn btn-primary" data-action="save-api-config">Guardar</button>`,
  });
}

/* ==================================================================
   7. Dashboard
   ================================================================== */

async function renderDashboard() {
  const [vehicles, drivers, shipments] = await conTiempo(
    Promise.all([listVehiculos(), listConductores(), listarEnvios()]).catch((err) => {
      throw err;
    })
  );
  state.vehicles = vehicles;
  state.drivers = drivers;
  state.shipments = shipments;

  const cuenta = (estado) => shipments.filter((s) => s.estado === estado).length;
  const total = shipments.length;

  const kpis = [
    { icon: "📦", cls: "purple", value: total, label: "Envíos totales" },
    { icon: "⏳", cls: "amber", value: cuenta("pendiente"), label: "Pendientes" },
    { icon: "🚚", cls: "blue", value: cuenta("en_transito"), label: "En tránsito" },
    { icon: "✅", cls: "green", value: cuenta("entregado"), label: "Entregados" },
    { icon: "🚛", cls: "blue", value: vehicles.length, label: "Vehículos" },
    { icon: "🧑‍✈️", cls: "green", value: drivers.length, label: "Conductores" },
  ];

  const kpiHtml = kpis
    .map(
      (k) => `
      <div class="kpi">
        <div class="kpi-icon ${k.cls}">${k.icon}</div>
        <div>
          <div class="kpi-value">${fmtNum(k.value)}</div>
          <div class="kpi-label">${k.label}</div>
        </div>
      </div>`
    )
    .join("");

  // Distribución por estado
  const orden = ["pendiente", "en_transito", "con_incidencia", "devuelto", "entregado"];
  const barras = orden
    .filter((e) => ENVIO_ESTADOS[e])
    .map((e) => {
      const n = cuenta(e);
      const pct = total ? Math.round((n / total) * 100) : 0;
      const info = ENVIO_ESTADOS[e];
      const colores = {
        neutral: "#94a3b8",
        info: "#0284c7",
        warn: "#d97706",
        danger: "#dc2626",
        success: "#16a34a",
      };
      return `
        <div class="estado-bar">
          <div class="row">
            <span class="lbl">${info.label}</span>
            <span><strong>${n}</strong> · ${pct}%</span>
          </div>
          <div class="track"><div class="fill" style="width:${pct}%;background:${colores[info.cls]}"></div></div>
        </div>`;
    })
    .join("");

  // Últimos envíos
  const recientes = shipments.slice(0, 5);
  const tablaHtml = recientes.length
    ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>ID</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Peso</th></tr></thead>
        <tbody>
          ${recientes
            .map(
              (s) => `
            <tr class="clickable" data-action="open-envio" data-id="${escapeHtml(s.id)}">
              <td>${fmtFecha(s.creado_en)}</td>
              <td class="number">${shortId(s.id)}</td>
              <td>${escapeHtml(s.origen)}</td>
              <td>${escapeHtml(s.destino)}</td>
              <td>${estadoBadge(ENVIO_ESTADOS, s.estado)}</td>
              <td class="number">${fmtNum(s.peso_kg)} kg</td>
            </tr>`
            )
            .join("")}
        </tbody></table></div>`
    : emptyState("📭", "Todavía no hay envíos. Creá el primero desde la pestaña Envíos.");

  $("#view").innerHTML = `
    <div class="kpis">${kpiHtml}</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <div><h2>Envíos por estado</h2><div class="sub">Distribución actual de la flota de envíos</div></div>
        </div>
        <div class="card-body">${total ? `<div class="estado-bars">${barras}</div>` : emptyState("📊", "Sin datos aún.")}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div><h2>Últimos envíos</h2><div class="sub">Clic para ver el detalle</div></div>
          <button type="button" class="btn btn-ghost" data-action="go-envios">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">${tablaHtml}</div>
      </div>
    </div>`;
}

/* ==================================================================
   8. Vehículos
   ================================================================== */

async function renderVehiculos() {
  const vehicles = await conTiempo(listVehiculos());
  state.vehicles = vehicles;

  if (!vehicles.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🚛", "No hay vehículos registrados. Cargá el primero con el botón «Nuevo vehículo».")}</div></div>`;
    return;
  }

  const rows = vehicles
    .map((v) => `
      <tr>
        <td><strong>${escapeHtml(v.placa)}</strong></td>
        <td>${escapeHtml(v.tipo)}</td>
        <td class="number">${fmtNum(v.capacidad_kg)} kg</td>
        <td class="number">${fmtNum(v.capacidad_m3)} m³</td>
        <td>${v.anio ? escapeHtml(v.anio) : "—"}</td>
        <td>${fmtFecha(v.vencimiento_seguro)}</td>
        <td>${estadoBadge(VEHICULO_ESTADOS, v.estado)}</td>
        <td>${v.capacidad_refrigeracion ? "❄️ Sí" : "No"}</td>
        <td>${v.certificado_hazmat ? "⚠️ Sí" : "No"}</td>
      </tr>`)
    .join("");

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Flota (${vehicles.length})</h2><div class="sub">${vehicles.filter((v) => v.estado === "active").length} activos</div></div>
        <button type="button" class="btn btn-ghost" data-action="reload-view">↻ Recargar</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Placa</th><th>Tipo</th><th>Capacidad</th><th>Volumen</th><th>Año</th>
          <th>Seguro vence</th><th>Estado</th><th>Refrig.</th><th>Hazmat</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function modalNuevoVehiculo() {
  openModal({
    title: "Nuevo vehículo",
    body: `
      <form id="nuevo-vehiculo" data-form="nuevo-vehiculo">
        <div class="form-grid">
          <div class="field"><label for="v-placa">Placa <span class="req">*</span></label>
            <input id="v-placa" name="placa" maxlength="10" required placeholder="ABC-123" /></div>
          <div class="field"><label for="v-tipo">Tipo <span class="req">*</span></label>
            <input id="v-tipo" name="tipo" list="tipos-vehiculo" required placeholder="Camión" />
            <datalist id="tipos-vehiculo">${VEHICULO_TIPOS.map((t) => `<option value="${t}">`).join("")}</datalist></div>
          <div class="field"><label for="v-capkg">Capacidad (kg) <span class="req">*</span></label>
            <input id="v-capkg" name="capacidad_kg" type="number" step="0.01" min="1" required placeholder="5000" /></div>
          <div class="field"><label for="v-capm3">Capacidad (m³)</label>
            <input id="v-capm3" name="capacidad_m3" type="number" step="0.01" min="0" placeholder="20" /></div>
          <div class="field"><label for="v-anio">Año</label>
            <input id="v-anio" name="anio" type="number" min="1980" max="2030" placeholder="2024" /></div>
          <div class="field"><label for="v-seguro">Vencimiento del seguro</label>
            <input id="v-seguro" name="vencimiento_seguro" type="date" /></div>
          <div class="field"><label for="v-estado">Estado</label>
            <select id="v-estado" name="estado">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="mantenimiento">Mantenimiento</option>
            </select></div>
          <div class="field"><label>Especificaciones</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="capacidad_refrigeracion" /> ❄️ Refrigeración</label>
              <label><input type="checkbox" name="certificado_hazmat" /> ⚠️ Hazmat</label>
            </div></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="nuevo-vehiculo">Guardar vehículo</button>`,
  });
}

async function submitNuevoVehiculo(form) {
  const fd = new FormData(form);
  const payload = {
    placa: String(fd.get("placa") || "").trim().toUpperCase(),
    tipo: String(fd.get("tipo") || "").trim(),
    capacidad_kg: parseFloat(fd.get("capacidad_kg")),
    capacidad_m3: fd.get("capacidad_m3") ? parseFloat(fd.get("capacidad_m3")) : null,
    anio: fd.get("anio") ? parseInt(fd.get("anio"), 10) : null,
    vencimiento_seguro: fd.get("vencimiento_seguro") || null,
    estado: fd.get("estado") || "active",
    capacidad_refrigeracion: fd.has("capacidad_refrigeracion"),
    certificado_hazmat: fd.has("certificado_hazmat"),
  };
  try {
    const creado = await crearVehiculo(payload);
    closeModal();
    toast(`Vehículo ${creado.placa} creado correctamente`, "success");
    renderVehiculos().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   9. Conductores
   ================================================================== */

async function renderConductores() {
  const drivers = await conTiempo(listConductores());
  state.drivers = drivers;

  if (!drivers.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🧑‍✈️", "No hay conductores registrados. Cargá el primero con el botón «Nuevo conductor».")}</div></div>`;
    return;
  }

  const vehiculoPorId = new Map(state.vehicles.map((v) => [v.id, v]));

  const rows = drivers
    .map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td class="number">${escapeHtml(c.licencia_numero)}</td>
        <td>${escapeHtml(c.categorias_licencia || "—")}</td>
        <td>${c.certificacion_hazmat ? "⚠️ Sí" : "No"}</td>
        <td>${c.vehiculo_id ? (vehiculoPorId.get(c.vehiculo_id) ? escapeHtml(vehiculoPorId.get(c.vehiculo_id).placa) : shortId(c.vehiculo_id)) : "—"}</td>
        <td class="number">${fmtNum(c.horas_semanales)} h</td>
        <td>${estadoBadge(CONDUCTOR_ESTADOS, c.estado)}</td>
      </tr>`)
    .join("");

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Conductores (${drivers.length})</h2><div class="sub">${drivers.filter((c) => c.estado === "available").length} disponibles</div></div>
        <button type="button" class="btn btn-ghost" data-action="reload-view">↻ Recargar</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Nombre</th><th>Licencia</th><th>Categorías</th><th>Hazmat</th><th>Vehículo</th><th>Horas/sem</th><th>Estado</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function modalNuevoConductor() {
  const opciones = state.vehicles.length
    ? `<option value="">Sin vehículo asignado</option>${state.vehicles
        .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)}</option>`)
        .join("")}`
    : `<option value="">Sin vehículo asignado (no hay vehículos cargados)</option>`;

  openModal({
    title: "Nuevo conductor",
    body: `
      <form id="nuevo-conductor" data-form="nuevo-conductor">
        <div class="form-grid">
          <div class="field"><label for="c-nombre">Nombre <span class="req">*</span></label>
            <input id="c-nombre" name="nombre" maxlength="150" required placeholder="Juan Pérez" /></div>
          <div class="field"><label for="c-licencia">Nº de licencia <span class="req">*</span></label>
            <input id="c-licencia" name="licencia_numero" maxlength="50" required placeholder="LIC-000123" /></div>
          <div class="field"><label for="c-categorias">Categorías de licencia</label>
            <input id="c-categorias" name="categorias_licencia" maxlength="100" placeholder="B, C1" /></div>
          <div class="field"><label for="c-horas">Horas semanales</label>
            <input id="c-horas" name="horas_semanales" type="number" step="0.5" min="0" value="0" /></div>
          <div class="field full"><label for="c-vehiculo">Vehículo asignado</label>
            <select id="c-vehiculo" name="vehiculo_id">${opciones}</select></div>
          <div class="field"><label for="c-estado">Estado</label>
            <select id="c-estado" name="estado">
              <option value="available">Disponible</option>
              <option value="in_route">En ruta</option>
              <option value="off">Fuera de servicio</option>
            </select></div>
          <div class="field"><label>Certificaciones</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="certificacion_hazmat" /> ⚠️ Hazmat</label>
            </div></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="nuevo-conductor">Guardar conductor</button>`,
  });
}

async function submitNuevoConductor(form) {
  const fd = new FormData(form);
  const payload = {
    nombre: String(fd.get("nombre") || "").trim(),
    licencia_numero: String(fd.get("licencia_numero") || "").trim(),
    categorias_licencia: String(fd.get("categorias_licencia") || "").trim() || null,
    certificacion_hazmat: fd.has("certificacion_hazmat"),
    vehiculo_id: fd.get("vehiculo_id") || null,
    horas_semanales: fd.get("horas_semanales") ? parseFloat(fd.get("horas_semanales")) : 0,
    estado: fd.get("estado") || "available",
  };
  try {
    const creado = await crearConductor(payload);
    closeModal();
    toast(`Conductor ${creado.nombre} creado correctamente`, "success");
    renderConductores().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   10. Envíos
   ================================================================== */

async function loadEnvios() {
  const params = {};
  if (state.filtros.estado) params.estado = state.filtros.estado;
  if (state.filtros.cliente_id) params.cliente_id = state.filtros.cliente_id;
  state.shipments = await listarEnvios(params);
}

async function renderEnvios() {
  await conTiempo(loadEnvios());

  const filtrosHtml = `
    <form class="filters" data-form="filtros-envios">
      <div class="field"><label for="f-estado">Estado</label>
        <select id="f-estado" name="estado">
          <option value="">Todos</option>
          ${Object.keys(ENVIO_ESTADOS)
            .map((e) => `<option value="${e}" ${state.filtros.estado === e ? "selected" : ""}>${ENVIO_ESTADOS[e].label}</option>`)
            .join("")}
        </select></div>
      <div class="field grow"><label for="f-cliente">Cliente (ID)</label>
        <input id="f-cliente" name="cliente_id" value="${escapeHtml(state.filtros.cliente_id)}" placeholder="UUID del cliente" /></div>
      <button type="submit" class="btn btn-primary">Filtrar</button>
      <button type="button" class="btn btn-ghost" data-action="clear-filtros">Limpiar</button>
    </form>`;

  const tablaHtml = state.shipments.length
    ? `<div class="table-wrap"><table>
        <thead><tr>
          <th>Fecha</th><th>ID</th><th>Cliente</th><th>Origen → Destino</th>
          <th>Estado</th><th>Peso</th><th>Vol.</th><th>Vehículo</th><th>SLA</th>
        </tr></thead>
        <tbody>
          ${state.shipments
            .map((s) => `
          <tr class="clickable" data-action="open-envio" data-id="${escapeHtml(s.id)}">
            <td>${fmtFecha(s.creado_en)}</td>
            <td class="number">${shortId(s.id)}</td>
            <td class="number">${shortId(s.cliente_id)}</td>
            <td>${escapeHtml(s.origen)} → ${escapeHtml(s.destino)}</td>
            <td>${estadoBadge(ENVIO_ESTADOS, s.estado)}</td>
            <td class="number">${fmtNum(s.peso_kg)} kg</td>
            <td class="number">${s.volumen_m3 != null ? fmtNum(s.volumen_m3) + " m³" : "—"}</td>
            <td class="number">${s.vehiculo_id ? (vehiculoPlaca(s.vehiculo_id)) : "—"}</td>
            <td>${s.fecha_limite_sla ? fmtFechaHora(s.fecha_limite_sla) : "—"}</td>
          </tr>`)
            .join("")}
        </tbody></table></div>`
    : emptyState("📭", "No se encontraron envíos con los filtros actuales.");

  const detalleHtml = state.envioSeleccionadoId ? await detalleEnvioHtml() : "";

  $("#view").innerHTML = `
    <div class="card">${filtrosHtml}
      <div class="card-header" style="border:none;padding-bottom:8px">
        <div><h2>Lista de envíos (${state.shipments.length})</h2></div>
        <button type="button" class="btn btn-ghost" data-action="reload-view">↻ Recargar</button>
      </div>
      <div style="padding:0">${tablaHtml}</div>
    </div>
    ${detalleHtml}`;
}

function vehiculoPlaca(id) {
  const v = state.vehicles.find((x) => x.id === id);
  return v ? escapeHtml(v.placa) : shortId(id);
}

async function detalleEnvioHtml() {
  const id = state.envioSeleccionadoId;
  const [envio, eventos] = await conTiempo(
    Promise.all([obtenerEnvio(id), eventosDeEnvio(id)])
  );
  state.envioDetalle = envio;
  state.envioEventos = eventos;

  const yaEntregado = envio.estado === "entregado";

  const timeline = eventos.length
    ? eventos
        .map(
          (ev, i) => `
        <div class="tl-item">
          <div class="tl-title">${escapeHtml(etiquetaEvento(ev.tipo_evento))}</div>
          <div class="tl-date">${fmtFechaHora(ev.fecha_hora)}</div>
          ${ev.notas ? `<div class="tl-notes">${escapeHtml(ev.notas)}</div>` : ""}
        </div>`
        )
        .join("")
    : emptyState("🗓️", "Sin eventos registrados todavía.");

  const puedeAsignar = !envio.vehiculo_id && envio.estado !== "entregado";
  const puedeEstado = envio.estado !== "entregado";

  return `
    <div class="detail-panel">
      <div class="card">
        <div class="card-header">
          <div><h2>Detalle del envío <span class="badge neutral">${shortId(envio.id)}</span></h2>
          <div class="sub">${envio.origen} → ${envio.destino}</div></div>
          <button type="button" class="btn btn-ghost" data-action="close-envio">Cerrar</button>
        </div>
        <div class="card-body"><dl class="kv-list">
          ${kvHtml("ID completo", envio.id)}
          ${kvHtml("Estado", estadoBadge(ENVIO_ESTADOS, envio.estado))}
          ${kvHtml("Cliente", shortId(envio.cliente_id) + " (" + envio.cliente_id + ")")}
          ${kvHtml("Peso", fmtNum(envio.peso_kg) + " kg")}
          ${kvHtml("Volumen", envio.volumen_m3 != null ? fmtNum(envio.volumen_m3) + " m³" : "—")}
          ${kvHtml("Internacional", envio.es_internacional ? "Sí 🌎" : "No")}
          ${kvHtml("Fecha límite SLA", envio.fecha_limite_sla ? fmtFechaHora(envio.fecha_limite_sla) : "—")}
          ${kvHtml("Vehículo asignado", envio.vehiculo_id ? vehiculoPlaca(envio.vehiculo_id) + " (" + shortId(envio.vehiculo_id) + ")" : "—")}
          ${kvHtml("Ruta", envio.ruta_id ? shortId(envio.ruta_id) + " (" + envio.ruta_id + ")" : "—")}
          ${kvHtml("Creado", fmtFechaHora(envio.creado_en))}
          ${kvHtml("Actualizado", fmtFechaHora(envio.actualizado_en))}
        </dl></div>
      </div>

      <div class="card">
        <div class="card-header"><div><h2>Línea de tiempo</h2><div class="sub">Historial de eventos del envío</div></div></div>
        <div class="card-body"><div class="timeline">${timeline}</div></div>
      </div>

      <div class="card">
        <div class="card-header"><div><h2>Acciones</h2><div class="sub">Operaciones sobre el envío</div></div></div>
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
          ${puedeAsignar ? `<button type="button" class="btn btn-primary" data-action="modal-asignar" data-id="${escapeHtml(envio.id)}">🚚 Asignar vehículo</button>` : ""}
          ${puedeEstado ? `<button type="button" class="btn btn-ghost" data-action="modal-estado" data-id="${escapeHtml(envio.id)}">🔄 Cambiar estado</button>` : ""}
          <button type="button" class="btn btn-success" data-action="modal-prueba" data-id="${escapeHtml(envio.id)}" ${yaEntregado ? "disabled" : ""}>📸 Prueba de entrega</button>
        </div>
      </div>
    </div>`;
}

function kvHtml(k, v) {
  return `<div class="kv"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`;
}

function etiquetaEvento(tipo) {
  const mapa = {
    creado: "🆕 Envío creado",
    asignado: "🚚 Vehículo asignado",
    en_transito: "🚛 En tránsito",
    con_incidencia: "⚠️ Incidencia registrada",
    devuelto: "↩️ Envío devuelto",
    entregado: "✅ Entregado",
  };
  return mapa[tipo] || tipo;
}

/* ---------- Modal nuevo envío ---------- */

function modalNuevoEnvio() {
  openModal({
    title: "Nuevo envío",
    body: `
      <form id="nuevo-envio" data-form="nuevo-envio">
        <div class="form-grid">
          <div class="field"><label for="e-cliente">Cliente (ID) <span class="req">*</span></label>
            <input id="e-cliente" name="cliente_id" required placeholder="UUID del cliente" />
            <div class="hint"><button type="button" class="link-btn" data-action="gen-uuid" data-target="e-cliente">Generar UUID</button></div></div>
          <div class="field"><label for="e-origen">Origen <span class="req">*</span></label>
            <input id="e-origen" name="origen" maxlength="255" required placeholder="Buenos Aires" /></div>
          <div class="field"><label for="e-destino">Destino <span class="req">*</span></label>
            <input id="e-destino" name="destino" maxlength="255" required placeholder="Córdoba" /></div>
          <div class="field"><label for="e-peso">Peso (kg) <span class="req">*</span></label>
            <input id="e-peso" name="peso_kg" type="number" step="0.01" min="0.01" required placeholder="120.5" /></div>
          <div class="field"><label for="e-volumen">Volumen (m³)</label>
            <input id="e-volumen" name="volumen_m3" type="number" step="0.01" min="0" placeholder="2" /></div>
          <div class="field"><label for="e-sla">Fecha límite SLA</label>
            <input id="e-sla" name="fecha_limite_sla" type="datetime-local" /></div>
          <div class="field full"><label>Opciones</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="es_internacional" /> 🌎 Envío internacional</label>
            </div></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="nuevo-envio">Crear envío</button>`,
  });
}

async function submitNuevoEnvio(form) {
  const fd = new FormData(form);
  const payload = {
    cliente_id: String(fd.get("cliente_id") || "").trim(),
    origen: String(fd.get("origen") || "").trim(),
    destino: String(fd.get("destino") || "").trim(),
    peso_kg: parseFloat(fd.get("peso_kg")),
    volumen_m3: fd.get("volumen_m3") ? parseFloat(fd.get("volumen_m3")) : null,
    es_internacional: fd.has("es_internacional"),
    fecha_limite_sla: fd.get("fecha_limite_sla") ? new Date(fd.get("fecha_limite_sla")).toISOString() : null,
  };
  if (!/^[0-9a-fA-F-]{36}$/.test(payload.cliente_id)) {
    toast("El ID de cliente debe ser un UUID válido (36 caracteres). Usá «Generar UUID».", "error");
    return;
  }
  try {
    const creado = await crearEnvio(payload);
    closeModal();
    toast(`Envío creado (${shortId(creado.id)})`, "success");
    await navigate("envios", { envioId: creado.id, limpiarFiltros: true });
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------- Modal asignar vehículo ---------- */

function modalAsignar(id) {
  const opciones = state.vehicles.length
    ? `<option value="">Seleccioná un vehículo…</option>${state.vehicles
        .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)} (${fmtNum(v.capacidad_kg)} kg)</option>`)
        .join("")}`
    : `<option value="">No hay vehículos cargados</option>`;

  openModal({
    title: "Asignar vehículo",
    body: `
      <form id="asignar-envio" data-form="asignar-envio" data-id="${escapeHtml(id)}">
        <div class="form-grid">
          <div class="field full"><label for="a-vehiculo">Vehículo <span class="req">*</span></label>
            <select id="a-vehiculo" name="vehiculo_id" required>${opciones}</select></div>
          <div class="field full"><label for="a-ruta">Ruta (ID opcional)</label>
            <input id="a-ruta" name="ruta_id" placeholder="UUID de ruta" />
            <div class="hint"><button type="button" class="link-btn" data-action="gen-uuid" data-target="a-ruta">Generar UUID</button></div></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="asignar-envio">Asignar</button>`,
  });
}

async function submitAsignar(form, id) {
  const fd = new FormData(form);
  const payload = {
    vehiculo_id: fd.get("vehiculo_id"),
    ruta_id: fd.get("ruta_id") ? fd.get("ruta_id") : null,
  };
  try {
    await asignarEnvio(id, payload);
    closeModal();
    toast("Vehículo asignado al envío", "success");
    renderEnvios().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------- Modal cambiar estado ---------- */

function modalEstado(id) {
  openModal({
    title: "Cambiar estado",
    body: `
      <form id="estado-envio" data-form="estado-envio" data-id="${escapeHtml(id)}">
        <div class="form-grid">
          <div class="field full"><label for="st-estado">Nuevo estado <span class="req">*</span></label>
            <select id="st-estado" name="estado" required>
              <option value="en_transito">En tránsito</option>
              <option value="con_incidencia">Con incidencia</option>
              <option value="devuelto">Devuelto</option>
            </select></div>
          <div class="field full"><label for="st-notas">Notas</label>
            <textarea id="st-notas" name="notas" placeholder="Detalle de la incidencia o comentario…"></textarea></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="estado-envio">Actualizar</button>`,
  });
}

async function submitEstado(form, id) {
  const fd = new FormData(form);
  const payload = {
    estado: fd.get("estado"),
    notas: fd.get("notas") ? String(fd.get("notas")).trim() : null,
  };
  try {
    await actualizarEstadoEnvio(id, payload);
    closeModal();
    toast("Estado actualizado", "success");
    renderEnvios().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------- Modal prueba de entrega ---------- */

function modalPrueba(id) {
  openModal({
    title: "Registrar prueba de entrega",
    body: `
      <form id="prueba-envio" data-form="prueba-envio" data-id="${escapeHtml(id)}">
        <div class="form-grid">
          <div class="field full"><label for="p-nombre">Nombre del receptor <span class="req">*</span></label>
            <input id="p-nombre" name="nombre_receptor" maxlength="150" required placeholder="Quién recibió el envío" /></div>
          <div class="field"><label for="p-firma">URL de la firma</label>
            <input id="p-firma" name="url_firma" type="url" placeholder="https://…" /></div>
          <div class="field"><label for="p-foto">URL de la foto</label>
            <input id="p-foto" name="url_foto" type="url" placeholder="https://…" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-success" form="prueba-envio">Confirmar entrega</button>`,
  });
}

async function submitPrueba(form, id) {
  const fd = new FormData(form);
  const payload = {
    nombre_receptor: String(fd.get("nombre_receptor") || "").trim(),
    url_firma: fd.get("url_firma") ? String(fd.get("url_firma")).trim() : null,
    url_foto: fd.get("url_foto") ? String(fd.get("url_foto")).trim() : null,
  };
  try {
    await registrarPruebaEntrega(id, payload);
    closeModal();
    toast("✅ ¡Entrega confirmada!", "success");
    renderEnvios().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   11. Manejo de eventos (delegación global)
   ================================================================== */

async function onAction(action, el) {
  switch (action) {
    case "close-modal":
      closeModal();
      break;

    case "save-api-config": {
      const url = $("#cfg-api-url").value.trim().replace(/\/+$/, "");
      if (!url) {
        toast("Ingresá una URL válida", "error");
        return;
      }
      try {
        new URL(url);
      } catch (_err) {
        toast("La URL no es válida. Ej.: http://localhost:8002", "error");
        return;
      }
      localStorage.setItem("logitrack_api_url", url);
      CONFIG.API_BASE_URL = url;
      closeModal();
      toast(`API configurada: ${url}`, "success");
      checkHealth();
      navigate(state.view).catch(console.error);
      break;
    }

    case "reload-view":
      navigate(state.view).catch(console.error);
      break;

    case "go-envios":
      navigate("envios").catch(console.error);
      break;

    case "open-envio": {
      const id = el.dataset.id;
      state.envioSeleccionadoId = id;
      navigate("envios").catch(console.error);
      break;
    }

    case "close-envio":
      state.envioSeleccionadoId = null;
      state.envioDetalle = null;
      state.envioEventos = [];
      renderEnvios().catch(console.error);
      break;

    case "clear-filtros":
      state.filtros = { estado: "", cliente_id: "" };
      renderEnvios().catch(console.error);
      break;

    case "gen-uuid": {
      const target = $(`#${el.dataset.target}`);
      if (target && crypto.randomUUID) {
        target.value = crypto.randomUUID();
      } else {
        toast("Tu navegador no soporta generación de UUID", "error");
      }
      break;
    }

    case "modal-asignar":
      modalAsignar(el.dataset.id);
      break;
    case "modal-estado":
      modalEstado(el.dataset.id);
      break;
    case "modal-prueba":
      modalPrueba(el.dataset.id);
      break;
  }
}

async function onFormSubmit(form) {
  const nombre = form.dataset.form;
  switch (nombre) {
    case "nuevo-vehiculo":
      await submitNuevoVehiculo(form);
      break;
    case "nuevo-conductor":
      await submitNuevoConductor(form);
      break;
    case "nuevo-envio":
      await submitNuevoEnvio(form);
      break;
    case "filtros-envios": {
      const fd = new FormData(form);
      state.filtros.estado = fd.get("estado") || "";
      state.filtros.cliente_id = (fd.get("cliente_id") || "").trim();
      renderEnvios().catch(console.error);
      break;
    }
    case "asignar-envio":
      await submitAsignar(form, form.dataset.id);
      break;
    case "estado-envio":
      await submitEstado(form, form.dataset.id);
      break;
    case "prueba-envio":
      await submitPrueba(form, form.dataset.id);
      break;
  }
}

// Delegación de eventos
document.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  e.preventDefault();
  onAction(actionEl.dataset.action, actionEl);
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  onFormSubmit(form);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Navegación
$$(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const view = item.dataset.nav;
    state.envioSeleccionadoId = null;
    navigate(view).catch(console.error);
  });
});

// Sidebar
$("#btn-toggle-sidebar").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
});
function closeSidebarMobile() {
  if (window.innerWidth <= 860) $("#sidebar").classList.remove("open");
}

$("#btn-config-api").addEventListener("click", modalConfigApi);

/* ==================================================================
   12. Arranque
   ================================================================== */

(async function init() {
  try {
    const [vehicles, drivers] = await Promise.all([listVehiculos(), listConductores()]);
    state.vehicles = vehicles;
    state.drivers = drivers;
  } catch (_err) {
    /* la API puede estar caída; se intenta igual */
  }
  checkHealth();
  navigate("dashboard").catch(console.error);
})();