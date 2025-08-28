# app.py

from flask import Flask
from flask_cors import CORS

# Import Blueprints
from routes.clear_canvas import clear_canvas_bp
from routes.new_line import new_line_bp
from routes.get_canvas_data import get_canvas_data_bp
from routes.undo_redo import undo_redo_bp
from routes.metrics import metrics_bp
from routes.auth import auth_bp
from routes.rooms import rooms_bp
from routes.submit_room_line import submit_room_line_bp
from routes.get_canvas_data_room import get_canvas_data_room_bp
from services.db import redis_client
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from config import *

app = Flask(__name__)
CORS(app)  # Enable global CORS

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

    app.run(debug=True, host="0.0.0.0", port=10010)
