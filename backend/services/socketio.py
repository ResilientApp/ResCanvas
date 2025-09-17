from flask_socketio import SocketIO
# Create a SocketIO instance that will be initialized with the Flask app.
socketio = SocketIO(cors_allowed_origins="*", manage_session=False)
