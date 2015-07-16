import os
from application.utils.auth_middleware import AuthMiddleware

from flask import Flask, request
from beaker.middleware import SessionMiddleware

from application.db import db, redis
from application.config import config
from application.module import Module
from application.utils.session import Session
from application.views import *


templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')


def create_app(config_name):
    app = Flask(__name__, template_folder=templates_dir, static_folder=static_folder)
    app.config.from_object(config[config_name])
    app.wsgi_app = AuthMiddleware(app.wsgi_app)

    db.init_app(app)
    redis.init_app(app)

    from application import models

    for _module in Module.get_all():
        app.register_blueprint(_module)

    # for rule in app.url_map.iter_rules():
    #     print(rule, rule.methods)

    return app
