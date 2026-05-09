import pytest

@pytest.fixture(autouse=True)
def isolate(fn_isolation  # TODO(brownie-to-ape): remove fn_isolation — Ape handles test isolation natively via its pytest plugin):
    pass
