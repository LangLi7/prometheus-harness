FROM python:3.12-slim

# Only the driver is needed: routing, JSON and the HTTP server are stdlib.
RUN pip install --no-cache-dir "psycopg[binary]>=3.2,<4"

WORKDIR /app
COPY server.py .

EXPOSE 8798
CMD ["python", "server.py"]
