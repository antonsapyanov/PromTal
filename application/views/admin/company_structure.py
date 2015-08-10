from flask import render_template, request, current_app, flash, url_for, redirect, jsonify, abort
from application.views.admin.main import admin
from application.models.department import Department
from application.models.user import User
from application import db
from application.utils.datatables_sqlalchemy.datatables import row2dict
from application.utils.validator import Validator
from application.utils.datatables_sqlalchemy.datatables import ColumnDT, DataTables


def _default_value(chain):
    return chain or '-'


def get_departments(parent_id=None):
    dep_list = []
    departments = db.session.query(Department).filter_by(parent_id=parent_id).all()
    for dep in departments:
        dep_dict = row2dict(dep)
        dep_dict['dep_list'] = get_departments(dep.id)
        dep_list.append(dep_dict)
    if len(departments):
        return dep_list
    else:
        return None


@admin.get('/company-structure')
def company_structure():
    departments = get_departments()
    return render_template('admin/company_structure/structure.html', departments=departments)


@admin.get('/department/<int:dep_id>')
def department_info(dep_id):
    department = Department.get_by_id(dep_id)
    return render_template('admin/company_structure/department.html', department=department)


@admin.get('/dep_users_json/<int:dep_id>')
def dep_users_json(dep_id):
    columns = []
    columns.append(ColumnDT('id', filter=_default_value))
    columns.append(ColumnDT('full_name', filter=_default_value))
    columns.append(ColumnDT('email', filter=_default_value))
    columns.append(ColumnDT('login', filter=_default_value))
    columns.append(ColumnDT('mobile_phone', filter=_default_value))
    columns.append(ColumnDT('inner_phone', filter=_default_value))
    query = db.session.query(User).filter_by(department_id=dep_id)
    rowTable = DataTables(request, User, query, columns)
    a = rowTable.output_result()
    departments = Department.get_all()
    for i in a['aaData']:
        row_id = i['0']
        last_columns = str(len(columns))
        dep_html = ''
        for dep in departments:
            print(dep.id, dep.name)
            sel = 'selected' if dep.id == dep_id else ''
            dep_html += "<option value='"+str(dep.id)+"/"+row_id+"' "+sel+">"+dep.name+"</option>"
        manage_html = """
          <select onchange="change_user_dep(this.value)" id="first-disabled" class="selectpicker" data-hide-disabled="true" data-live-search="true" data-width="200px">
            <optgroup label="Доп возможности">
              <option value="0/"""+row_id+"""">Удалить из отдела</option>
            </optgroup>
            <optgroup label="Отделы">"""+dep_html+"""</optgroup>
          </select>
          <script type="text/javascript">$('.selectpicker').selectpicker({style: 'btn-default',size: 5});</script>
          """
        i[last_columns] = manage_html
        src_foto = ''
        user = User.get_by_id(row_id)
        if user.photo:
            src_foto = user.photo.get_url('thumbnail')
        else:
            src_foto = '/static/img/no_photo.jpg'
        i['1'] = """<img src="{src}" class="foto-small-struct">""".format(src = src_foto) + i['1']
    return jsonify(**a)


@admin.get('/company-structure/edit/<int:dep_id>')
def edit_structure(dep_id):
    department = Department.get_by_id(dep_id)
    dep_parents = Department.get_parent_all(dep_id)
    return render_template('admin/company_structure/edit_structure.html',
                            department=department,
                            dep_parents = dep_parents)


@admin.post('/company-structure/edit-post/')
def edit_structure_post():
    v = Validator(request.form)
    v.field("name_structure").required()
    if v.is_valid():
        name_structure = v.valid_data.name_structure
        Department.rename(request.form.get("department_id"), name_structure)
        Department.set_parent(request.form.get("department_id"), request.form.get("parent"))
        print(request.form.get("parent"))
        return jsonify({"status": "ok"})
    return jsonify({"status": "fail",
                    "errors": v.errors})


@admin.get('/company-structure/add/<int:dep_id>')
def add_structure(dep_id):
    department = Department.get_by_id(dep_id)
    return render_template('admin/company_structure/add_structure.html', department=department)


@admin.post('/company-structure/add-post/')
def add_structure_post():
    v = Validator(request.form)
    v.field("name_structure").required()
    if v.is_valid():
        name_structure = v.valid_data.name_structure
        Department.add(request.form.get("department_id"), name_structure)
        return jsonify({"status": "ok"})
    return jsonify({"status": "fail",
                    "errors": v.errors})


@admin.get('/company-structure/delete/<int:dep_id>')
def delete_structure(dep_id):
    Department.delete(dep_id)
    return redirect(url_for('admin.company_structure'))


@admin.get('/company-structure/manage-users/<int:dep_id>')
def manage_users(dep_id):
    department = Department.get_by_id(dep_id)
    return render_template('admin/company_structure/manage_users.html', department=department)


@admin.get('/company-structure/get-users/<int:dep_id>/<user_name>/')
def get_list_users(dep_id, user_name):
    department = Department.get_by_id(dep_id)
    users = User.find_user(dep_id, user_name)
    print(users)
    users_list = []
    a = {"users":[]}
    for u in users:
        src_foto, dep_name = '', ''
        user = User.get_by_id(u.id)
        if user.photo:
            src_foto = user.photo.get_url('thumbnail')
        else:
            src_foto = '/static/img/no_photo.jpg'
        if u.department_id:
            dep_name = u.department.name or ''
        else:
            dep_name = ''
        a["users"].append({"u_id":u.id,
                           "full_name":u.full_name,
                           "dep_name":dep_name,
                           "src_foto":src_foto})
    return jsonify(**a)


@admin.get('/company-structure/set-user-dep/<int:dep_id>/<int:user_id>/')
def set_user_to_dep(dep_id, user_id):
    print("\n\n\n", dep_id, user_id)
    User.add_user2dep(dep_id, user_id)
    return jsonify({'status': 'ok'})