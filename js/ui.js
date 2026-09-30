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
}

function closeModal() {
  const overlay = $("#modal-overlay");
  if (!overlay) return;
  overlay.setAttribute("data-mounted", "false");
  setTimeout(() => {
    $("#modal-root").innerHTML = "";
  }, 200);
}

/* ---------- Spinner / empty ---------- */

function spinnerHtml() {
  return `<div class="spinner" role="status" aria-label="Cargando"></div>`;
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