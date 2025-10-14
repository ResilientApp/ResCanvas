import time
import statistics
from locust import HttpUser, task, between, events
import json
import random

API_BASE = 'http://localhost:10010'


class ResCanvasUser(HttpUser):
    wait_time = between(1, 3)
    host = API_BASE
    
    def on_start(self):
        username = f'loadtest_user_{random.randint(1000, 9999)}'
        password = 'Test123!'
        
        response = self.client.post('/auth/register', json={
            'username': username,
            'password': password
        })
        
        if response.status_code in [201, 400]:
            login_response = self.client.post('/auth/login', json={
                'username': username,
                'password': password
            })
            
            if login_response.status_code == 200:
                data = login_response.json()
                self.token = data.get('token')
                self.username = username
                self.headers = {'Authorization': f'Bearer {self.token}'}
                
                room_response = self.client.post('/rooms', 
                    json={'name': f'Load Test Room {username}', 'type': 'public'},
                    headers=self.headers)
                
                if room_response.status_code == 201:
                    self.room_id = room_response.json()['room']['id']
    
    @task(3)
    def submit_stroke(self):
        if not hasattr(self, 'room_id') or not hasattr(self, 'headers'):
            return
        
        stroke = {
            'id': f'stroke_{int(time.time() * 1000)}_{random.randint(1000, 9999)}',
            'drawingId': f'drawing_{int(time.time())}',
            'user': self.username,
            'color': f'#{random.randint(0, 0xFFFFFF):06x}',
            'lineWidth': random.randint(1, 10),
            'pathData': [[random.randint(0, 800), random.randint(0, 600)] for _ in range(10)],
            'timestamp': int(time.time() * 1000),
            'brushStyle': 'round',
            'order': int(time.time()),
        }
        
        start_time = time.time()
        response = self.client.post(
            f'/rooms/{self.room_id}/strokes',
            json={'stroke': stroke},
            headers=self.headers,
            name='/rooms/[id]/strokes [POST]'
        )
        latency = (time.time() - start_time) * 1000
        
        if response.status_code in [200, 201]:
            events.request.fire(
                request_type='stroke_latency',
                name='stroke_write_latency',
                response_time=latency,
                response_length=len(response.content),
                exception=None,
                context={}
            )
    
    @task(2)
    def get_strokes(self):
        if not hasattr(self, 'room_id') or not hasattr(self, 'headers'):
            return
        
        start_time = time.time()
        response = self.client.get(
            f'/rooms/{self.room_id}/strokes',
            headers=self.headers,
            name='/rooms/[id]/strokes [GET]'
        )
        latency = (time.time() - start_time) * 1000
        
        if response.status_code == 200:
            events.request.fire(
                request_type='stroke_latency',
                name='stroke_read_latency',
                response_time=latency,
                response_length=len(response.content),
                exception=None,
                context={}
            )
    
    @task(1)
    def undo_operation(self):
        if not hasattr(self, 'room_id') or not hasattr(self, 'headers'):
            return
        
        self.client.post(
            f'/rooms/{self.room_id}/undo',
            headers=self.headers,
            name='/rooms/[id]/undo'
        )
    
    @task(1)
    def redo_operation(self):
        if not hasattr(self, 'room_id') or not hasattr(self, 'headers'):
            return
        
        self.client.post(
            f'/rooms/{self.room_id}/redo',
            headers=self.headers,
            name='/rooms/[id]/redo'
        )
    
    @task(1)
    def list_rooms(self):
        if not hasattr(self, 'headers'):
            return
        
        self.client.get('/rooms', headers=self.headers, name='/rooms [GET]')


stroke_write_latencies = []
stroke_read_latencies = []


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    if name == 'stroke_write_latency':
        stroke_write_latencies.append(response_time)
    elif name == 'stroke_read_latency':
        stroke_read_latencies.append(response_time)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    print("\n" + "="*60)
    print("PERFORMANCE BENCHMARK RESULTS")
    print("="*60)
    
    if stroke_write_latencies:
        print(f"\nStroke Write Latency:")
        print(f"  P50: {statistics.median(stroke_write_latencies):.2f}ms")
        print(f"  P95: {statistics.quantiles(stroke_write_latencies, n=20)[18]:.2f}ms")
        print(f"  P99: {statistics.quantiles(stroke_write_latencies, n=100)[98]:.2f}ms")
        print(f"  Mean: {statistics.mean(stroke_write_latencies):.2f}ms")
        print(f"  Min: {min(stroke_write_latencies):.2f}ms")
        print(f"  Max: {max(stroke_write_latencies):.2f}ms")
    
    if stroke_read_latencies:
        print(f"\nStroke Read Latency:")
        print(f"  P50: {statistics.median(stroke_read_latencies):.2f}ms")
        print(f"  P95: {statistics.quantiles(stroke_read_latencies, n=20)[18]:.2f}ms")
        print(f"  P99: {statistics.quantiles(stroke_read_latencies, n=100)[98]:.2f}ms")
        print(f"  Mean: {statistics.mean(stroke_read_latencies):.2f}ms")
        print(f"  Min: {min(stroke_read_latencies):.2f}ms")
        print(f"  Max: {max(stroke_read_latencies):.2f}ms")
    
    print("\n" + "="*60)
