"""LumenOS Protocol — root entrypoint.

The full Mission Control game lives in ``dashboard/app.py`` (the Streamlit
Cloud entrypoint). This shim lets you launch the same app from the repository
root with ``streamlit run app.py``.
"""

import os
import runpy

_TARGET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard", "app.py")

runpy.run_path(_TARGET, run_name="__main__")
