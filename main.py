from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import json
from langchain_core.tools import tool
from agent import StreamingAgentExecutor

app = Flask(__name__)
CORS(app)

Gemini_API_KEY = "AIzaSyDaM0twsGt6Rv5M2pY4ze4lZlKc7IQWuiQ"
NEWS_API_KEY ="d38c1bc951a94d1baf1ba87e7adda74c"
SERPAPI_API_KEY ="14ac1ec6347d01ae4929d4bd869667ca444690946cb21a18d9abe23172a2cfae"

# Global agent instance
agent_executor = StreamingAgentExecutor(max_iterations=5)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    
    def generate():
        for chunk in agent_executor.stream_invoke(message):
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"
    
    return Response(generate(), mimetype='text/plain')

@app.route("/new_chat",methods=["POST"])
def new_chat():
    agent_executor.chat_history = []
    return {"status": "chat history cleared"}, 200

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)