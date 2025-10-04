# app.py

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import json, logging
from werkzeug.exceptions import HTTPException

# Import Blueprints
from routes.clear_canvas import clear_canvas_bp
from routes.new_line import new_line_bp
from routes.get_canvas_data import get_canvas_data_bp
from routes.undo_redo import undo_redo_bp
from routes.metrics import metrics_bp
from routes.auth import auth_bp
from routes.rooms import rooms_bp
from routes.submit_room_line import submit_room_line_bp
from routes.admin import admin_bp
from routes.get_canvas_data_room import get_canvas_data_room_bp
from services.db import redis_client
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from config import *

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:10008", "http://127.0.0.1:10008"])  # Enable CORS for frontend


@app.after_request
def add_cors_headers(response):
    """Ensure CORS headers are present on every response, including error responses.
    This complements flask-cors and guards against cases where exception paths
    or other middleware may return responses without the proper headers.
    """
    try:
        allowed = ["http://localhost:10008", "http://127.0.0.1:10008"]
        origin = request.headers.get("Origin")
        if origin and origin in allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            # Default to first allowed origin for non-matching origins to keep behavior stable in dev
            response.headers.setdefault("Access-Control-Allow-Origin", allowed[0])
            response.headers.setdefault("Access-Control-Allow-Credentials", "true")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type,Authorization")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
    except Exception:
        # Don't let CORS header attachment break the app if something unexpected occurs
        pass
    return response


@app.errorhandler(Exception)
def handle_all_exceptions(e):
    """Return JSON for any unhandled exception and ensure CORS headers are set.
    Flask's after_request may not be invoked for some exception paths, so this
    handler guarantees the browser receives a JSON body with proper CORS headers.
    """
    logger = logging.getLogger(__name__)
    try:
        if isinstance(e, HTTPException):
            # Use the HTTPException's code and description
            payload = {"status": "error", "message": e.description}
            resp = make_response(json.dumps(payload), e.code)
            resp.headers["Content-Type"] = "application/json"
        else:
            logger.exception("Unhandled exception during request")
            payload = {"status": "error", "message": "Internal Server Error"}
            resp = make_response(json.dumps(payload), 500)
            resp.headers["Content-Type"] = "application/json"

        # Mirror the same CORS attachment logic used in after_request
        allowed = ["http://localhost:10008", "http://127.0.0.1:10008"]
        origin = request.headers.get("Origin")
        if origin and origin in allowed:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            resp.headers.setdefault("Access-Control-Allow-Origin", allowed[0])
            resp.headers.setdefault("Access-Control-Allow-Credentials", "true")
        resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type,Authorization")
        resp.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        return resp
    except Exception:
        # If even the error handler fails, return a minimal JSON response
        logger.exception("Error while handling exception")
        out = make_response(json.dumps({"status": "error", "message": "Fatal error"}), 500)
        out.headers.setdefault("Access-Control-Allow-Origin", "http://localhost:10008")
        out.headers.setdefault("Access-Control-Allow-Credentials", "true")
        out.headers.setdefault("Access-Control-Allow-Headers", "Content-Type,Authorization")
        out.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        out.headers["Content-Type"] = "application/json"
        return out

# Initialize SocketIO and set it in the service module
from flask_socketio import SocketIO
import services.socketio_service as socketio_service
# Use threading async_mode to make the development server's socket handling
# robust across host network reconnects and hibernation/resume cycles.
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
socketio_service.socketio = socketio
socketio_service.register_socketio_handlers()
# Register Blueprints
app.register_blueprint(clear_canvas_bp)
app.register_blueprint(new_line_bp)
app.register_blueprint(get_canvas_data_bp)
app.register_blueprint(undo_redo_bp)
app.register_blueprint(metrics_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(rooms_bp)
app.register_blueprint(submit_room_line_bp)
app.register_blueprint(get_canvas_data_room_bp)
app.register_blueprint(admin_bp)

if __name__ == '__main__':
    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        logger = __import__('logging').getLogger(__name__)
        logger.error("Initialize res-canvas-draw-count if not present in Redis: ", init_count)
        init_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {
                "data": {
                    "id": "res-canvas-draw-count",
                    "value": 0
                }
            }
        }

        commit_transaction_via_graphql(init_payload)
        redis_client.set('res-canvas-draw-count', 0)
    socketio.run(app, debug=True, host="0.0.0.0", port=10010, allow_unsafe_werkzeug=True)
