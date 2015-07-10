from flask import request, render_template
from application import app

@app.route("/")
def index():
    return render_template('index.html')


@app.route("/session")
@app.route("/session/<text>")
def session_check(text=None):
    s = request.session
    if text:
        s.text = text

    return "This is session check page.<br/>" \
           "Session text: %s" % s.text