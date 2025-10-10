# syntax=docker/dockerfile:1
# Backend Dockerfile

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy source
COPY backend /app

# Environment defaults (override via compose)
ENV FLASK_ENV=production \
    PYTHONPATH=/app

EXPOSE 10010

CMD ["python", "app.py"]
