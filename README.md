# LogiTrack — Web Frontend

Panel de gestión (SPA) para los microservicios de **LogiTrack**. Consume el
[API Gateway](../api-gateway) (`http://localhost:8002`), que a su vez reenvía a
**Fleet Service** (vehículos y conductores) y a **Shipment Service** (envíos).

Stack: **HTML + CSS + JavaScript vanilla** — sin build, sin dependencias. Se abre
directo en el navegador o se sirve con el servidor estático incluido.

## Funcionalidades

- **Dashboard**: KPIs (envíos, pendientes, en tránsito, entregados, flota), distribución por estado y últimos envíos.
- **Vehículos**: listado de la flota y alta de vehículos.
- **Conductores**: listado y alta de conductores (con asignación de vehículo).
- **Envíos**:
  - Listado con filtros por estado y cliente.
  - Detalle con línea de tiempo de eventos.
  - Asignación de vehículo.
  - Cambio de estado (`en_transito`, `con_incidencia`, `devuelto`).
  - Registro de prueba de entrega (marca el envío como `entregado`).

## Cómo correr

### 1. Levantar los microservicios (backend)

En tres terminales distintas (ver README de cada servicio):

```bash
# Terminal 1 — Fleet Service (puerto 8000)
cd fleet-service
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Shipment Service (puerto 8001)
cd shipment-service
alembic upgrade head
uvicorn app.main:app --reload --port 8001

# Terminal 3 — API Gateway (puerto 8002) ← el frontend habla con este
cd api-gateway
uvicorn app.main:app --reload --port 8002
```

> ⚠️ **CORS**: el navegador bloquea llamadas entre orígenes. El API Gateway debe
> tener habilitado CORS. Ya viene incluido en `app/main.py` de `api-gateway`
> (middleware `CORSMiddleware`).

### 2. Servir el frontend

```bash
cd web-frontend
python serve.py
# → http://localhost:8080
```

O simplemente abrí `index.html` en el navegador (funciona igual, el API se llama
por HTTP).

### 3. Configurar la URL de la API

Por defecto apunta a `http://localhost:8002`. Si el gateway corre en otra
máquina o puerto, configurá la URL:

- Botón **⚙️ Configurar API** en la barra lateral (se guarda en el navegador), o
- Parámetro en la URL: `http://localhost:8080/?api=http://192.168.1.20:8002`

## Estructura

```
web-frontend/
├── index.html          # SPA
├── css/styles.css      # estilos
├── js/
│   ├── config.js       # URL de la API
│   ├── api.js          # cliente HTTP (fetch)
│   └── app.js          # lógica, vistas y modales
├── serve.py            # servidor estático de desarrollo
└── README.md
```

## Endpoints usados (API Gateway)

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/v1/vehiculos` | Listar vehículos |
| POST | `/api/v1/vehiculos` | Crear vehículo |
| GET | `/api/v1/conductores` | Listar conductores |
| POST | `/api/v1/conductores` | Crear conductor |
| GET | `/api/v1/envios` | Listar envíos (`?estado=`, `?cliente_id=`) |
| POST | `/api/v1/envios` | Crear envío |
| GET | `/api/v1/envios/{id}` | Detalle de envío |
| GET | `/api/v1/envios/{id}/eventos` | Historial de eventos |
| PATCH | `/api/v1/envios/{id}/asignar` | Asignar vehículo/ruta |
| PATCH | `/api/v1/envios/{id}/estado` | Cambiar estado |
| POST | `/api/v1/envios/{id}/prueba-entrega` | Prueba de entrega |