from flask import render_template, redirect, url_for

from application import Module
from application.utils import auth

module = Module('admin', __name__, url_prefix='/admin')


@module.before_request
def before_request():
    user = auth.service.get_user()
    if not user.is_authorized():
        return redirect(url_for('login.login'))
    if not user.is_admin and ('moderator' not in [r.name for r in user.roles]):
            return render_template('403.html')


@module.get('/')
def admin_index():
    return redirect(url_for('admin.s_users'))


@module.get("/logout")
def logout():
    return redirect(url_for('login.login'))
