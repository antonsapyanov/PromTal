from flask import flash

from application import ldap, db, sms_service
from application.utils.datagen import generate_password, generate_inner_phone
from application.models.user import User


class DataProcessingError(Exception):
    def __init__(self, value):
        self.value = value

    def __str__(self):
        return repr(self.value)


def create_user(login, name, surname, email, mobile_phone, department, groups):
    password = generate_password()
    inner_phone = generate_inner_phone()
    ldap_user_attr = {
        'cn': login,
        'userPassword': password,
        'displayName': "{0} {1}".format(name, surname),
        'givenName':  name,
        'sn': surname,
        'mail': email,
        'mobile': mobile_phone,
        'telephoneNumber': inner_phone,
        'departmentNumber': department,
    }

    if not _add_user_to_local_db(login, name, surname, email, department, mobile_phone, inner_phone):
        raise DataProcessingError('Произошла ошибка при добавлении пользователя в локальную базу данных')

    if not _add_user_to_ldap(ldap_user_attr, groups):
        db.session.rollback()
        raise DataProcessingError('Произошла ошибка при добавлении пользователя в каталог LDAP')

    if not sms_service.send_password(mobile_phone.strip('+'), login, password):
        raise DataProcessingError('Произошла ошибка при отправлении запроса на сообщение '
                                  'с логином и паролем пользователя')
    db.session.commit()


def _add_user_to_ldap(user_attr, groups):
    try:
        result = ldap.add_user(attributes=user_attr)
        result &= ldap.add_user_to_groups(user=user_attr['cn'], groups=groups)
        return result
    except:
        return False


def _add_user_to_local_db(login, name, surname, email, department, mobile_phone, inner_phone):
    try:
        user = User(login=login,
                    full_name="{0} {1}".format(name, surname),
                    mobile_phone=mobile_phone,
                    inner_phone=inner_phone,
                    email=email)
        db.session.add(user)
        return True
    except:
        return False


def update_user(login, full_name, email, mobile_phone, inner_phone, birth_date, photo, skype):
    ldap_user_attr = {
        'mobile': mobile_phone,
        'telephoneNumber': inner_phone,
        'displayName': full_name,
        'mail': email
    }

    if not _edit_user_at_local_db(login, full_name, email, mobile_phone, inner_phone, birth_date, photo, skype):
        flash('Произошла ошибка при обновлении пользователя в локальной базе данных', 'error')
        return False
    flash('Пользователь был успешно обновлен в локальной базе данных', 'info')

    if not _edit_user_at_ldap(login, ldap_user_attr):
        flash('Произошла ошибка при обновлении пользователя в каталоге LDAP', 'error')
        return False
    flash('Пользователь был успешно обновлен в каталоге LDAP', 'info')

    return True


def _edit_user_at_local_db(login, full_name, email, mobile_phone, inner_phone, birth_date, photo, skype):
    try:
        user = User.get_by_login(login)
        user.full_name = full_name
        user.email = email
        user.mobile_phone = mobile_phone
        user.inner_phone = inner_phone
        user.skype = skype
        user.birth_date = birth_date if birth_date else user.birth_date
        user.photo = photo if photo else user.photo
        db.session.add(user)
        db.session.commit()
        return True
    except:
        return False


def _edit_user_at_ldap(user, user_attr):
    try:
        result = ldap.modify_user(user, user_attr)
        return result
    except:
        return False
