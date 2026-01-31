"""
Prometheus Metrics Endpoint for ResCanvas

This module provides a Flask Blueprint that exposes metrics in Prometheus format
for scraping by Prometheus server and visualization in Grafana.

Endpoints:
    GET /metrics         - Prometheus text format
    GET /metrics/json    - JSON format for debugging
    GET /metrics/health  - Health check endpoint
"""

from flask import Blueprint, Response, jsonify
from services.metrics import metrics

# Create Blueprint
metrics_bp = Blueprint('metrics', __name__, url_prefix='/metrics')


@metrics_bp.route('')
@metrics_bp.route('/')
def prometheus_metrics():
    """
    Expose metrics in Prometheus text format.
    
    This endpoint is scraped by Prometheus server at regular intervals.
    Configure in prometheus.yml:
        - job_name: 'rescanvas'
          static_configs:
            - targets: ['localhost:10010']
    """
    prometheus_output = metrics.get_prometheus_format()
    return Response(
        prometheus_output,
        mimetype='text/plain; version=0.0.4; charset=utf-8'
    )


@metrics_bp.route('/json')
def json_metrics():
    """
    Expose metrics in JSON format.
    
    Useful for debugging and custom dashboards.
    """
    return jsonify(metrics.get_json_format())


@metrics_bp.route('/health')
def health_check():
    """
    Health check endpoint for load balancers and monitoring.
    
    Returns:
        200 OK if the service is healthy
    """
    return jsonify({
        "status": "healthy",
        "service": "rescanvas-backend",
        "metrics_enabled": True
    })


# Convenience function to register the blueprint
def register_metrics_blueprint(app):
    """
    Register the metrics blueprint with a Flask app.
    
    Usage:
        from routes.metrics_endpoint import register_metrics_blueprint
        register_metrics_blueprint(app)
    """
    app.register_blueprint(metrics_bp)
