from flask import Blueprint, jsonify, request, Response
import json
import logging
from services.db import redis_client
from benchmarks.benchmark_runner import run_all
from services.metrics import metrics as prometheus_metrics

logger = logging.getLogger(__name__)

metrics_bp = Blueprint('metrics', __name__)


# ============================================================
# Prometheus Metrics Endpoint (Primary endpoint for scraping)
# ============================================================

@metrics_bp.route('/metrics', methods=['GET'])
def get_prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.
    
    Returns metrics in Prometheus text exposition format (version 0.0.4).
    This is the primary endpoint that Prometheus should scrape.
    
    Prometheus config example:
        scrape_configs:
          - job_name: 'rescanvas'
            static_configs:
              - targets: ['localhost:10010']
    """
    try:
        metrics_text = prometheus_metrics.get_prometheus_format()
        return Response(
            metrics_text,
            mimetype='text/plain; version=0.0.4; charset=utf-8',
            status=200
        )
    except Exception as e:
        logger.exception("Error generating Prometheus metrics")
        return Response(
            f"# Error generating metrics: {str(e)}\n",
            mimetype='text/plain',
            status=500
        )


@metrics_bp.route('/metrics/json', methods=['GET'])
def get_metrics_json():
    """
    Return metrics in JSON format for debugging and dashboards.
    
    Unlike /metrics (Prometheus format), this returns structured JSON
    that's easier to use in JavaScript applications.
    """
    try:
        return jsonify({
            "status": "ok",
            "metrics": prometheus_metrics.get_json_format()
        }), 200
    except Exception as e:
        logger.exception("Error fetching metrics JSON")
        return jsonify({"status": "error", "message": str(e)}), 500


@metrics_bp.route('/metrics/health', methods=['GET'])
def metrics_health():
    """Health check endpoint for the metrics service."""
    return Response("OK\n", mimetype='text/plain', status=200)


# ============================================================
# Benchmark Endpoints (for running performance tests)
# ============================================================

@metrics_bp.route('/runBenchmarks', methods=['POST'])
def run_benchmarks():
    """
    Run the benchmark runner synchronously.
    Accepts optional JSON body with keys:
      - rounds_redis (int)
      - rounds_mongo (int)
      - rounds_graphql (int)
    """
    try:
        data = request.get_json(silent=True) or {}
        rr = int(data.get("rounds_redis", 20))
        rm = int(data.get("rounds_mongo", 20))
        rg = int(data.get("rounds_graphql", 3))

        result = run_all(rounds_redis=rr, rounds_mongo=rm, rounds_graphql=rg)
        return jsonify({"status": "ok", "metrics": result}), 200
    except Exception as e:
        logger.exception("Error running benchmarks")
        return jsonify({"status": "error", "message": str(e)}), 500


@metrics_bp.route('/metrics/cached', methods=['GET'])
def get_cached_metrics():
    """Return the latest cached benchmark metrics from Redis (if available)."""
    try:
        v = redis_client.get("rescanvas:metrics:latest")
        if not v:
            return jsonify({"status": "error", "message": "No cached metrics available"}), 404
        obj = json.loads(v)
        return jsonify({"status": "ok", "metrics": obj}), 200
    except Exception as e:
        logger.exception("Error fetching cached metrics")
        return jsonify({"status": "error", "message": str(e)}), 500