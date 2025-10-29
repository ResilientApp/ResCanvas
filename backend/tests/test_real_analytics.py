"""
Test that analytics are using real stroke data, not mocked/generated data.
This test verifies the implementation is complete and uses actual database strokes.
"""
import pytest
from services.db import mongo_client, analytics_aggregates_coll, analytics_coll
from workers.analytics_aggregation_worker import aggregate_once, extract_stroke_data
import time


def test_extract_stroke_data_from_real_strokes():
    """Test that extract_stroke_data reads actual strokes from canvasCache"""
    # Find a room with transaction-based strokes
    stroke_with_trans = mongo_client['canvasCache']['strokes'].find_one({
        'transactions.0.value.asset.data.stroke.pathData': {'$exists': True, '$ne': []}
    })
    
    assert stroke_with_trans is not None, "No strokes with pathData found in database"
    
    # Get the room ID from the stroke
    tx = stroke_with_trans['transactions'][0]
    stroke_data = tx['value']['asset']['data']['stroke']
    room_id = stroke_data['roomId']
    
    # Extract stroke data for this room
    result = extract_stroke_data(room_id)
    
    # Verify we got real data
    assert result['stroke_count'] > 0, "Should find at least one stroke"
    assert len(result['colors']) > 0, "Should extract real colors"
    assert len(result['users']) > 0, "Should extract real users"
    
    # Verify color is from actual stroke, not mocked
    expected_color = stroke_data['color']
    assert expected_color in result['colors'], f"Should extract color {expected_color} from stroke"
    
    # Verify user is from actual stroke
    expected_user = stroke_data['user']
    assert expected_user in result['users'], f"Should extract user {expected_user} from stroke"
    
    print(f"✓ Room {room_id}: {result['stroke_count']} strokes, {len(result['colors'])} colors, {len(result['users'])} users")


def test_heatmap_points_from_real_coordinates():
    """Test that heatmap points come from actual pathData coordinates"""
    # Find a room with pathData
    stroke = mongo_client['canvasCache']['strokes'].find_one({
        'transactions.0.value.asset.data.stroke.pathData': {'$exists': True, '$ne': []}
    })
    
    assert stroke is not None
    
    tx = stroke['transactions'][0]
    stroke_data = tx['value']['asset']['data']['stroke']
    room_id = stroke_data['roomId']
    path_data = stroke_data['pathData']
    
    # Extract stroke data
    result = extract_stroke_data(room_id)
    
    # Verify heatmap points were generated
    if path_data and len(path_data) > 0:
        assert len(result['heatmap_points']) > 0, "Should generate heatmap points from pathData"
        
        # Verify points are normalized to 0-1 range
        for point in result['heatmap_points']:
            assert 0 <= point['x'] <= 1, "X coordinate should be normalized to 0-1"
            assert 0 <= point['y'] <= 1, "Y coordinate should be normalized to 0-1"
            assert 0 <= point['intensity'] <= 1, "Intensity should be 0-1"
        
        print(f"✓ Generated {len(result['heatmap_points'])} heatmap points from {len(path_data)} pathData coordinates")


def test_aggregation_uses_real_data():
    """Test that aggregate_once uses real stroke data from database"""
    # Find a room with pathData
    stroke = mongo_client['canvasCache']['strokes'].find_one({
        'transactions.0.value.asset.data.stroke.pathData': {'$exists': True, '$ne': []}
    })
    
    assert stroke is not None
    
    tx = stroke['transactions'][0]
    stroke_data = tx['value']['asset']['data']['stroke']
    room_id = stroke_data['roomId']
    expected_color = stroke_data['color']
    expected_user = stroke_data['user']
    
    # Create an analytics event for this room
    analytics_coll.insert_one({
        'roomId': room_id,
        'eventType': 'stroke_created',
        'anonUserId': 'test_user',
        'ts': int(time.time() * 1000)
    })
    
    # Run aggregation
    count = aggregate_once(batch_limit=1000)
    assert count > 0, "Should process events"
    
    # Check the aggregate
    agg = analytics_aggregates_coll.find_one({'roomId': room_id})
    assert agg is not None, f"Should create aggregate for room {room_id}"
    
    # Verify real data (not mocked)
    assert expected_color in agg.get('top_colors', []), f"Should have real color {expected_color}"
    assert agg['active_users'] >= 1, "Should count real users"
    
    # Most importantly: verify heatmap comes from real coordinates
    heatmap = agg.get('heatmap_points', [])
    if stroke_data.get('pathData') and len(stroke_data['pathData']) > 0:
        assert len(heatmap) > 0, "Should have heatmap points from real pathData"
    
    print(f"✓ Aggregate for room {room_id}:")
    print(f"  - {agg['total_strokes']} strokes")
    print(f"  - Colors: {agg.get('top_colors', [])}")
    print(f"  - {len(heatmap)} heatmap points")


def test_no_mocked_data_in_analytics():
    """Verify analytics do not contain any generated/mocked data"""
    # Run aggregation
    aggregate_once(batch_limit=1000)
    
    # Get all aggregates
    all_aggs = list(analytics_aggregates_coll.find({}))
    
    for agg in all_aggs:
        room_id = agg.get('roomId')
        
        # Verify colors come from actual strokes
        colors = agg.get('top_colors', [])
        if colors:
            # Query actual strokes for this room
            query = {
                '$or': [
                    {'roomId': room_id},
                    {'transactions.0.value.asset.data.stroke.roomId': room_id}
                ]
            }
            
            # Get unique colors from actual strokes (check ALL strokes, not just first 100)
            actual_colors = set()
            for stroke in mongo_client['canvasCache']['strokes'].find(query):
                if 'transactions' in stroke and stroke['transactions']:
                    tx = stroke['transactions'][0]
                    stroke_data = tx.get('value', {}).get('asset', {}).get('data', {}).get('stroke', {})
                    color = stroke_data.get('color')
                    if color:
                        actual_colors.add(color)
            
            # Verify all reported colors exist in actual strokes
            for color in colors:
                assert color in actual_colors, f"Color {color} in aggregate for room {room_id} not found in actual strokes - might be mocked!"
    
    print(f"✓ Verified {len(all_aggs)} aggregates use real stroke data (no mocking)")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
