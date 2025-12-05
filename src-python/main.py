from flask import Flask


# Testing the Coderabbit integration
app = Flask(__name__)

@app.route("/")
def hello_world():
    return {"message": "Hello from Python!"}

if __name__ == "__main__":
    app.run(port=5000, debug=True)
