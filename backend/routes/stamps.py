
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson import ObjectId
from datetime import datetime
import base64
import os
import uuid

from services.db import get_db
from middleware.validators import validate_json
from middleware.auth import require_auth

stamps_bp = Blueprint('stamps', __name__)

@stamps_bp.route('/stamps', methods=['GET'])
@jwt_required()
def get_stamps():
    try:
        user_id = get_jwt_identity()
        db = get_db()

        stamps_collection = db.stamps
        user_stamps = list(stamps_collection.find(
            {"user_id": user_id, "deleted": {"$ne": True}},
            {"_id": 0}        ))

        return jsonify({
            "success": True,
            "stamps": user_stamps
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error fetching stamps: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to fetch stamps"
        }), 500

@stamps_bp.route('/stamps', methods=['POST'])
@jwt_required()
@validate_json(['name', 'category'])
def create_stamp():
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        required_fields = ['name', 'category']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    "success": False,
                    "error": f"Missing required field: {field}"
                }), 400

        if not data.get('emoji') and not data.get('image'):
            return jsonify({
                "success": False,
                "error": "Either emoji or image must be provided"
            }), 400

        valid_categories = ['nature', 'shapes', 'animals', 'objects', 'symbols', 'custom']
        if data['category'] not in valid_categories:
            return jsonify({
                "success": False,
                "error": f"Invalid category. Must be one of: {', '.join(valid_categories)}"
            }), 400

        stamp_id = str(uuid.uuid4())

        image_url = None
        if data.get('image'):
            try:
                image_data = data['image']
                if ',' in image_data:
                    header, image_data = image_data.split(',', 1)

                if 'png' in header.lower():
                    ext = 'png'
                elif 'jpg' in header.lower() or 'jpeg' in header.lower():
                    ext = 'jpg'
                elif 'gif' in header.lower():
                    ext = 'gif'
                else:
                    ext = 'png'
                stamps_dir = os.path.join(current_app.instance_path, 'stamps')
                os.makedirs(stamps_dir, exist_ok=True)

                filename = f"{stamp_id}.{ext}"
                filepath = os.path.join(stamps_dir, filename)

                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(image_data))

                image_url = f"/api/stamps/image/{filename}"

            except Exception as e:
                current_app.logger.error(f"Error saving stamp image: {str(e)}")
                return jsonify({
                    "success": False,
                    "error": "Failed to save stamp image"
                }), 500

        stamp_doc = {
            "id": stamp_id,
            "user_id": user_id,
            "name": data['name'].strip(),
            "category": data['category'],
            "emoji": data.get('emoji'),
            "image": image_url,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "deleted": False
        }

        db = get_db()
        stamps_collection = db.stamps
        stamps_collection.insert_one(stamp_doc)

        response_stamp = {k: v for k, v in stamp_doc.items() if k != '_id'}

        return jsonify({
            "success": True,
            "stamp": response_stamp
        }), 201

    except Exception as e:
        current_app.logger.error(f"Error creating stamp: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to create stamp"
        }), 500

@stamps_bp.route('/stamps/<stamp_id>', methods=['PUT'])
@jwt_required()
@validate_json(['name', 'category'])
def update_stamp(stamp_id):
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        db = get_db()
        stamps_collection = db.stamps

        existing_stamp = stamps_collection.find_one({
            "id": stamp_id,
            "user_id": user_id,
            "deleted": {"$ne": True}
        })

        if not existing_stamp:
            return jsonify({
                "success": False,
                "error": "Stamp not found"
            }), 404

        update_data = {
            "name": data.get('name', existing_stamp['name']).strip(),
            "category": data.get('category', existing_stamp['category']),
            "updated_at": datetime.utcnow()
        }

        if 'emoji' in data:
            update_data['emoji'] = data['emoji']

        stamps_collection.update_one(
            {"id": stamp_id, "user_id": user_id},
            {"$set": update_data}
        )

        updated_stamp = stamps_collection.find_one(
            {"id": stamp_id, "user_id": user_id},
            {"_id": 0}
        )

        return jsonify({
            "success": True,
            "stamp": updated_stamp
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error updating stamp: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to update stamp"
        }), 500

