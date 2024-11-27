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

cd ./backend
python app.py




# Stop kv_service
killall -9 kv_service
