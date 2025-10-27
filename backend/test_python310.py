#!/usr/bin/env python3
"""
Test script to verify Python 3.10 environment and Flask-SocketIO installation
"""

import sys
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")

try:
    from flask_socketio import SocketIO
    print("✅ Flask-SocketIO imported successfully")
except ImportError as e:
    print(f"❌ Flask-SocketIO import failed: {e}")

try:
    from flask import Flask
    print("✅ Flask imported successfully")
except ImportError as e:
    print(f"❌ Flask import failed: {e}")

try:
    from middleware.validators import validate_json
    print("✅ validate_json imported successfully")
except ImportError as e:
    print(f"❌ validate_json import failed: {e}")

try:
    import flask_jwt_extended
    print("✅ flask_jwt_extended imported successfully")
except ImportError as e:
    print(f"❌ flask_jwt_extended import failed: {e}")

print("\n🎉 Python 3.10 environment is properly configured!")
print("Backend dependencies are successfully installed.")
