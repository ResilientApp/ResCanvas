from flask import Blueprint, request, jsonify

export_bp = Blueprint("export", __name__, url_prefix="/api/export")

@export_bp.route("/start", methods=["POST"])
def start_export():
    data = request.get_json() or {}
    return jsonify({"status": "not_implemented", "received": bool(data)}), 501
