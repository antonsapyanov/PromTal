from flask import render_template, request, current_app, flash, url_for, redirect, jsonify, abort

from application.views.admin.main import admin
from application.models.user import User
from application.forms.admin.user import EditUserForm
from application.db import db
from application.utils.validator import Validator
from application.bl.admin import add_user_data_to_db


@admin.get('/users_list')
def users_list():
    users = User.query.order_by(User.full_name.asc()).all()
    return render_template('admin/users/users.html', users=users)


@admin.get('/users')
def users_index():
    users = User.query.order_by(User.full_name.asc())
    page = request.args.get('page', 1, type=int)
    pagination = users.paginate(
        page,
        per_page=current_app.config['ADMIN_USERS_PER_PAGE'],
        error_out=False
    )
    users = pagination.items
    return render_template(
        'admin/users/index.html',
        users=users,
        pagination=pagination
    )


@admin.get('/users/edit/<int:id>')
@admin.post('/users/edit/<int:id>')
def edit_user_profile(id):
    user = User.get_by_id(id)
    form = EditUserForm()
    if form.validate_on_submit():
        user.full_name = form.full_name.data
        user.mobile_phone = form.mobile_phone.data
        user.inner_phone = form.inner_phone.data
        user.birth_date = form.birth_date.data
        user.avatar = form.avatar.data
        user.skype = form.skype.data
        db.session.add(user)
        flash('The profile has been updated.')
        return redirect(url_for('admin.users_index'))
    form.full_name.data = user.full_name
    form.mobile_phone.data = user.mobile_phone
    form.inner_phone.data = user.inner_phone
    form.birth_date.data = user.birth_date
    form.avatar.data = user.avatar
    form.skype.data = user.skype
    return render_template(
        'admin/users/edit_user_profile.html',
        form=form,
        user=user
    )


@admin.get('/users/delete/<int:id>')
def delete_user_profile(id):
    user = User.get_by_id(id)
    db.session.delete(user)
    db.session.commit()
    return redirect(url_for('admin.users_index'))


@admin.get('/users/add')
def add_user():
    return render_template('admin/users/add_user_profile.html')


@admin.post('/users/add')
def add_user_post():
    v = Validator(request.form)
    v.field('name').required()
    v.field('surname').required()
    v.field('email').required().email()
    v.field('login').required()
    v.field('department').required()
    v.field('groups').required()
    v.field('mobile_phone').required()
    if v.is_valid():
        data = {
            'name': request.form.name,
            'surname': request.form.surname,
            'email': request.form.email,
            'login': request.form.login,
            'department': request.form.department,
            'groups': request.form.groups,
            'mobile_phone': request.form.mobile_phone
        }

        # TODO Check if user with such login or email already exists
        add_user_data_to_db(data)

        return jsonify({"status": "ok"})
    return jsonify({"status": "fail",
                    "errors": v.errors})