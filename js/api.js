/**
 * Cliente HTTP para las APIs de LogiTrack (a través del API Gateway).
 */
"use strict";

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
  try {
    const opts = {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      cache: "no-store",
      signal: controller.signal,
    };
    if (options.body !== undefined) {
      opts.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, opts);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_err) {
        data = text;
      }
    }
    if (!res.ok) {
      throw new ApiError(extractError(data, res), res.status, data);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === "AbortError") {
      throw new ApiError(
        `La API no respondió en ${CONFIG.API_TIMEOUT_MS} ms. Verificá que el API Gateway esté corriendo en ${CONFIG.API_BASE_URL}.`,
        0,
        null
      );
    }
    throw new ApiError(
      `No se pudo conectar con ${CONFIG.API_BASE_URL}. Revisá la configuración de la API.`,
      0,
      String(err && err.message)
    );
  } finally {
    clearTimeout(timer);
  }
}

function extractError(data, res) {
  if (data && typeof data === "object" && data.detail) {
    const d = data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      // Errores de validación de FastAPI
      return d
        .map((item) => {
          const loc = (item.loc || []).slice(1).join(".");
          return loc ? `${loc}: ${item.msg}` : item.msg;
        })
        .join(" · ");
    }
    return JSON.stringify(d);
  }
  if (typeof data === "string" && data) return data;
  return `Error HTTP ${res.status} ${res.statusText || ""}`.trim();
}

// ---------- Fleet (vehículos y conductores) ----------

function listVehiculos() {
  return request("/api/v1/vehiculos");
}
function getVehiculo(id) {
  return request(`/api/v1/vehiculos/${id}`);
}
function crearVehiculo(data) {
  return request("/api/v1/vehiculos", { method: "POST", body: data });
}

function listConductores() {
  return request("/api/v1/conductores");
}
function crearConductor(data) {
  return request("/api/v1/conductores", { method: "POST", body: data });
}

// ---------- Shipment (envíos) ----------

function crearEnvio(data) {
  return request("/api/v1/envios", { method: "POST", body: data });
}
function listarEnvios(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.estado) params.set("estado", filtros.estado);
  if (filtros.cliente_id) params.set("cliente_id", filtros.cliente_id);
  const qs = params.toString();
  return request(`/api/v1/envios${qs ? "?" + qs : ""}`);
}
function obtenerEnvio(id) {
  return request(`/api/v1/envios/${id}`);
}
function eventosDeEnvio(id) {
  return request(`/api/v1/envios/${id}/eventos`);
}
function asignarEnvio(id, data) {
  return request(`/api/v1/envios/${id}/asignar`, { method: "PATCH", body: data });
}
function actualizarEstadoEnvio(id, data) {
  return request(`/api/v1/envios/${id}/estado`, { method: "PATCH", body: data });
}
function registrarPruebaEntrega(id, data) {
  return request(`/api/v1/envios/${id}/prueba-entrega`, { method: "POST", body: data });
}

// ---------- Salud ----------

function healthGateway() {
  return request("/health");
}