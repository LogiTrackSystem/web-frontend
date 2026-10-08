/**
 * LogiTrack — Panel de gestión
 * SPA en vanilla JS (sin build) que consume el API Gateway (FastAPI).
 *
 * Vistas: Dashboard, Vehículos, Conductores, Telemetría, Mantenimiento,
 * Envíos, Rutas, Aduana, Facturación, Notificaciones, Analítica.
 */
"use strict";

/* ==================================================================
   1. Constantes de dominio
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
const DECLARACION_ESTADOS = {
  pendiente: { label: "Pendiente", cls: "neutral" },
  aprobada: { label: "Aprobada", cls: "success" },
  retenida: { label: "Retenida", cls: "warn" },
  rechazada: { label: "Rechazada", cls: "danger" },
};
const FACTURA_ESTADOS = {
  emitida: { label: "Emitida", cls: "info" },
  pagada: { label: "Pagada", cls: "success" },
  vencida: { label: "Vencida", cls: "danger" },
};
const RUTA_URGENCIA = {
  alta: { label: "Alta", cls: "danger" },
  media: { label: "Media", cls: "warn" },
  baja: { label: "Baja", cls: "neutral" },
};

function etiquetaEvento(tipo) {
  const mapa = {
    creado: "🆕 Envío creado",
    asignado: "🚚 Vehículo asignado",
    en_transito: "🚛 En tránsito",
    con_incidencia: "⚠️ Incidencia registrada",
    devuelto: "↩️ Envío devuelto",
    entregado: "✅ Entregado",
    retenido_aduana: "⛭ Retenido en aduana",
    liberado_aduana: "✅ Liberado por aduana",
  };
  return mapa[tipo] || tipo;
}

/* ==================================================================
   2. Estado global
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
  mapa: null, // instancia de Leaflet (vista Telemetría)
};

/* ---------- Loading overlay ---------- */
/* El overlay (#loading) es visible por defecto via CSS. Se retira cuando la
   app termina el primer render y, como red de seguridad, a los 5 s
   (CDN caído, API sin responder, etc.) para no bloquear la vista. */
function ocultarLoading() {
  const el = document.getElementById("loading");
  if (!el || el.getAttribute("data-mounted") === "false") return;
  el.setAttribute("data-mounted", "false");
  setTimeout(() => el.remove(), 400);
}
setTimeout(ocultarLoading, 5000);

/* ==================================================================
   3. Navegación
   ================================================================== */

const VIEWS = {
  dashboard: { title: "Dashboard", subtitle: "Resumen del sistema LogiTrack", render: renderDashboard, action: null },
  vehiculos: { title: "Vehículos", subtitle: "Flota de LogiTrack", render: renderVehiculos, action: { label: "＋ Nuevo vehículo", fn: modalNuevoVehiculo } },
  conductores: { title: "Conductores", subtitle: "Equipo de conducción", render: renderConductores, action: { label: "＋ Nuevo conductor", fn: modalNuevoConductor } },
  telemetria: { title: "Telemetría", subtitle: "Lecturas en vivo por vehículo", render: renderTelemetria, action: { label: "＋ Registrar lectura", fn: modalNuevaLectura } },
  mantenimiento: { title: "Mantenimiento", subtitle: "Programas e intervenciones", render: renderMantenimiento, action: { label: "＋ Agregar", fn: modalAgregarMantenimiento } },
  envios: { title: "Envíos", subtitle: "Ciclo de vida de los envíos", render: renderEnvios, action: { label: "＋ Nuevo envío", fn: modalNuevoEnvio } },
  rutas: { title: "Rutas", subtitle: "Planificación y recálculo de rutas", render: renderRutas, action: { label: "＋ Nueva ruta", fn: modalNuevaRuta } },
  aduana: { title: "Aduana", subtitle: "Declaraciones aduaneras", render: renderAduana, action: null },
  facturacion: { title: "Facturación", subtitle: "Facturas, tarifas y costos", render: renderFacturacion, action: null },
  notificaciones: { title: "Notificaciones", subtitle: "Mensajes y preferencias", render: renderNotificaciones, action: { label: "⚙ Preferencias", fn: modalPreferencias } },
  analitica: { title: "Analítica", subtitle: "KPIs, ETL y proyecciones", render: renderAnalitica, action: { label: "▶ Ejecutar ETL", fn: runEtlManual } },
};

async function navigate(view, opts = {}) {
  if (opts.envioId !== undefined) state.envioSeleccionadoId = opts.envioId;
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

  // Al cambiar de vista, destruir el mapa Leaflet si estaba montado
  // (si no, el contenedor queda con listeners huérfanos y el próximo
  // render intentaría inicializar un contenedor ya usado).
  if (state.mapa) {
    try { state.mapa.remove(); } catch (_err) { /* ya destruido */ }
    state.mapa = null;
  }

  $("#view").innerHTML = skeletonHtml();
  try {
    await def.render();
  } catch (err) {
    $("#view").innerHTML = emptyState("⚠️", err.message || "Ocurrió un error inesperado");
    if (!(err instanceof ApiError)) console.error(err);
  }
  closeSidebarMobile();
  viewEnter();
}

/* Reinicia la animación de entrada de la vista (transición, no keyframe
   de ida y vuelta): elimina la clase, fuerza reflow y la vuelve a poner. */
function viewEnter() {
  const v = $("#view");
  v.classList.remove("view-anim");
  void v.offsetWidth;
  v.classList.add("view-anim");
}

/* ==================================================================
   4. Salud de la API
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
          <div class="hint">Ej.: http://localhost:8002 (local) o la URL pública del túnel.</div>
        </div>
        <div class="field full">
          <div id="cfg-diag" class="api-diag">
            <div class="api-diag-row"><span>URL en uso</span><code id="cfg-diag-url">${escapeHtml(CONFIG.API_BASE_URL)}</code></div>
            <div class="api-diag-row"><span>Estado</span><span id="cfg-diag-status">sin comprobar</span></div>
            <div class="api-diag-row"><span>Latencia</span><span id="cfg-diag-lat">—</span></div>
          </div>
          <button type="button" class="btn btn-ghost small" data-action="test-api-config" style="margin-top:10px">🩺 Probar conexión</button>
        </div>
      </div>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="button" class="btn btn-primary" data-action="save-api-config">Guardar</button>`,
  });
}

// Prueba la URL del input contra /health y muestra estado + latencia.
async function testApiConfig() {
  const input = $("#cfg-api-url");
  const url = (input ? input.value : CONFIG.API_BASE_URL).trim().replace(/\/+$/, "");
  const statusEl = $("#cfg-diag-status");
  const latEl = $("#cfg-diag-lat");
  const urlEl = $("#cfg-diag-url");
  if (urlEl) urlEl.textContent = url;
  if (statusEl) { statusEl.textContent = "comprobando…"; statusEl.className = ""; }
  if (latEl) latEl.textContent = "—";
  const t0 = performance.now();
  try {
    const res = await fetch(`${url}/health`, { cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    if (res.ok) {
      if (statusEl) { statusEl.textContent = "🟢 responde"; statusEl.className = "ok"; }
      if (latEl) latEl.textContent = `${ms} ms`;
    } else {
      if (statusEl) { statusEl.textContent = `🔴 HTTP ${res.status}`; statusEl.className = "err"; }
      if (latEl) latEl.textContent = `${ms} ms`;
    }
  } catch (err) {
    if (statusEl) { statusEl.textContent = "🔴 no conecta"; statusEl.className = "err"; }
    if (latEl) latEl.textContent = "—";
  }
}

/* ==================================================================
   5. Dashboard
   ================================================================== */

/* Card de KPI con count-up: si k.value es numérico se anima desde 0
   (data-valor) usando animarValores() tras el render. */
function kpiCardHtml(k, i) {
  const esNum = k.value != null && Number.isFinite(Number(k.value));
  const attrs = esNum
    ? ` data-valor="${Number(k.value)}" data-decimals="${k.decimals ?? 0}" data-prefix="${k.prefix || ""}" data-suffix="${k.suffix || ""}"`
    : "";
  const valor = esNum ? "0" : escapeHtml(k.texto ?? (k.value == null ? "—" : String(k.value)));
  return `<div class="kpi stagger" style="--i:${i}">
      <div class="kpi-icon ${k.cls}">${k.icon}</div>
      <div>
        <div class="kpi-value"${attrs}>${valor}</div>
        <div class="kpi-label">${k.label}</div>
      </div>
    </div>`;
}

