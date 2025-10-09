from flask import Blueprint, jsonify, request
import json
import logging
from services.db import redis_client
from benchmarks.benchmark_runner import run_all

logger = logging.getLogger(__name__)

metrics_bp = Blueprint('metrics', __name__)


@metrics_bp.route('/runBenchmarks', methods=['POST'])
def run_benchmarks():
    """Run the benchmark runner. Accepts optional JSON body with rounds_redis, rounds_mongo, rounds_graphql."""
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


@metrics_bp.route('/metrics', methods=['GET'])
def get_metrics():
    """Return the latest stored metrics from Redis (if present)."""
    try:
        v = redis_client.get("rescanvas:metrics:latest")
        if not v:
            return jsonify({"status": "error", "message": "No metrics available"}), 404
        obj = json.loads(v)
        return jsonify({"status": "ok", "metrics": obj}), 200
    except Exception as e:
        logger.exception("Error fetching metrics")
        return jsonify({"status": "error", "message": str(e)}), 500
