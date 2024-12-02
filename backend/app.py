import json
import time
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # 启用全局 CORS

# External API endpoints
EXTERNAL_API_COMMIT = "http://127.0.0.1:18000/v1/transactions/commit"
EXTERNAL_API_QUERY = "http://127.0.0.1:18000/v1/transactions/"

headers = {"Content-Type": "application/json"}

# POST endpoint: submitNewLine
@app.route('/submitNewLine', methods=['POST'])
def submit_new_line():
    try:
        # Ensure the request has JSON data
        if not request.is_json:
            return jsonify({
                "status": "error",
                "message": "Request Content-Type must be 'application/json'."
            }), 400

        request_data = request.json
        if not request_data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        # Validate required fields
        if 'ts' not in request_data or 'value' not in request_data:
            return jsonify({"status": "error", "message": "Missing required fields: ts and value"}), 400


        # Get the canvas drawing count
        res_canvas_draw_count = 0
        response2 = requests.get(EXTERNAL_API_QUERY+"res-canvas-draw-count", headers=headers)
        # print('response2:',response2.json())
        if response2.status_code // 100 == 2:
            print('Set res-canvas-draw-count response:', response2)
            res_canvas_draw_count = int(response2.json()['value'])
        else:
            raise KeyError("Get method fail.")
        print('res_canvas_draw_count:', res_canvas_draw_count)


        request_data['id'] = "res-canvas-draw-"+str(res_canvas_draw_count)

        print('request.json:',request.json)
        # print('request.headers:',headers)
        # Forward the data to the external API
        response = requests.post(EXTERNAL_API_COMMIT, json=request_data, headers=headers)
        # print('response:',response.text)

        # print('response:',response)
        # Check response status
        if response.status_code // 100 == 2:
            increment_count = {"id":"res-canvas-draw-count","value":res_canvas_draw_count+1}
            response_increment_count = requests.post(EXTERNAL_API_COMMIT, json=increment_count, headers=headers)
            # print('response_increment_count:', response_increment_count)
            

            return jsonify({"status": "success", "message": "Line submitted successfully"}), 201
        else:
            raise KeyError("Set method fail.")
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# GET endpoint: getCanvasData
@app.route('/getCanvasData', methods=['GET'])
def get_canvas_data():
    try:
        # 使用查询参数获取 'from'
        from_ = request.args.get('from')
        if from_ is None:
            return jsonify({"status": "error", "message": "Missing required fields: from"}), 400
        from_ = int(from_)
        print('from_:', from_)

        # Get the canvas drawing count
        res_canvas_draw_count = 0
        response2 = requests.get(EXTERNAL_API_QUERY+"res-canvas-draw-count", headers=headers)
        # print('response2:',response2.json())
        if response2.status_code // 100 == 2:
            # print('Set res-canvas-draw-count response:', response2)
            res_canvas_draw_count = int(response2.json()['value'])
        else:
            raise KeyError("Get method fail.")
        print('res_canvas_draw_count:', res_canvas_draw_count)

        all_missing_data = [] 
        for i in range(from_,res_canvas_draw_count):
            key_id = "res-canvas-draw-"+str(i)
            response = requests.get(EXTERNAL_API_QUERY + key_id)

            if response.status_code == 200:
                # Check for empty response
                if response.text and response.headers.get('Content-Type') == 'application/json':
                    all_missing_data.append(response.json())
                else:
                    all_missing_data.append({"id":key_id,"value":""})
            else:
                raise KeyError("Get method fail.")
            
            time.sleep(0.005)
        print("Return data:", all_missing_data)
        print("Get missing data success from {} to {}".format(from_,res_canvas_draw_count))
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



if __name__ == '__main__':
    # Initialize res-canvas-draw-count.
    init_count={"id":"res-canvas-draw-count","value":0}
    response = requests.post(EXTERNAL_API_COMMIT, json=init_count, headers=headers)
    if response.status_code // 100 == 2:
        print('Set res-canvas-draw-count response:', response)
        app.run(debug=True, host="0.0.0.0", port=10010) # Start the Flask app
    else:
        print('Set res-canvas-draw-count response:', response)