async function renderDashboard() {
  const [vehicles, drivers, shipments] = await conTiempo(
    Promise.all([listVehiculos(), listConductores(), listarEnvios()])
  );
  state.vehicles = vehicles || [];
  state.drivers = drivers || [];
  state.shipments = shipments || [];

  const cuenta = (estado) => state.shipments.filter((s) => s.estado === estado).length;
  const total = state.shipments.length;

  const kpis = [
    { icon: "📦", cls: "indigo", value: total, label: "Envíos registrados" },
    { icon: "⏳", cls: "amber", value: cuenta("pendiente"), label: "Pendientes" },
    { icon: "🚚", cls: "blue", value: cuenta("en_transito"), label: "En tránsito" },
    { icon: "⚠️", cls: "red", value: cuenta("con_incidencia"), label: "Con incidencia" },
    { icon: "✅", cls: "green", value: cuenta("entregado"), label: "Entregados" },
    { icon: "🛻", cls: "slate", value: state.vehicles.length, label: "Vehículos" },
  ];

  const kpiHtml = kpis.map((k, i) => kpiCardHtml(k, i)).join("");

  const orden = ["pendiente", "en_transito", "con_incidencia", "devuelto", "entregado"];
  const colores = { neutral: "#94a3b8", info: "#0284c7", warn: "#d97706", danger: "#dc2626", success: "#16a34a" };
  const barras = orden
    .filter((e) => ENVIO_ESTADOS[e])
    .map((e, i) => {
      const n = cuenta(e);
      const pct = total ? Math.round((n / total) * 100) : 0;
      const info = ENVIO_ESTADOS[e];
      return `
        <div class="estado-bar stagger" style="--i:${i}">
          <div class="row"><span class="lbl">${info.label}</span><span><strong>${n}</strong> · ${pct}%</span></div>
          <div class="track"><div class="fill" style="background:${colores[info.cls]};animation-delay:${140 + i * 90}ms"></div></div>
        </div>`;
    })
    .join("");

  // Actividad reciente (analytics, tolerante a caídas)
  let actividadHtml = emptyState("📭", "Sin actividad registrada todavía.");
  try {
    const actividad = await analyticsActividadReciente(8);
    if (actividad && actividad.length) {
      actividadHtml = `<div class="timeline">${actividad
        .map(
          (a) => `<div class="tl-item">
            <div class="tl-title">${escapeHtml(a.mensaje)}</div>
            <div class="tl-date">${fmtFechaHora(a.ocurrido_en)}</div>
          </div>`
        )
        .join("")}</div>`;
    }
  } catch (_err) {
    actividadHtml = emptyState("◧", "Analytics no disponible. Ejecutá el ETL desde la vista Analítica.");
  }

  const recientes = state.shipments.slice(0, 5);
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
    <div class="dash-meta">
      <span class="live"><span class="dot"></span>Panel en vivo</span>
      <span class="chip" id="dashboard-updated">Actualizado —</span>
    </div>
    <div class="kpis">${kpiHtml}</div>
    <div class="grid-2">
      <div class="card spotlight stagger" style="--i:6">
        <div class="card-header"><div><h2>Envíos por estado</h2><div class="sub">Distribución actual de la flota de envíos</div></div></div>
        <div class="card-body">${total ? `<div class="estado-bars">${barras}</div>` : emptyState("📊", "Sin datos aún.")}</div>
      </div>
      <div class="card spotlight stagger" style="--i:7">
        <div class="card-header">
          <div><h2>Últimos envíos</h2><div class="sub">Clic para ver el detalle</div></div>
          <button type="button" class="btn btn-ghost small" data-action="go-envios">Ver todos</button>
        </div>
        <div class="card-body" style="padding:0">${tablaHtml}</div>
      </div>
    </div>
    <div class="card spotlight stagger" style="--i:8">
      <div class="card-header"><div><h2>Actividad reciente</h2><div class="sub">Últimos eventos consolidados por Analytics</div></div></div>
      <div class="card-body">${actividadHtml}</div>
    </div>`;

  animarValores();
}

/* ==================================================================
   6. Vehículos
   ================================================================== */

async function renderVehiculos() {
  const vehicles = await conTiempo(listVehiculos());
  state.vehicles = vehicles || [];

  if (!state.vehicles.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🛻", "No hay vehículos registrados. Cargá el primero con el botón «Nuevo vehículo».")}</div></div>`;
    return;
  }

  const rows = state.vehicles
    .map((v, i) => `
      <tr class="stagger" style="--i:${i}">
        <td><strong>${escapeHtml(v.placa)}</strong><span class="cell-sub">${escapeHtml(v.id)}</span></td>
        <td>${escapeHtml(v.tipo)}</td>
        <td class="number">${fmtNum(v.capacidad_kg)} kg</td>
        <td class="number">${v.capacidad_m3 != null ? fmtNum(v.capacidad_m3) + " m³" : "—"}</td>
        <td>${v.anio ? escapeHtml(v.anio) : "—"}</td>
        <td>${fmtFecha(v.vencimiento_seguro)}</td>
        <td>${estadoBadge(VEHICULO_ESTADOS, v.estado)}</td>
        <td>${v.capacidad_refrigeracion ? "❄️ Sí" : "No"}</td>
        <td>${v.certificado_hazmat ? "⚠️ Sí" : "No"}</td>
        <td><button class="btn btn-ghost small" data-action="change-vehiculo-estado" data-id="${escapeHtml(v.id)}" data-estado="${escapeHtml(v.estado)}">Estado</button></td>
      </tr>`);

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Flota (${state.vehicles.length})</h2><div class="sub">${state.vehicles.filter((v) => v.estado === "active").length} activos</div></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
      </div>
      ${tablaSimple(
        ["Placa", "Tipo", "Capacidad", "Volumen", "Año", "Seguro vence", "Estado", "Refrig.", "Hazmat", ""],
        rows,
        { emptyEmoji: "🛻" }
      )}
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

function modalCambioEstadoVehiculo(id, estadoActual) {
  openModal({
    title: "Cambiar estado del vehículo",
    body: `
      <form id="estado-vehiculo" data-form="estado-vehiculo" data-id="${escapeHtml(id)}">
        <div class="form-grid">
          <div class="field full"><label for="ve-estado">Nuevo estado <span class="req">*</span></label>
            <select id="ve-estado" name="estado" required>
              <option value="active" ${estadoActual === "active" ? "selected" : ""}>Activo</option>
              <option value="inactive" ${estadoActual === "inactive" ? "selected" : ""}>Inactivo</option>
              <option value="mantenimiento" ${estadoActual === "mantenimiento" ? "selected" : ""}>Mantenimiento</option>
            </select></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="estado-vehiculo">Actualizar</button>`,
  });
}