@stamps_bp.route('/stamps/<stamp_id>', methods=['DELETE'])
@jwt_required()
def delete_stamp(stamp_id):
    try:
        user_id = get_jwt_identity()

        db = get_db()
        stamps_collection = db.stamps

        existing_stamp = stamps_collection.find_one({
            "id": stamp_id,
            "user_id": user_id,
            "deleted": {"$ne": True}
        })

        if not existing_stamp:
            return jsonify({
                "success": False,
                "error": "Stamp not found"
            }), 404

        stamps_collection.update_one(
            {"id": stamp_id, "user_id": user_id},
            {"$set": {"deleted": True, "deleted_at": datetime.utcnow()}}
        )

        return jsonify({
            "success": True,
            "message": "Stamp deleted successfully"
        }), 200

    except Exception as e:
        current_app.logger.error(f"Error deleting stamp: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to delete stamp"
        }), 500

@stamps_bp.route('/stamps/image/<filename>', methods=['GET'])
def get_stamp_image(filename):
    try:
        stamps_dir = os.path.join(current_app.instance_path, 'stamps')
        filepath = os.path.join(stamps_dir, filename)

        if not os.path.exists(filepath):
            return jsonify({
                "success": False,
                "error": "Image not found"
            }), 404

        from flask import send_file
        return send_file(filepath)

    except Exception as e:
        current_app.logger.error(f"Error serving stamp image: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to serve image"
        }), 500

@stamps_bp.route('/stamps/import', methods=['POST'])
@jwt_required()
def import_stamps():
    try:
        user_id = get_jwt_identity()

        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "No file provided"
            }), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "No file selected"
            }), 400

        if file.filename.endswith('.json'):
            import json
            try:
                data = json.load(file)
                stamps = data.get('stamps', [])

                db = get_db()
                stamps_collection = db.stamps
                imported_count = 0

                for stamp_data in stamps:
                    if 'name' in stamp_data and 'category' in stamp_data:
                        stamp_doc = {
                            "id": str(uuid.uuid4()),
                            "user_id": user_id,
                            "name": stamp_data['name'],
                            "category": stamp_data.get('category', 'custom'),
                            "emoji": stamp_data.get('emoji'),
                            "image": stamp_data.get('image'),
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                            "deleted": False
                        }
                        stamps_collection.insert_one(stamp_doc)
                        imported_count += 1

                return jsonify({
                    "success": True,
                    "message": f"Successfully imported {imported_count} stamps"
                }), 200

            except json.JSONDecodeError:
                return jsonify({
                    "success": False,
                    "error": "Invalid JSON file"
                }), 400

        else:
            return jsonify({
                "success": False,
                "error": "Unsupported file type. Only JSON files are supported."
            }), 400

    except Exception as e:
        current_app.logger.error(f"Error importing stamps: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to import stamps"
        }), 500

@stamps_bp.route('/stamps/export', methods=['GET'])
@jwt_required()
def export_stamps():
    try:
        user_id = get_jwt_identity()

        db = get_db()
        stamps_collection = db.stamps

        user_stamps = list(stamps_collection.find(
            {"user_id": user_id, "deleted": {"$ne": True}},
            {"_id": 0, "user_id": 0, "created_at": 0, "updated_at": 0, "deleted": 0}
        ))

        export_data = {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "stamps": user_stamps
        }

        from flask import Response
        import json

        response = Response(
            json.dumps(export_data, indent=2),
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename=rescanvas_stamps_{user_id}.json'
            }
        )

        return response

    except Exception as e:
        current_app.logger.error(f"Error exporting stamps: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Failed to export stamps"
        }), 500
