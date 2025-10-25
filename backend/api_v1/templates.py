from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth
from services.db import mongo_client
from config import DB_NAME
from datetime import datetime

templates_v1_bp = Blueprint('templates_v1', __name__, url_prefix='/api/v1/templates')


@templates_v1_bp.route('', methods=['GET'])
def list_templates():
    category = request.args.get('category')
    query = {} if not category else {'category': category}
    try:
        coll = mongo_client[DB_NAME]['templates']
        docs = list(coll.find(query).limit(200))
        # convert ObjectId to string
        for d in docs:
            d['id'] = str(d.get('_id'))
            d.pop('_id', None)
        return jsonify({'status': 'ok', 'templates': docs})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@templates_v1_bp.route('', methods=['POST'])
@require_auth
def create_template():
    user = g.current_user
    data = request.get_json(force=True) or {}
    try:
        template = {
            'name': data.get('name'),
            'description': data.get('description'),
            'category': data.get('category'),
            'tags': data.get('tags', []),
            'is_public': bool(data.get('is_public', False)),
            'author_id': getattr(user, '_id', None) or user.get('_id') if isinstance(user, dict) else None,
            'canvas': data.get('canvas', {}),
            'created_at': datetime.utcnow()
        }
        coll = mongo_client[DB_NAME]['templates']
        res = coll.insert_one(template)
        return jsonify({'status': 'ok', 'template_id': str(res.inserted_id)}), 201
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