async function submitEstadoVehiculo(form, id) {
  const fd = new FormData(form);
  try {
    await cambiarEstadoVehiculo(id, { estado: fd.get("estado") });
    closeModal();
    toast("Estado del vehículo actualizado", "success");
    renderVehiculos().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   7. Conductores
   ================================================================== */

async function renderConductores() {
  const drivers = await conTiempo(listConductores());
  state.drivers = drivers || [];

  if (!state.drivers.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🧑‍✈️", "No hay conductores registrados. Cargá el primero con el botón «Nuevo conductor».")}</div></div>`;
    return;
  }

  const vehiculoPorId = new Map(state.vehicles.map((v) => [v.id, v]));

  const rows = state.drivers
    .map((c, i) => `
      <tr class="stagger" style="--i:${i}">
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td class="number">${escapeHtml(c.licencia_numero)}</td>
        <td>${escapeHtml(c.categorias_licencia || "—")}</td>
        <td>${c.certificacion_hazmat ? "⚠️ Sí" : "No"}</td>
        <td>${c.vehiculo_id ? (vehiculoPorId.get(c.vehiculo_id) ? escapeHtml(vehiculoPorId.get(c.vehiculo_id).placa) : shortId(c.vehiculo_id)) : "—"}</td>
        <td class="number">${fmtNum(c.horas_semanales)} h</td>
        <td>${estadoBadge(CONDUCTOR_ESTADOS, c.estado)}</td>
      </tr>`);

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Conductores (${state.drivers.length})</h2><div class="sub">${state.drivers.filter((c) => c.estado === "available").length} disponibles</div></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
      </div>
      ${tablaSimple(["Nombre", "Licencia", "Categorías", "Hazmat", "Vehículo", "Horas/sem", "Estado"], rows, { emptyEmoji: "🧑‍✈️" })}
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
   8. Envíos
   ================================================================== */

async function loadEnvios() {
  const params = {};
  if (state.filtros.estado) params.estado = state.filtros.estado;
  if (state.filtros.cliente_id) params.cliente_id = state.filtros.cliente_id;
  state.shipments = (await listarEnvios(params)) || [];
}

async function renderEnvios() {
  await conTiempo(loadEnvios());
  if (!state.vehicles.length) {
    try { state.vehicles = (await listVehiculos()) || []; } catch (_err) { state.vehicles = []; }
  }

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

  const rows = state.shipments.map((s, i) =>
    `<tr class="clickable stagger" style="--i:${i}" data-action="open-envio" data-id="${escapeHtml(s.id)}">
      <td>${fmtFecha(s.creado_en)}</td>
      <td class="number">${shortId(s.id)}</td>
      <td class="number">${shortId(s.cliente_id)}</td>
      <td>${escapeHtml(s.origen)} → ${escapeHtml(s.destino)}</td>
      <td>${estadoBadge(ENVIO_ESTADOS, s.estado)}</td>
      <td class="number">${fmtNum(s.peso_kg)} kg</td>
      <td class="number">${s.volumen_m3 != null ? fmtNum(s.volumen_m3) + " m³" : "—"}</td>
      <td class="number">${s.vehiculo_id ? vehiculoPlaca(s.vehiculo_id) : "—"}</td>
      <td>${s.fecha_limite_sla ? fmtFechaHora(s.fecha_limite_sla) : "—"}</td>
    </tr>`);

  const tablaHtml = tablaSimple(
    ["Fecha", "ID", "Cliente", "Origen → Destino", "Estado", "Peso", "Vol.", "Vehículo", "SLA"],
    rows,
    { emptyEmoji: "📭", emptyText: "No se encontraron envíos con los filtros actuales." }
  );

  const detalleHtml = state.envioSeleccionadoId ? await detalleEnvioHtml() : "";

  $("#view").innerHTML = `
    <div class="card">${filtrosHtml}
      <div class="card-header" style="border:none;padding-bottom:8px">
        <div><h2>Lista de envíos (${state.shipments.length})</h2></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
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
  const [envio, eventos] = await conTiempo(Promise.all([obtenerEnvio(id), eventosDeEnvio(id)]));
  state.envioDetalle = envio;
  state.envioEventos = eventos || [];

  const yaEntregado = envio.estado === "entregado";

  const timeline = state.envioEventos.length
    ? state.envioEventos
        .map(
          (ev) => `
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
          <div><h2>Detalle del envío ${badge(shortId(envio.id))}</h2>
          <div class="sub">${escapeHtml(envio.origen)} → ${escapeHtml(envio.destino)}</div></div>
          <button type="button" class="btn btn-ghost small" data-action="close-envio">Cerrar</button>
        </div>
        <div class="card-body"><dl class="kv-list">
          ${kvHtml("ID completo", `<span class="mono">${escapeHtml(envio.id)}</span>`)}
          ${kvHtml("Estado", estadoBadge(ENVIO_ESTADOS, envio.estado))}
          ${kvHtml("Cliente", `<span class="mono">${escapeHtml(envio.cliente_id)}</span>`)}
          ${kvHtml("Peso", fmtNum(envio.peso_kg) + " kg")}
          ${kvHtml("Volumen", envio.volumen_m3 != null ? fmtNum(envio.volumen_m3) + " m³" : "—")}
          ${kvHtml("Internacional", envio.es_internacional ? "Sí 🌎" : "No")}
          ${kvHtml("Fecha límite SLA", envio.fecha_limite_sla ? fmtFechaHora(envio.fecha_limite_sla) : "—")}
          ${kvHtml("Vehículo asignado", envio.vehiculo_id ? vehiculoPlaca(envio.vehiculo_id) + " (" + shortId(envio.vehiculo_id) + ")" : "—")}
          ${kvHtml("Ruta", envio.ruta_id ? shortId(envio.ruta_id) + ` (<span class="mono">${escapeHtml(envio.ruta_id)}</span>)` : "—")}
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
   9. Rutas
   ================================================================== */

async function renderRutas() {
  const rutas = await conTiempo(listarRutas());
  state.rutas = rutas || [];

  if (!state.rutas.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🗺️", "No hay rutas planificadas. Creá la primera con el botón «Nueva ruta».")}</div></div>`;
    return;
  }

  const rows = state.rutas.map((r, i) => `
    <tr class="clickable stagger" style="--i:${i}" data-action="open-ruta" data-id="${escapeHtml(r.id)}">
      <td class="number">${shortId(r.id)}</td>
      <td class="number">${shortId(r.envio_id)}</td>
      <td class="number">${r.vehiculo_id ? shortId(r.vehiculo_id) : "—"}</td>
      <td class="number">${r.distancia_km != null ? fmtNum2(r.distancia_km) + " km" : "—"}</td>
      <td>${r.paradas && Array.isArray(r.paradas) ? fmtNum(r.paradas.length) + " paradas" : "—"}</td>
      <td>${r.hora_estimada_llegada ? fmtFechaHora(r.hora_estimada_llegada) : "—"}</td>
      <td>${r.veces_recalculada > 0 ? `<span class="chip">↻ ${r.veces_recalculada}</span>` : "—"}</td>
      <td>${fmtFecha(r.creado_en)}</td>
    </tr>`);

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Rutas (${state.rutas.length})</h2><div class="sub">Clic para ver historial de recálculos</div></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
      </div>
      ${tablaSimple(
        ["ID", "Envío", "Vehículo", "Distancia", "Paradas", "ETA", "Recálculos", "Creada"],
        rows,
        { emptyEmoji: "🗺️" }
      )}
    </div>`;
}

function modalNuevaRuta() {
  openModal({
    title: "Nueva ruta",
    body: `
      <form id="nueva-ruta" data-form="nueva-ruta">
        <div class="form-grid">
          <div class="field full"><label for="r-envio">Envío (ID) <span class="req">*</span></label>
            <input id="r-envio" name="envio_id" required placeholder="UUID del envío" />
            <div class="hint"><button type="button" class="link-btn" data-action="gen-uuid" data-target="r-envio">Generar UUID</button>
              · ${state.shipments.length} envíos cargados</div></div>
          <div class="field"><label for="r-vehiculo">Vehículo (ID)</label>
            <input id="r-vehiculo" name="vehiculo_id" placeholder="UUID del vehículo" /></div>
          <div class="field"><label for="r-distancia">Distancia (km)</label>
            <input id="r-distancia" name="distancia_km" type="number" step="0.01" min="0" placeholder="350.5" /></div>
          <div class="field full"><label for="r-eta">ETA</label>
            <input id="r-eta" name="hora_estimada_llegada" type="datetime-local" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="nueva-ruta">Crear ruta</button>`,
  });
}

async function submitNuevaRuta(form) {
  const fd = new FormData(form);
  const payload = {
    envio_id: String(fd.get("envio_id") || "").trim(),
    vehiculo_id: fd.get("vehiculo_id") ? String(fd.get("vehiculo_id")).trim() : null,
    distancia_km: fd.get("distancia_km") ? parseFloat(fd.get("distancia_km")) : null,
    hora_estimada_llegada: fd.get("hora_estimada_llegada") ? new Date(fd.get("hora_estimada_llegada")).toISOString() : null,
  };
  if (!/^[0-9a-fA-F-]{36}$/.test(payload.envio_id)) {
    toast("El ID de envío debe ser un UUID válido.", "error");
    return;
  }
  try {
    const creada = await crearRuta(payload);
    closeModal();
    toast(`Ruta creada (${shortId(creada.id)})`, "success");
    renderRutas().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

function modalRutaDetalle(ruta) {
  openModal({
    title: "Detalle de ruta",
    body: `
      <div class="form-grid mb-16">
        ${kvHtml("ID", `<span class="mono">${escapeHtml(ruta.id)}</span>`)}
        ${kvHtml("Envío", `<span class="mono">${escapeHtml(ruta.envio_id)}</span>`)}
        ${kvHtml("Vehículo", ruta.vehiculo_id ? `<span class="mono">${escapeHtml(ruta.vehiculo_id)}</span>` : "—")}
        ${kvHtml("Distancia", ruta.distancia_km != null ? fmtNum2(ruta.distancia_km) + " km" : "—")}
        ${kvHtml("ETA", ruta.hora_estimada_llegada ? fmtFechaHora(ruta.hora_estimada_llegada) : "—")}
        ${kvHtml("Veces recalculada", fmtNum(ruta.veces_recalculada))}
        ${kvHtml("Creada", fmtFechaHora(ruta.creado_en))}
      </div>
      <form id="recalcular-ruta" data-form="recalcular-ruta" data-id="${escapeHtml(ruta.id)}">
        <div class="form-grid">
          <div class="field full"><label for="rr-distancia">Nueva distancia (km)</label>
            <input id="rr-distancia" name="distancia_km" type="number" step="0.01" min="0" placeholder="320" /></div>
          <div class="field full"><label for="rr-eta">Nueva ETA</label>
            <input id="rr-eta" name="hora_estimada_llegada" type="datetime-local" /></div>
          <div class="field full"><label for="rr-motivo">Motivo del recálculo <span class="req">*</span></label>
            <input id="rr-motivo" name="motivo_recalculo" required maxlength="200" placeholder="Ej.: corte de ruta / tráfico" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cerrar</button>
      <button type="submit" class="btn btn-primary" form="recalcular-ruta">↻ Recalcular</button>`,
  });
}

async function submitRecalcularRuta(form, id) {
  const fd = new FormData(form);
  const payload = {
    distancia_km: fd.get("distancia_km") ? parseFloat(fd.get("distancia_km")) : null,
    hora_estimada_llegada: fd.get("hora_estimada_llegada") ? new Date(fd.get("hora_estimada_llegada")).toISOString() : null,
    motivo_recalculo: String(fd.get("motivo_recalculo") || "").trim(),
  };
  try {
    await recalcularRuta(id, payload);
    closeModal();
    toast("Ruta recalculada", "success");
    renderRutas().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function showRutaHistorial(id) {
  let historial = [];
  try {
    historial = (await historialRuta(id)) || [];
  } catch (_err) {
    historial = [];
  }
  const items = historial.length
    ? historial.map(
        (h) => `
      <div class="tl-item">
        <div class="tl-title">↻ ${escapeHtml(h.motivo_recalculo || "Recálculo")}</div>
        <div class="tl-date">${fmtFechaHora(h.recalculado_en)}</div>
        <div class="tl-notes">Distancia anterior: ${h.distancia_km_anterior != null ? fmtNum2(h.distancia_km_anterior) + " km" : "—"} · ETA anterior: ${h.hora_estimada_llegada_anterior ? fmtFechaHora(h.hora_estimada_llegada_anterior) : "—"}</div>
      </div>`
      )
      .join("")
    : emptyState("🗓️", "Sin recálculos registrados.");
  openModal({
    title: "Historial de recálculos",
    body: `<div class="timeline">${items}</div>`,
    footer: `<button type="button" class="btn btn-ghost" data-action="close-modal">Cerrar</button>`,
  });
}

/* ==================================================================
   10. Telemetría
   ================================================================== */

async function renderTelemetria() {
  if (!state.vehicles.length) {
    try { state.vehicles = (await listVehiculos()) || []; } catch (_err) { state.vehicles = []; }
  }

  const vehiculoSeleccionado = state.telemetriaVehiculoId || (state.vehicles[0] ? state.vehicles[0].id : null);
  state.telemetriaVehiculoId = vehiculoSeleccionado;

  const selector = state.vehicles.length
    ? `<form class="filters" data-form="filtros-telemetria">
        <div class="field"><label for="t-vehiculo">Vehículo</label>
          <select id="t-vehiculo" name="vehiculo_id">
            ${state.vehicles
              .map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === vehiculoSeleccionado ? "selected" : ""}>${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)}</option>`)
              .join("")}
          </select></div>
        <button type="submit" class="btn btn-primary">Ver telemetría</button>
      </form>`
    : emptyState("🛻", "No hay vehículos. Cargá vehículos en la pestaña Vehículos para ver telemetría.");

  let contenido = emptyState("⌖", "Seleccioná un vehículo para ver sus lecturas.");
  let lecturasSel = []; // lecturas del vehículo seleccionado (para el mapa)
  if (vehiculoSeleccionado) {
    try {
      const lecturas = (await listarTelemetria(vehiculoSeleccionado, 40)) || [];
      lecturasSel = lecturas;
      if (lecturas.length) {
        const ultima = lecturas[0];
        // Gauges radiales: pct se calcula contra un rango razonable por métrica
        const gGauge = [
          { label: "Velocidad", val: ultima.velocidad_kmh, max: 120, prefix: "", suffix: " km/h", decimals: 1, color: "#4f46e5" },
          { label: "Combustible", val: ultima.nivel_combustible_pct, max: 100, prefix: "", suffix: "%", decimals: 1, color: "#16a34a" },
          { label: "Temp. motor", val: ultima.temperatura_motor_c, max: 120, prefix: "", suffix: " °C", decimals: 1, color: "#d97706" },
          { label: "Temp. carga", val: ultima.temperatura_carga_c, max: 40, prefix: "", suffix: " °C", decimals: 1, color: "#0284c7" },
          { label: "Kilometraje", val: ultima.kilometraje_acumulado_km, max: 200000, prefix: "", suffix: " km", decimals: 1, color: "#7c3aed" },
          { label: "Horas motor", val: ultima.horas_motor, max: 10000, prefix: "", suffix: " h", decimals: 1, color: "#475569" },
        ];
        const gaugesHtml = gGauge
          .map((g) =>
            gaugeDonut({
              valor: g.val != null && g.val !== "" ? Number(g.val) : null,
              pct: g.val != null && g.val !== "" ? (Number(g.val) / g.max) * 100 : 0,
              label: g.label, prefix: g.prefix, suffix: g.suffix, decimals: g.decimals, color: g.color,
            })
          )
          .join("");
        const kpiHtml = ultima.codigo_obd2
          ? `<div class="chip" style="background:var(--danger-soft);color:var(--danger)">⚠️ OBD2: ${escapeHtml(ultima.codigo_obd2)}</div>`
          : `<div class="chip" style="background:var(--success-soft);color:var(--success)">✓ Sin códigos OBD2</div>`;

        const rows = lecturas.map((l, i) => `
          <tr class="stagger" style="--i:${i}">
            <td>${fmtFechaHora(l.tiempo)}</td>
            <td class="number">${l.latitud != null ? fmtNum2(l.latitud) : "—"}, ${l.longitud != null ? fmtNum2(l.longitud) : "—"}</td>
            <td class="number">${l.velocidad_kmh != null ? fmtNum2(l.velocidad_kmh) : "—"}</td>
            <td class="number">${l.nivel_combustible_pct != null ? fmtPct(l.nivel_combustible_pct) : "—"}</td>
            <td class="number">${l.temperatura_motor_c != null ? fmtNum2(l.temperatura_motor_c) + "°C" : "—"}</td>
            <td class="number">${l.temperatura_carga_c != null ? fmtNum2(l.temperatura_carga_c) + "°C" : "—"}</td>
            <td class="number">${l.velocidad_kmh != null && l.velocidad_kmh > 80 ? `<span class="chip" style="background:var(--warn-soft);color:var(--warn)">Alta</span>` : "—"}</td>
          </tr>`);

        contenido = `
          <div class="grid-4 mt-16">${gaugesHtml}</div>
          <div class="mt-16" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            ${kpiHtml}
            <span class="chip">Última lectura: ${fmtFechaHora(ultima.tiempo)}</span>
            <span class="live"><span class="dot"></span>En vivo</span>
          </div>
          <div class="card spotlight mt-16">
            <div class="card-header"><div><h2>Historial de lecturas (${lecturas.length})</h2></div></div>
            ${tablaSimple(["Tiempo", "Lat, Lng", "Vel. km/h", "Combustible", "Motor °C", "Carga °C", "Estado"], rows, { emptyEmoji: "⌖" })}
          </div>`;
      } else {
        contenido = emptyState("⌖", "Este vehículo no tiene lecturas de telemetría. Registrá la primera con «＋ Registrar lectura».");
      }
    } catch (err) {
      contenido = emptyState("⚠️", err.message);
    }
  }

  const mapaCard = state.vehicles.length
    ? `<div class="card spotlight mt-16">
        <div class="card-header">
          <div><h2>Mapa de seguimiento</h2><div class="sub">Posición GPS de la flota y recorrido reciente del vehículo seleccionado</div></div>
          <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
        </div>
        <div class="card-body">
          <div id="map-tracking" class="map-box" aria-label="Mapa de seguimiento de vehículos"></div>
          <div class="map-legend">
            <span><span class="dot-color" style="background:#4f46e5"></span>Vehículo seleccionado</span>
            <span><span class="dot-color" style="background:#16a34a"></span>Resto de la flota</span>
            <span><span class="dot-color" style="background:#4f46e5;width:18px;height:3px;border-radius:2px"></span>Recorrido (últimas lecturas)</span>
          </div>
        </div>
      </div>`
    : "";

  $("#view").innerHTML = `
    <div class="card">${selector}</div>
    ${mapaCard}
    ${contenido}`;

  animarGauges();
  animarValores();
  if (mapaCard) {
    renderMapaTracking(vehiculoSeleccionado, lecturasSel).catch((err) =>
      console.warn("Mapa de seguimiento:", err)
    );
  }
}

/* ---------- Mapa Leaflet de seguimiento ----------
   Muestra la última posición conocida de cada vehículo (1 request por
   vehículo, en paralelo) como circleMarker con popup, y el recorrido
   del vehículo seleccionado como polyline (las lecturas ya cargadas).
   Tolera: CDN de Leaflet caído, servicios sin GPS, vista cambiada. */
async function renderMapaTracking(vehiculoSel, lecturasSel) {
  const cont = $("#map-tracking");
  if (!cont) return; // la vista cambió antes de que terminara el fetch

  if (typeof L === "undefined") {
    cont.outerHTML = emptyState("🗺️", "No se pudo cargar Leaflet (CDN). El mapa necesita conexión a internet.");
    return;
  }

  const posiciones = await Promise.all(
    (state.vehicles || []).map(async (v) => {
      try {
        const ls = await listarTelemetria(v.id, 1);
        const l = Array.isArray(ls) && ls.length ? ls[0] : null;
        if (l && l.latitud != null && l.longitud != null) return { v, l };
      } catch (_err) {
        /* vehículo sin lecturas o tracking caído: se omite */
      }
      return null;
    })
  );
  const pts = posiciones.filter(Boolean);

  if (!pts.length) {
    cont.outerHTML = emptyState("🛰️", "Ningún vehículo tiene posición GPS. Registrá lecturas de telemetría para ver el mapa.");
    return;
  }
  // El contenedor puede haber desaparecido mientras hacíamos los fetch
  const cont2 = $("#map-tracking");
  if (!cont2) return;

  if (state.mapa) {
    try { state.mapa.remove(); } catch (_err) { /* ya destruido */ }
    state.mapa = null;
  }

  const map = L.map(cont2, { scrollWheelZoom: false }).setView([pts[0].l.latitud, pts[0].l.longitud], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const bounds = [];

  // Recorrido del vehículo seleccionado (ascendente por tiempo)
  const track = (Array.isArray(lecturasSel) ? lecturasSel : [])
    .filter((x) => x && x.latitud != null && x.longitud != null)
    .slice()
    .sort((a, b) => new Date(a.tiempo) - new Date(b.tiempo))
    .map((x) => {
      const p = [x.latitud, x.longitud];
      bounds.push(p);
      return p;
    });
  if (track.length > 1) {
    L.polyline(track, { color: "#4f46e5", weight: 3, opacity: 0.8, lineJoin: "round" }).addTo(map);
  }

  // Marcadores de la flota
  pts.forEach(({ v, l }) => {
    const esSel = v.id === vehiculoSel;
    bounds.push([l.latitud, l.longitud]);
    const m = L.circleMarker([l.latitud, l.longitud], {
      radius: esSel ? 9 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: esSel ? "#4f46e5" : "#16a34a",
      fillOpacity: 1,
    }).addTo(map);
    m.bindPopup(
      `<strong>${escapeHtml(v.placa)}</strong> · ${escapeHtml(v.tipo)}<br>` +
        `Velocidad: ${l.velocidad_kmh != null ? fmtNum2(l.velocidad_kmh) + " km/h" : "—"}<br>` +
        `Combustible: ${l.nivel_combustible_pct != null ? fmtPct(l.nivel_combustible_pct) : "—"}<br>` +
        `${escapeHtml(fmtFechaHora(l.tiempo))}`
    );
  });

  if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  state.mapa = map;
  // El contenedor se acomoda recién después del render (skeleton → vista)
  setTimeout(() => map.invalidateSize(), 250);
}

function modalNuevaLectura() {
  openModal({
    title: "Registrar lectura de telemetría",
    body: `
      <form id="nueva-telemetria" data-form="nueva-telemetria">
        <div class="form-grid">
          <div class="field full"><label for="tl-vehiculo">Vehículo <span class="req">*</span></label>
            <select id="tl-vehiculo" name="vehiculo_id" required>
              ${state.vehicles.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)}</option>`).join("")}
            </select></div>
          <div class="field"><label for="tl-lat">Latitud <span class="req">*</span></label>
            <input id="tl-lat" name="latitud" type="number" step="any" required placeholder="-34.6037" /></div>
          <div class="field"><label for="tl-lng">Longitud <span class="req">*</span></label>
            <input id="tl-lng" name="longitud" type="number" step="any" required placeholder="-58.3816" /></div>
          <div class="field"><label for="tl-vel">Velocidad (km/h)</label>
            <input id="tl-vel" name="velocidad_kmh" type="number" step="0.01" min="0" placeholder="72" /></div>
          <div class="field"><label for="tl-comb">Combustible (%)</label>
            <input id="tl-comb" name="nivel_combustible_pct" type="number" step="0.01" min="0" max="100" placeholder="68" /></div>
          <div class="field"><label for="tl-tmc">Temp. motor (°C)</label>
            <input id="tl-tmc" name="temperatura_motor_c" type="number" step="0.01" placeholder="92" /></div>
          <div class="field"><label for="tl-tcc">Temp. carga (°C)</label>
            <input id="tl-tcc" name="temperatura_carga_c" type="number" step="0.01" placeholder="4" /></div>
          <div class="field"><label for="tl-km">Kilometraje (km)</label>
            <input id="tl-km" name="kilometraje_acumulado_km" type="number" step="0.01" min="0" placeholder="45231" /></div>
          <div class="field"><label for="tl-hm">Horas motor</label>
            <input id="tl-hm" name="horas_motor" type="number" step="0.01" min="0" placeholder="1234" /></div>
          <div class="field full"><label for="tl-obd">Código OBD2 (opcional)</label>
            <input id="tl-obd" name="codigo_obd2" maxlength="40" placeholder="P0301" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="nueva-telemetria">Registrar</button>`,
  });
}

async function submitNuevaLectura(form) {
  const fd = new FormData(form);
  const num = (k) => (fd.get(k) ? parseFloat(fd.get(k)) : null);
  const payload = {
    vehiculo_id: String(fd.get("vehiculo_id") || "").trim(),
    latitud: parseFloat(fd.get("latitud")),
    longitud: parseFloat(fd.get("longitud")),
    velocidad_kmh: num("velocidad_kmh"),
    nivel_combustible_pct: num("nivel_combustible_pct"),
    temperatura_motor_c: num("temperatura_motor_c"),
    temperatura_carga_c: num("temperatura_carga_c"),
    kilometraje_acumulado_km: num("kilometraje_acumulado_km"),
    horas_motor: num("horas_motor"),
    codigo_obd2: fd.get("codigo_obd2") ? String(fd.get("codigo_obd2")).trim() : null,
  };
  try {
    const creada = await crearLecturaTelemetria(payload);
    closeModal();
    toast(`Lectura registrada para ${shortId(creada.vehiculo_id)}`, "success");
    state.telemetriaVehiculoId = creada.vehiculo_id;
    renderTelemetria().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   11. Mantenimiento
   ================================================================== */

async function renderMantenimiento() {
  if (!state.vehicles.length) {
    try { state.vehicles = (await listVehiculos()) || []; } catch (_err) { state.vehicles = []; }
  }

  const vehiculoId = state.mantenimientoVehiculoId || (state.vehicles[0] ? state.vehicles[0].id : null);
  state.mantenimientoVehiculoId = vehiculoId;

  const selector = state.vehicles.length
    ? `<form class="filters" data-form="filtros-mantenimiento">
        <div class="field"><label for="m-vehiculo">Vehículo</label>
          <select id="m-vehiculo" name="vehiculo_id">
            ${state.vehicles.map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === vehiculoId ? "selected" : ""}>${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)}</option>`).join("")}
          </select></div>
        <button type="submit" class="btn btn-primary">Ver mantenimiento</button>
      </form>`
    : emptyState("🛻", "No hay vehículos. Cargá vehículos en la pestaña Vehículos.");

  let contenido = emptyState("✦", "Seleccioná un vehículo.");
  if (vehiculoId && state.vehicles.length) {
    const [programas, intervenciones] = await conTiempo(
      Promise.all([listarProgramas(vehiculoId), listarIntervenciones(vehiculoId)]).catch(() => [[], []])
    );

    const progRows = (programas || []).map((p, i) => `
      <tr class="stagger" style="--i:${i}">
        <td>${escapeHtml(p.tipo)}</td>
        <td>${estadoBadge(RUTA_URGENCIA, p.prioridad)}</td>
        <td>${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : "—"}</td>
        <td class="number">${p.kilometraje_vencimiento != null ? fmtNum2(p.kilometraje_vencimiento) + " km" : "—"}</td>
        <td>${fmtFecha(p.creado_en)}</td>
      </tr>`);

    const intRows = (intervenciones || []).map((x, i) => `
      <tr class="stagger" style="--i:${i}">
        <td>${escapeHtml(x.tipo)}</td>
        <td>${fmtFechaHora(x.realizado_en)}</td>
        <td class="number">${x.costo != null ? fmtMonto(x.costo) : "—"}</td>
        <td>${escapeHtml(x.taller || "—")}</td>
        <td class="number">${x.kilometraje_en_servicio != null ? fmtNum2(x.kilometraje_en_servicio) + " km" : "—"}</td>
      </tr>`);

    contenido = `
      <div class="grid-2 mt-16">
        <div class="card">
          <div class="card-header"><div><h2>Programas (${(programas || []).length})</h2><div class="sub">Plan de mantenimiento preventivo</div></div></div>
          ${tablaSimple(["Tipo", "Prioridad", "Vence", "Km venc.", "Creado"], progRows, { emptyEmoji: "🗓️", emptyText: "Sin programas para este vehículo." })}
        </div>
        <div class="card">
          <div class="card-header"><div><h2>Intervenciones (${(intervenciones || []).length})</h2><div class="sub">Servicios realizados</div></div></div>
          ${tablaSimple(["Tipo", "Realizado", "Costo", "Taller", "Km"], intRows, { emptyEmoji: "🔧", emptyText: "Sin intervenciones registradas." })}
        </div>
      </div>`;
  }

  $("#view").innerHTML = `
    <div class="card">${selector}</div>
    ${contenido}`;
}

function modalAgregarMantenimiento() {
  openModal({
    title: "Agregar mantenimiento",
    body: `
      <form id="mantenimiento-add" data-form="mantenimiento-add">
        <div class="form-grid">
          <div class="field full"><label for="ma-vehiculo">Vehículo <span class="req">*</span></label>
            <select id="ma-vehiculo" name="vehiculo_id" required>
              ${state.vehicles.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.placa)} — ${escapeHtml(v.tipo)}</option>`).join("")}
            </select></div>
          <div class="field full"><label>Tipo de operación</label>
            <div style="display:flex;gap:10px">
              <label class="chip" style="cursor:pointer"><input type="radio" name="tipo_op" value="programa" checked style="width:auto" /> Programa</label>
              <label class="chip" style="cursor:pointer"><input type="radio" name="tipo_op" value="intervencion" style="width:auto" /> Intervención</label>
            </div></div>
          <div class="field"><label for="ma-tipo">Tipo <span class="req">*</span></label>
            <input id="ma-tipo" name="tipo" list="tipos-mant" required placeholder="Cambio de aceite" />
            <datalist id="tipos-mant">
              <option value="Cambio de aceite"></option>
              <option value="Revisión de frenos"></option>
              <option value="Rotación de neumáticos"></option>
              <option value="Filtros y combustible"></option>
              <option value="Suspensión"></option>
              <option value="Motor y electrónica"></option>
            </datalist></div>
          <div class="field"><label for="ma-prioridad">Prioridad</label>
            <select id="ma-prioridad" name="prioridad">
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="baja">Baja</option>
            </select></div>
          <div class="field"><label for="ma-fecha">Fecha de vencimiento</label>
            <input id="ma-fecha" name="fecha_vencimiento" type="date" /></div>
          <div class="field"><label for="ma-km">Km de vencimiento</label>
            <input id="ma-km" name="kilometraje_vencimiento" type="number" step="0.01" min="0" /></div>
          <div class="field"><label for="ma-costo">Costo (intervención)</label>
            <input id="ma-costo" name="costo" type="number" step="0.01" min="0" /></div>
          <div class="field"><label for="ma-taller">Taller (intervención)</label>
            <input id="ma-taller" name="taller" maxlength="150" placeholder="Taller El Camino" /></div>
          <div class="field"><label for="ma-kmserv">Km en servicio (intervención)</label>
            <input id="ma-kmserv" name="kilometraje_en_servicio" type="number" step="0.01" min="0" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="mantenimiento-add">Guardar</button>`,
  });
}

async function submitAgregarMantenimiento(form) {
  const fd = new FormData(form);
  const tipoOp = fd.get("tipo_op");
  const vehiculo_id = String(fd.get("vehiculo_id") || "").trim();
  const tipo = String(fd.get("tipo") || "").trim();
  try {
    if (tipoOp === "programa") {
      const payload = {
        vehiculo_id,
        tipo,
        prioridad: fd.get("prioridad") || "media",
        fecha_vencimiento: fd.get("fecha_vencimiento") ? new Date(fd.get("fecha_vencimiento")).toISOString() : null,
        kilometraje_vencimiento: fd.get("kilometraje_vencimiento") ? parseFloat(fd.get("kilometraje_vencimiento")) : null,
      };
      await crearPrograma(payload);
      toast("Programa de mantenimiento creado", "success");
    } else {
      const payload = {
        vehiculo_id,
        tipo,
        costo: fd.get("costo") ? parseFloat(fd.get("costo")) : null,
        taller: fd.get("taller") ? String(fd.get("taller")).trim() : null,
        kilometraje_en_servicio: fd.get("kilometraje_en_servicio") ? parseFloat(fd.get("kilometraje_en_servicio")) : null,
      };
      await crearIntervencion(payload);
      toast("Intervención registrada — vehículo liberado para uso", "success");
    }
    closeModal();
    state.mantenimientoVehiculoId = vehiculo_id;
    renderMantenimiento().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   12. Aduana
   ================================================================== */

async function renderAduana() {
  let declaraciones = [];
  try {
    declaraciones = (await listarDeclaraciones(state.aduanaFiltro || "")) || [];
  } catch (err) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("⚠️", err.message)}</div></div>`;
    return;
  }

  const filtroHtml = `
    <form class="filters" data-form="filtros-aduana">
      <div class="field"><label for="ad-estado">Estado</label>
        <select id="ad-estado" name="estado">
          <option value="">Todos</option>
          ${Object.keys(DECLARACION_ESTADOS)
            .map((e) => `<option value="${e}" ${state.aduanaFiltro === e ? "selected" : ""}>${DECLARACION_ESTADOS[e].label}</option>`)
            .join("")}
        </select></div>
      <button type="submit" class="btn btn-primary">Filtrar</button>
    </form>`;

  if (!declaraciones.length) {
    $("#view").innerHTML = `<div class="card">${filtroHtml}<div class="card-body">${emptyState("⛭", "No hay declaraciones aduaneras. Las declaraciones se generan por eventos de envíos internacionales.")}</div></div>`;
    return;
  }

  const rows = declaraciones.map((d, i) => `
    <tr class="clickable stagger" style="--i:${i}" data-action="edit-declaracion" data-id="${escapeHtml(d.id)}" data-estado="${escapeHtml(d.estado)}">
      <td class="number">${shortId(d.id)}</td>
      <td class="number">${shortId(d.envio_id)}</td>
      <td>${escapeHtml(d.pais_origen)} → ${escapeHtml(d.pais_destino)}</td>
      <td>${fmtNum((d.documentos || []).length)} docs</td>
      <td>${estadoBadge(DECLARACION_ESTADOS, d.estado)}</td>
      <td>${d.motivo_retencion ? escapeHtml(d.motivo_retencion) : "—"}</td>
      <td>${fmtFecha(d.creado_en)}</td>
    </tr>`);

  $("#view").innerHTML = `
    <div class="card">${filtroHtml}
      <div class="card-header" style="border:none;padding-bottom:8px">
        <div><h2>Declaraciones (${declaraciones.length})</h2></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
      </div>
      ${tablaSimple(
        ["ID", "Envío", "Origen → Destino", "Documentos", "Estado", "Motivo retención", "Creada"],
        rows,
        { emptyEmoji: "⛭" }
      )}
    </div>`;
}

function modalEditarDeclaracion(id, estadoActual) {
  openModal({
    title: "Actualizar declaración aduanera",
    body: `
      <form id="declaracion-estado" data-form="declaracion-estado" data-id="${escapeHtml(id)}">
        <div class="form-grid">
          <div class="field full"><label for="dc-estado">Nuevo estado <span class="req">*</span></label>
            <select id="dc-estado" name="estado" required>
              ${Object.keys(DECLARACION_ESTADOS)
                .map((e) => `<option value="${e}" ${e === estadoActual ? "selected" : ""}>${DECLARACION_ESTADOS[e].label}</option>`)
                .join("")}
            </select></div>
          <div class="field full"><label for="dc-motivo">Motivo de retención</label>
            <input id="dc-motivo" name="motivo_retencion" maxlength="255" placeholder="Ej.: documentación incompleta" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="declaracion-estado">Actualizar</button>`,
  });
}

async function submitEstadoDeclaracion(form, id) {
  const fd = new FormData(form);
  const payload = {
    estado: fd.get("estado"),
    motivo_retencion: fd.get("motivo_retencion") ? String(fd.get("motivo_retencion")).trim() : null,
  };
  try {
    await actualizarEstadoDeclaracion(id, payload);
    closeModal();
    toast("Declaración actualizada", "success");
    renderAduana().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   13. Facturación
   ================================================================== */

async function renderFacturacion() {
  const [facturas, costos] = await conTiempo(
    Promise.all([listarFacturas(), listarCostosRuta()]).catch((err) => {
      throw err;
    })
  );

  const kpis = [
    { icon: "🧾", cls: "indigo", value: (facturas || []).length, label: "Facturas" },
    { icon: "✅", cls: "green", value: (facturas || []).filter((f) => f.estado === "pagada").length, label: "Pagadas" },
    { icon: "⏳", cls: "amber", value: (facturas || []).filter((f) => f.estado === "emitida").length, label: "Emitidas" },
    { icon: "📏", cls: "blue", value: (costos || []).length, label: "Costos de ruta" },
  ];

  const kpiHtml = kpis.map((k, i) => kpiCardHtml(k, i)).join("");

  const factRows = (facturas || []).map((f, i) => `
    <tr class="stagger" style="--i:${i}">
      <td class="number">${shortId(f.id)}</td>
      <td class="number">${shortId(f.cliente_id)}</td>
      <td>${escapeHtml(f.periodo)}</td>
      <td class="number"><strong>${fmtMonto(f.monto_total)}</strong></td>
      <td>${estadoBadge(FACTURA_ESTADOS, f.estado)}</td>
      <td>${fmtFecha(f.creado_en)}</td>
    </tr>`);

  const costoRows = (costos || []).map((c, i) => `
    <tr class="stagger" style="--i:${i}">
      <td class="number">${shortId(c.ruta_id)}</td>
      <td class="number">${shortId(c.envio_id)}</td>
      <td class="number">${fmtNum2(c.distancia_km)} km</td>
      <td class="number">${fmtMonto(c.costo_combustible)}</td>
      <td class="number">${fmtMonto(c.costo_peajes)}</td>
      <td class="number">${fmtMonto(c.costo_total)}</td>
      <td>${fmtFecha(c.creado_en)}</td>
    </tr>`);

  $("#view").innerHTML = `
    <div class="kpis">${kpiHtml}</div>
    <div class="card spotlight">
      <div class="card-header">
        <div><h2>Facturas (${(facturas || []).length})</h2><div class="sub">Período, monto y estado</div></div>
        <button type="button" class="btn btn-primary" data-action="cerrar-periodo">🔒 Cerrar período</button>
      </div>
      ${tablaSimple(["ID", "Cliente", "Período", "Monto", "Estado", "Emitida"], factRows, { emptyEmoji: "🧾", emptyText: "Sin facturas. Usá «Cerrar período» para generarlas." })}
    </div>
    <div class="card spotlight">
      <div class="card-header"><div><h2>Costos de ruta (${(costos || []).length})</h2><div class="sub">Detalle de costos por ruta</div></div></div>
      ${tablaSimple(["Ruta", "Envío", "Distancia", "Combustible", "Peajes", "Total", "Fecha"], costoRows, { emptyEmoji: "📏", emptyText: "Sin costos calculados." })}
    </div>`;

  animarValores();
}

function modalTarifa() {
  openModal({
    title: "Configurar tarifa de cliente",
    body: `
      <form id="tarifa-form" data-form="tarifa-form">
        <div class="form-grid">
          <div class="field full"><label for="t-cliente">Cliente (ID) <span class="req">*</span></label>
            <input id="t-cliente" name="cliente_id" required placeholder="UUID del cliente" />
            <div class="hint"><button type="button" class="link-btn" data-action="gen-uuid" data-target="t-cliente">Generar UUID</button></div></div>
          <div class="field full"><label for="t-modelo">Modelo de tarifa</label>
            <select id="t-modelo" name="modelo">
              <option value="por_km">Por kilómetro</option>
              <option value="por_envio">Por envío</option>
              <option value="tarifa_plana">Tarifa plana</option>
            </select></div>
          <div class="field full"><label for="t-valor">Valor <span class="req">*</span></label>
            <input id="t-valor" name="valor" type="number" step="0.01" min="0" required placeholder="1500" /></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="tarifa-form">Guardar tarifa</button>`,
  });
}

async function submitTarifa(form) {
  const fd = new FormData(form);
  const payload = {
    cliente_id: String(fd.get("cliente_id") || "").trim(),
    modelo: fd.get("modelo"),
    valor: parseFloat(fd.get("valor")),
  };
  if (!/^[0-9a-fA-F-]{36}$/.test(payload.cliente_id)) {
    toast("El ID de cliente debe ser un UUID válido.", "error");
    return;
  }
  try {
    await configurarTarifa(payload);
    closeModal();
    toast("Tarifa configurada", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function runCerrarPeriodo() {
  try {
    const facturas = await cerrarPeriodoFacturas();
    toast(`Período cerrado: ${(facturas || []).length} facturas generadas`, "success");
    renderFacturacion().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   14. Notificaciones
   ================================================================== */

async function renderNotificaciones() {
  const notis = await conTiempo(listarNotificaciones(60));

  if (!notis || !notis.length) {
    $("#view").innerHTML = `<div class="card"><div class="card-body">${emptyState("🔔", "No hay notificaciones. Se generan cuando los servicios publican eventos en RabbitMQ.")}</div></div>`;
    return;
  }

  const rows = notis.map((n, i) => `
    <tr class="stagger" style="--i:${i}">
      <td>${fmtFechaHora(n.enviado_en)}</td>
      <td><span class="chip">${escapeHtml(n.canal)}</span></td>
      <td><strong>${escapeHtml(n.destinatario_tipo)}</strong></td>
      <td>${escapeHtml(n.mensaje)}</td>
      <td><span class="chip">${escapeHtml(n.evento_origen)}</span></td>
    </tr>`);

  $("#view").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Notificaciones (${notis.length})</h2><div class="sub">Últimos mensajes emitidos</div></div>
        <button type="button" class="btn btn-ghost small" data-action="reload-view">↻ Recargar</button>
      </div>
      ${tablaSimple(["Enviada", "Canal", "Destinatario", "Mensaje", "Evento"], rows, { emptyEmoji: "🔔" })}
    </div>`;
}

function modalPreferencias() {
  openModal({
    title: "Preferencias de notificación",
    body: `
      <form id="preferencias-form" data-form="preferencias-form">
        <div class="form-grid">
          <div class="field full"><label for="pf-cliente">Cliente (ID) <span class="req">*</span></label>
            <input id="pf-cliente" name="cliente_id" required placeholder="UUID del cliente" />
            <div class="hint"><button type="button" class="link-btn" data-action="gen-uuid" data-target="pf-cliente">Generar UUID</button></div></div>
          <div class="field full"><label for="pf-idioma">Idioma</label>
            <select id="pf-idioma" name="idioma">
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt">Português</option>
            </select></div>
          <div class="field full"><label for="pf-canal">Canal preferido</label>
            <select id="pf-canal" name="canal_preferido">
              <option value="">Sin preferencia</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select></div>
        </div>
      </form>`,
    footer: `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Cancelar</button>
      <button type="submit" class="btn btn-primary" form="preferencias-form">Guardar</button>`,
  });
}

async function submitPreferencias(form) {
  const fd = new FormData(form);
  const payload = {
    idioma: fd.get("idioma") || "es",
    canal_preferido: fd.get("canal_preferido") || null,
  };
  try {
    await configurarPreferencia(String(fd.get("cliente_id") || "").trim(), payload);
    closeModal();
    toast("Preferencias guardadas", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ==================================================================
   15. Analítica
   ================================================================== */

async function runEtlManual() {
  try {
    const r = await ejecutarEtl();
    toast(`ETL ejecutado: ${r && r.mensaje ? r.mensaje : "procesamiento completo"}`, "success");
    renderAnalitica().catch(console.error);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function renderAnalitica() {
  let resumen = null;
  try { resumen = await analyticsResumen(); } catch (_err) { resumen = null; }

  const kpis = [
    { icon: "🛻", cls: "indigo", value: resumen ? resumen.total_vehiculos : null, label: "Vehículos" },
    { icon: "🧑‍✈️", cls: "green", value: resumen ? resumen.total_conductores : null, label: "Conductores" },
    { icon: "🚚", cls: "blue", value: resumen ? resumen.envios_en_transito : null, label: "En tránsito" },
    { icon: "✅", cls: "green", value: resumen ? resumen.envios_entregados_historico : null, label: "Entregados" },
    { icon: "⚠️", cls: "red", value: resumen ? resumen.envios_con_incidencia_historico : null, label: "Con incidencia" },
    { icon: "🎯", cls: "amber", value: resumen ? resumen.tasa_cumplimiento_sla_global_pct : null, decimals: 1, suffix: "%", label: "Cumplimiento SLA" },
  ];

  const kpiHtml = kpis.map((k, i) => kpiCardHtml(k, i)).join("");

  // Ejecutar consultas clave (tolera fallos por separado)
  const [entregas, utilizacion, costoKm, eficiencia, proyeccion] = await Promise.all([
    analyticsEntregasDiarias(30).catch(() => []),
    analyticsUtilizacionFlota().catch(() => []),
    analyticsCostoPorKm().catch(() => []),
    analyticsEficienciaCombustible().catch(() => []),
    analyticsProyeccionMantenimiento(90).catch(() => []),
  ]);

  // Chart entregas diarias
  let chartHtml = emptyState("◧", "Ejecutá el ETL para generar datos de entregas.");
  if (entregas && entregas.length) {
    const max = Math.max(...entregas.map((e) => Number(e.total_entregados || 0)), 1);
    const maxMostrar = entregas.slice(-15);
    chartHtml = `<div class="chart-bars">${maxMostrar
      .map((e, i) => {
        const h = Math.round((Number(e.total_entregados || 0) / max) * 100);
        return `<div class="chart-col" title="Fecha: ${escapeHtml(e.fecha)} — ${fmtNum(e.total_entregados)} entregados">
          <div class="chart-val" style="animation-delay:${320 + i * 70}ms">${fmtNum(e.total_entregados)}</div>
          <div class="chart-bar" style="height:${Math.max(h, 4)}%;animation-delay:${i * 70}ms"></div>
          <div class="chart-label">${escShortDate(e.fecha)}</div>
        </div>`;
      })
      .join("")}</div>`;
  }

  // Utilización de flota
  let utilizacionHtml = emptyState("🛻", "Sin datos de utilización.");
  if (utilizacion && utilizacion.length) {
    const enUso = utilizacion.filter((u) => u.en_uso).length;
    utilizacionHtml = `
      <div class="chip mt-8 mb-16">${enUso} de ${utilizacion.length} vehículos en uso</div>
      <div class="hlist">
        ${utilizacion.map(
          (u, i) => `<div class="hlist-row stagger" style="--i:${i}">
            <div class="hlist-name">${escapeHtml(u.placa)} <span class="text-3 small">· ${escapeHtml(u.tipo)}</span></div>
            <div class="hlist-track"><div class="fill" style="width:${u.en_uso ? 100 : 12}%;background:${u.en_uso ? "#4f46e5" : "#cbd5e1"}"></div></div>
            <div class="hlist-val">${u.en_uso ? (u.estado_envio_actual || "en uso") : "disponible"}</div>
          </div>`
        ).join("")}
      </div>`;
  }

  // Costo por km
  let costoHtml = emptyState("📏", "Sin datos de costos.");
  if (costoKm && costoKm.length) {
    const maxCosto = Math.max(...costoKm.map((c) => Number(c.costo_promedio_por_km || 0)), 1);
    costoHtml = `<div class="hlist">
      ${costoKm
        .map(
          (c, i) => `<div class="hlist-row stagger" style="--i:${i}">
            <div class="hlist-name">${escapeHtml(c.tipo_vehiculo)}</div>
            <div class="hlist-track"><div class="fill" style="width:${Math.round((Number(c.costo_promedio_por_km || 0) / maxCosto) * 100)}%;background:#7c3aed"></div></div>
            <div class="hlist-val">$${fmtNum2(c.costo_promedio_por_km)}/km</div>
          </div>`
        )
        .join("")}
    </div>`;
  }

  // Eficiencia de combustible
  let eficienciaHtml = emptyState("⛽", "Sin datos de eficiencia.");
  if (eficiencia && eficiencia.length) {
    eficienciaHtml = `<div class="hlist">
      ${eficiencia
        .map(
          (e, i) => `<div class="hlist-row stagger" style="--i:${i}">
            <div class="hlist-name">${escapeHtml(e.nombre_conductor)}</div>
            <div class="hlist-track"><div class="fill" style="width:${Math.min(100, (Number(e.km_por_pct_combustible || 0) / 12) * 100)}%;background:${e.clasificacion === "eficiente" ? "#16a34a" : e.clasificacion === "regular" ? "#d97706" : "#dc2626"}"></div></div>
            <div class="hlist-val">${fmtNum2(e.km_por_pct_combustible)} km/%</div>
          </div>`
        )
        .join("")}
    </div>`;
  }

  // Proyección de mantenimiento
  let proyeccionHtml = emptyState("✦", "Sin proyecciones. Ejecutá el ETL.");
  if (proyeccion && proyeccion.length) {
    proyeccionHtml = tablaSimple(
      ["Vehículo", "Mantenimiento", "Vence", "Días rest.", "Urgencia"],
      proyeccion.map((p, i) => `
        <tr class="stagger" style="--i:${i}">
          <td><strong>${escapeHtml(p.placa_vehiculo || shortId(p.vehiculo_id))}</strong></td>
          <td>${escapeHtml(p.tipo_mantenimiento)}</td>
          <td>${p.fecha_vencimiento ? fmtFecha(p.fecha_vencimiento) : "—"}</td>
          <td class="number">${p.dias_restantes != null ? fmtNum(p.dias_restantes) : "—"}</td>
          <td>${estadoBadge(RUTA_URGENCIA, p.urgencia)}</td>
        </tr>`),
      { emptyEmoji: "✦" }
    );
  }

  $("#view").innerHTML = `
    ${resumen ? `<div class="mb-16"><span class="chip">Última actualización ETL: ${fmtFechaHora(resumen.ultima_actualizacion_etl)}</span></div>` : `<div class="mb-16"><span class="chip">Analytics sin resumen. Probá «▶ Ejecutar ETL».</span></div>`}
    <div class="kpis">${kpiHtml}</div>
    <div class="grid-2">
      <div class="card spotlight">
        <div class="card-header"><div><h2>Entregas diarias (30 días)</h2><div class="sub">Total entregadas por día</div></div></div>
        <div class="card-body">${chartHtml}</div>
      </div>
      <div class="card spotlight">
        <div class="card-header"><div><h2>Utilización de flota</h2><div class="sub">Estado actual por vehículo</div></div></div>
        <div class="card-body">${utilizacionHtml}</div>
      </div>
      <div class="card spotlight">
        <div class="card-header"><div><h2>Costo por km</h2><div class="sub">Promedio según tipo de vehículo</div></div></div>
        <div class="card-body">${costoHtml}</div>
      </div>
      <div class="card spotlight">
        <div class="card-header"><div><h2>Eficiencia de combustible</h2><div class="sub">km por unidad de combustible consumida</div></div></div>
        <div class="card-body">${eficienciaHtml}</div>
      </div>
    </div>
    <div class="card spotlight">
      <div class="card-header"><div><h2>Proyección de mantenimiento (90 días)</h2><div class="sub">Vencimientos próximos por vehículo</div></div></div>
      <div class="card-body" style="padding:0">${proyeccionHtml}</div>
    </div>`;

  animarValores();
}

function escShortDate(fecha) {
  if (!fecha) return "—";
  try {
    return new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  } catch (_err) {
    return String(fecha).slice(5);
  }
}

/* ==================================================================
   16. Manejo de eventos (delegación global)
   ================================================================== */

async function onAction(action, el) {
  switch (action) {
    case "close-modal":
      closeModal();
      break;

    case "test-api-config": {
      await testApiConfig();
      break;
    }

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
      const id = uuid();
      if (target && id) target.value = id;
      else toast("Tu navegador no soporta generación de UUID", "error");
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

    /* Vehículos */
    case "change-vehiculo-estado":
      modalCambioEstadoVehiculo(el.dataset.id, el.dataset.estado);
      break;

    /* Rutas */
    case "open-ruta":
      showRutaHistorial(el.dataset.id);
      break;

    /* Aduana */
    case "edit-declaracion":
      modalEditarDeclaracion(el.dataset.id, el.dataset.estado);
      break;

    /* Facturación */
    case "cerrar-periodo":
      runCerrarPeriodo();
      break;

    default:
      break;
  }
}

async function onFormSubmit(form) {
  const nombre = form.dataset.form;
  switch (nombre) {
    case "nuevo-vehiculo":
      await submitNuevoVehiculo(form);
      break;
    case "estado-vehiculo":
      await submitEstadoVehiculo(form, form.dataset.id);
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

    case "nueva-ruta":
      await submitNuevaRuta(form);
      break;
    case "recalcular-ruta":
      await submitRecalcularRuta(form, form.dataset.id);
      break;

    case "filtros-telemetria": {
      const fd = new FormData(form);
      state.telemetriaVehiculoId = fd.get("vehiculo_id");
      renderTelemetria().catch(console.error);
      break;
    }
    case "nueva-telemetria":
      await submitNuevaLectura(form);
      break;

    case "filtros-mantenimiento": {
      const fd = new FormData(form);
      state.mantenimientoVehiculoId = fd.get("vehiculo_id");
      renderMantenimiento().catch(console.error);
      break;
    }
    case "mantenimiento-add":
      await submitAgregarMantenimiento(form);
      break;

    case "filtros-aduana": {
      const fd = new FormData(form);
      state.aduanaFiltro = fd.get("estado") || "";
      renderAduana().catch(console.error);
      break;
    }
    case "declaracion-estado":
      await submitEstadoDeclaracion(form, form.dataset.id);
      break;

    case "tarifa-form":
      await submitTarifa(form);
      break;

    case "preferencias-form":
      await submitPreferencias(form);
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
  const sb = $("#sidebar");
  const isOpen = sb.classList.toggle("open");
  // Backdrop del drawer en móvil (creado con transición de opacidad)
  if (isOpen && window.innerWidth <= 900) {
    const bd = document.createElement("div");
    bd.className = "sidebar-backdrop";
    bd.setAttribute("aria-hidden", "true");
    document.body.appendChild(bd);
    requestAnimationFrame(() => requestAnimationFrame(() => (bd.style.opacity = "1")));
  } else {
    const bd = document.querySelector(".sidebar-backdrop");
    if (bd) bd.remove();
  }
});
function closeSidebarMobile() {
  if (window.innerWidth <= 900) {
    $("#sidebar").classList.remove("open");
    const bd = document.querySelector(".sidebar-backdrop");
    if (bd) bd.remove();
  }
}
document.addEventListener("click", (e) => {
  if (e.target && e.target.classList && e.target.classList.contains("sidebar-backdrop")) {
    closeSidebarMobile();
  }
});

$("#btn-config-api").addEventListener("click", modalConfigApi);

/* ==================================================================
   17. Arranque
   ================================================================== */

(async function init() {
  try {
    const [vehicles, drivers] = await Promise.all([listVehiculos(), listConductores()]);
    state.vehicles = vehicles || [];
    state.drivers = drivers || [];
  } catch (_err) {
    /* la API puede estar caída; se intenta igual */
  }
  checkHealth();
  try {
    await navigate("dashboard");
  } finally {
    ocultarLoading();
  }
})();

/* ==================================================================
   Comportamientos globales de dinamismo
   ================================================================== */

// Reloj "actualizado" en el dashboard (solo actualiza si el elemento vive)
setInterval(() => {
  const el = $("#dashboard-updated");
  if (el) el.textContent = "Actualizado " + new Date().toLocaleTimeString("es-AR", { hour12: false });
}, 1000);

// Spotlight en cards: un brillo radial que sigue al cursor (solo pointer fino)
document.addEventListener("pointermove", (e) => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const card = e.target.closest(".card.spotlight");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
  card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
});