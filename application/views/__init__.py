import os
import glob
from .admin.main import module

__all__ = []
directory = os.path.dirname(__file__)
modules = glob.glob(directory+"/*.py")
modules += glob.glob(directory+"/*/__init__.py")

for f in modules:
    f = f.replace("__init__.py", "").replace(directory, "") \
        .replace(".py", "", -1).strip('/').strip('\\')
    if f:
        __all__.append(os.path.basename(f))
