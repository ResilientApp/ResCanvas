# Terminal 1
cd ~/resdb/incubator-resilientdb
./service/tools/kv/server_tools/start_kv_service.sh

# Terminal 2
cd ~/resdb/incubator-resilientdb-graphql
bazel-bin/service/http_server/crow_service_main service/tools/config/interface/client.config service/http_server/server_config.config

# Terminal 3 - for graphql SDK
# conda activate resdbSDK
# cd ~/resdb/incubator-resilientdb-graphql
# python app.py


# Terminal 3 - For ResCanvas backend
#  Exposing 2 api:
#  1. 0.0.0.0:10010/submitNewLine
#     Submit a new request with timestamp $ts and data $value
#     Example Json Request: 
#      {"ts":"1234","value":"value1"} 
curl -X POST http://67.181.112.179:10010/submitNewLine \
    -H "Content-Type: application/json" \
    -d '{"ts":"1234", "value":"value1"}'

#  2. 0.0.0.0:10010/getCanvasData
#     Get all the missing data starting from $from.
#     Example Json Request: 
#      {"from":"2"} 
curl -X GET http://67.181.112.179:10010/getCanvasData \
    -H "Content-Type: application/json" \
    -d '{"from": "2"}'

# Clear redis data
redis-cli
FLUSHALL
exit

cd ./backend
python app.py
# Test: curl -X POST -H "Content-Type: application/json" -d '{"ts": "2024-12-01T00:00:00Z", "value": "{\"drawingId\":\"drawing_123\",\"color\":\"#000000\",\"lineWidth\":5,\"pathData\":[{\"x\":10,\"y\":10},{\"x\":20,\"y\":20}],\"timestamp\":\"2024-12-01T00:00:00Z\"}"}' http://127.0.0.1:10010/submitNewLine




# Terminal 4 - For ResCanvas Front End
cd ./
npm start



# Stop kv_service
killall -9 kv_service
