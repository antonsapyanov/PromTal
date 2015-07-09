#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from application.module import Module

__author__ = 's-tar'

module = Module('some_module', __name__)


@module.get("/some_module")
@module.get("/some_module/<param>")
def some_module_page(param=None):
    output = "This is some module page."
    if param:
        output += "<br/>And this is parameter: "+param
    return output

@module.post("/some_module")
def some_module_post():
    return "This is some module POST route."