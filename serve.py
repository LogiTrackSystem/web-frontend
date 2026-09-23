"""
Servidor estático simple para el frontend de LogiTrack.

Uso:
    python serve.py            # sirve en http://localhost:8080
    python serve.py 9090       # puerto custom
    python serve.py 9090 0.0.0.0   # expone a la red local (para demos en el aula)

Recordá que el API Gateway debe estar corriendo para que el panel funcione.
"""
import http.server
import socketserver
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Cabeceras útiles para desarrollo: evita cachés y habilita CORS
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):  # silencioso
        pass


def main():
    port = 8080
    host = "127.0.0.1"
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    if len(sys.argv) > 2:
        host = sys.argv[2]

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    handler = functools.partial(Handler, directory=".")
    with socketserver.TCPServer((host, port), handler) as httpd:
        print(f"-> Frontend LogiTrack disponible en http://{host}:{port}")
        print("   (Ctrl+C para detener)")
        httpd.serve_forever()


if __name__ == "__main__":
    import functools

    main()