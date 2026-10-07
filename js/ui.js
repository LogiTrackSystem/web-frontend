/**
 * LogiTrack — Helpers de UI
 *
 * Aplica el skill de Emil Kowalski:
 * - Modal: entra con scale(0.95)+opacity (nunca scale(0)), transform-origin center,
 *   duración ~250ms ease-out; se monta con data-mounted para usar transiciones.
 * - Toast: entra con translateY(100%) (porcentajes del tamaño propio) usando
 *   transiciones (interrumpibles), sale rápido.
 * - Stagger: las cards/rows usan la clase .stagger con --i.
 */
"use strict";

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const shortId = (id) => (id ? String(id).slice(0, 8) : "—");
const fmtNum = (n) =>
  n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("es-AR");
const fmtNum2 = (n) =>
  n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`);
const fmtMonto = (n) =>
  n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

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

async function conTiempo(promise, ms = 350) {
  const delay = new Promise((r) => setTimeout(r, ms));
  const [result] = await Promise.all([promise, delay]);
  return result;
}

/* ---------- Badges ---------- */

const badge = (label, cls = "neutral") =>
  `<span class="badge ${cls}"><span class="dot"></span>${escapeHtml(label)}</span>`;

const estadoBadge = (map, estado) => {
  const info = map[estado] || { label: estado || "—", cls: "neutral" };
  return badge(info.label, info.cls);
};

/* ---------- Toast (transiciones, no keyframes) ---------- */

function toast(msg, type = "info") {
  const container = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("data-mounted", "false");
  el.innerHTML = `<span class="t-msg">${escapeHtml(msg)}</span><button class="t-close" type="button" aria-label="Cerrar">×</button>`;
  container.appendChild(el);
  el.querySelector(".t-close").addEventListener("click", () => dismissToast(el));
  // Forzar dos frames para que entre la transición
  requestAnimationFrame(() => requestAnimationFrame(() => el.setAttribute("data-mounted", "true")));
  const timer = setTimeout(() => dismissToast(el), 5000);
  el._dismissTimer = timer;
}

function dismissToast(el) {
  if (!el.isConnected) return;
  clearTimeout(el._dismissTimer);
  el.setAttribute("data-mounted", "false");
  // Exit rápido (el.coger antes de que llegue a la transición de entrada)
  setTimeout(() => el.remove(), 200);
}

/* ---------- Modal ---------- */

function openModal({ title, body, footer }) {
  const root = $("#modal-root");
  const prevFocus = document.activeElement;
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" data-mounted="false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
      </div>
    </div>`;
  const overlay = $("#modal-overlay");
  overlay.addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
  // Montar -> transición
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.setAttribute("data-mounted", "true")));
  const firstField = root.querySelector("input, select, textarea");
  if (firstField) setTimeout(() => firstField.focus(), 70);
  // Guardamos el foco previo para devolverlo al cerrar (a11y)
  root._prevFocus = prevFocus && prevFocus.focus ? prevFocus : null;
}

function closeModal() {
  const overlay = $("#modal-overlay");
  if (!overlay) return;
  const root = $("#modal-root");
  overlay.setAttribute("data-mounted", "false");
  setTimeout(() => {
    root.innerHTML = "";
    if (root._prevFocus) root._prevFocus.focus();
  }, 200);
}

/* ---------- Spinner / empty ---------- */

function spinnerHtml() {
  return `<div class="spinner" role="status" aria-label="Cargando"></div>`;
}

/** Spinner inline para botones/acciones */
function spinnerSmallHtml() {
  return `<span class="btn-spinner" aria-hidden="true"></span>`;
}

function emptyState(emoji, text) {
  return `<div class="state-box"><span class="emoji">${emoji}</span>${escapeHtml(text)}</div>`;
}

/* ---------- Helpers de tablas ---------- */

function tablaSimple(columnas, filas, { emptyEmoji = "📭", emptyText = "No hay datos." } = {}) {
  // `filas` puede llegar como array de <tr> o como string ya unido; toleramos ambos.
  const cuerpo = Array.isArray(filas) ? filas.join("") : String(filas ?? "");
  if (!cuerpo) return emptyState(emptyEmoji, emptyText);
  return `<div class="table-wrap"><table>
    <thead><tr>${columnas.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
    <tbody>${cuerpo}</tbody>
  </table></div>`;
}

/* ---------- Stagger ---------- */

// Asigna índices --i a elementos .stagger dentro de un contenedor HTML string
function stag(html, baseDelay = 40) {
  // reemplaza data-stag vacío por índices consecutivos
  let i = 0;
  return html.replace(/data-stag/g, () => `style="--i:${i++}" data-stag-mark`);
}

