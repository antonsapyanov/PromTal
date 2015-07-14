from flask import Blueprint


class Module(Blueprint):
    __all = []

    def __init__(self, *args, **kwargs):
        Blueprint.__init__(self, *args, **kwargs)
        self.__all.append(self)

    def post(self, rule, **options):
        def wrap(f):
            options['methods'] = ['POST']
            return self.route(rule, **options)(f)
        return wrap

    def get(self, rule, **options):
        def wrap(f):
            options['methods'] = ['GET']
            return self.route(rule, **options)(f)
        return wrap

    def delete(self, rule, **options):
        def wrap(f):
            options['methods'] = ['DELETE']
            return self.route(rule, **options)(f)
        return wrap

    def put(self, rule, **options):
        def wrap(f):
            options['methods'] = ['PUT']
            return self.route(rule, **options)(f)
        return wrap

    @classmethod
    def get_all(cls):
        return cls.__all