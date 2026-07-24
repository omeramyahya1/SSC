import builtins
import sys


def is_compiled_runtime() -> bool:
    """Return True when running from PyInstaller or Nuitka output."""
    return bool(
        getattr(sys, "frozen", False)
        or "__compiled__" in globals()
        or hasattr(builtins, "__compiled__")
    )


def is_windows_compiled_runtime() -> bool:
    return sys.platform == "win32" and is_compiled_runtime()