/* ---------- UUID ---------- */

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : null;
}

/* ---------- KV ---------- */

function kvHtml(k, v) {
  return `<div class="kv"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`;
}

/* ---------- Skeleton de carga ---------------------------------
   En lugar del spinner estático: bloques placeholder con brillo que
   barren (shimmer). Solo transform/opacity; respeta reduced-motion. */

function skeletonHtml() {
  const skKpis = Array.from({ length: 6 }, () => `<div class="sk kpi-sk"></div>`).join("");
  const skRows = Array.from({ length: 5 }, () => `<div class="sk row-sk"></div>`).join("");
  const skCard = (extra) => `<div class="sk card-sk ${extra}"><div class="sk block"></div>${skRows}</div>`;
  return `
    <div class="skeleton" role="status" aria-label="Cargando">
      <div class="kpis">${skKpis}</div>
      <div class="grid-2">${skCard("")}${skCard("")}</div>
      ${skCard("wide")}
    </div>`;
}

/* ---------- Count-up de valores ---------------------------------
   Anima el texto de un elemento con data-valor desde 0 (o data-inicio)
   hasta el objetivo. Solo cambia textContent (compatible, accesible);
   con prefers-reduced-motion salta directo al valor final. */

function animarValores(root = document) {
  $$("[data-valor]", root).forEach((el) => {
    const objetivo = Number(el.dataset.valor || 0);
    if (!Number.isFinite(objetivo)) { el.textContent = "—"; return; }
    const decimales = el.dataset.decimals !== undefined ? Number(el.dataset.decimals) : (Number.isInteger(objetivo) ? 0 : 2);
    const prefijo = el.dataset.prefix || "";
    const sufijo = el.dataset.suffix || "";
    const dur = el.dataset.dur ? Number(el.dataset.dur) : 750;
    const inicio = el.dataset.inicio !== undefined ? Number(el.dataset.inicio) : 0;
    const format = (v) =>
      prefijo + v.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + sufijo;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = format(objetivo); return; }

    const t0 = performance.now();
    const paso = (t) => {
      if (!el.isConnected) return; // la vista cambió; no seguir animando
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cúbico
      el.textContent = format(inicio + (objetivo - inicio) * eased);
      if (p < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

/* ---------- Gauges radiales (donut) ---------------------------
   SVG con arco que crece con stroke-dashoffset (transición, no
   keyframe). El valor central usa count-up vía data-valor. */

function gaugeDonut(opts) {
  const r = 30;
  const pct = Math.max(0, Math.min(100, Number(opts.pct) || 0));
  const esNum = opts.valor != null && Number.isFinite(Number(opts.valor));
  const valor = esNum
    ? `<text class="gauge-ring-text" x="36" y="40" text-anchor="middle" data-valor="${Number(opts.valor)}" data-decimals="${opts.decimals || 1}" data-prefix="${opts.prefix || ""}" data-suffix="${opts.suffix || ""}"></text>`
    : `<text class="gauge-ring-text" x="36" y="40" text-anchor="middle">—</text>`;
  return `
  <div class="gauge-ring-wrap stagger" style="--i:0">
    <svg class="gauge-ring" viewBox="0 0 72 72" width="76" height="76" aria-hidden="true">
      <circle class="gauge-ring-bg" cx="36" cy="36" r="${r}"></circle>
      <circle class="gauge-ring-val" cx="36" cy="36" r="${r}" data-pct="${pct}" style="stroke:${opts.color || "var(--primary)"}"></circle>
      ${valor}
    </svg>
    <span class="gauge-ring-label">${escapeHtml(opts.label)}</span>
  </div>`;
}

function animarGauges(root = document) {
  $$(".gauge-ring-val", root).forEach((circle) => {
    const c = 2 * Math.PI * 30;
    const pct = Number(circle.dataset.pct || 0);
    circle.style.strokeDasharray = c;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      circle.style.strokeDashoffset = c * (1 - pct / 100);
      return;
    }
    circle.style.strokeDashoffset = c;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      circle.style.transition = "stroke-dashoffset 950ms var(--ease-out)";
      circle.style.strokeDashoffset = c * (1 - pct / 100);
    }));
  });
}

/** Muestra spinner dentro de un botón (data-loading) y deshabilita el botón. */
function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset._origHtml) btn.dataset._origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${spinnerSmallHtml()} ${btn.dataset._loadingText || "Procesando..."}`;
  } else {
    btn.disabled = false;
    if (btn.dataset._origHtml) {
      btn.innerHTML = btn.dataset._origHtml;
      delete btn.dataset._origHtml;
    }
    delete btn.dataset._loadingText;
  }
}