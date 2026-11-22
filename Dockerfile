# Gasora: one container with the API and the web app. Data lives in /data (mount a persistent volume there).
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    GASORA_ENV=production GASORA_ROUTING=straight GASORA_DIST=/app/frontend/dist \
    GASORA_DB_URL=sqlite:////data/gasora.db GASORA_EVENTS_PATH=/data/gasora_events.db GASORA_BACKUP_DIR=/data/backups
WORKDIR /app
COPY requirements-server.txt .
RUN pip install -r requirements-server.txt
COPY backend backend
COPY planner planner
COPY predictor predictor
COPY simulator simulator
COPY evaluation evaluation
COPY config.py .
COPY --from=web /web/dist frontend/dist
RUN useradd --system --uid 10001 gasora && mkdir -p /data && chown gasora /data
USER gasora
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4).status == 200 else 1)"
# ONE worker: SQLite is the database, and the login limiter and settings live in the process.
CMD ["uvicorn", "backend.serve:build", "--factory", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
