from application import Module, db
from application.models.news import News
from application.utils import auth
from application.utils.validator import Validator
from application.views.main import main
from flask import render_template, request, abort
from flask.json import jsonify

module = Module('news', __name__, url_prefix='/news')

@main.get("/")
@module.get('/')
def list_all():
    news = News.all()
    return render_template('news/all.html', **{'news': news})


@module.get('/<int:id>')
def news_one(id):
    news = News.get(id)
    news.increment_views()
    return render_template('news/one.html', **{'news': news})

@module.get('/new')
@module.get('/edit/<int:id>')
def news_form(id=None):
    news = News.get(id) or News()
    if id and news.author != auth.service.get_user():
        abort(403)
    return render_template('news/form.html', **{'news': news})

@module.route("/save", methods=['POST'])
def save():
    v = Validator(request.form)
    v.fields('id').integer(nullable=True)
    v.field('title').required()
    v.field('text').required()
    user = auth.service.get_user()
    if not user.is_authorized():
        abort(403)
    if v.is_valid():
        data = v.valid_data
        news = News.get(data.id) or News()
        if news.author and news.author != user:
            abort(403)
        news.title = data.title
        news.text = data.text
        news.author = user
        db.session.add(news)
        db.session.commit()
        return jsonify({'status': 'ok',
                        'news': news.as_dict()})

    return jsonify({'status': 'fail',
                    'errors': v.errors})


@module.delete("/<int:id>")
def delete(id):
    user = auth.service.get_user()
    if user.is_authorized():
        news = News.get(id)
        if news:
            db.session.delete(news)
            db.session.commit()
            return jsonify({'status': 'ok'})

    return jsonify({'status': 'fail'})