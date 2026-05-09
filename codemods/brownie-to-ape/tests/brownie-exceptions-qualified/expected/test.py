import ape
from ape.exceptions import ContractLogicError

def test_error():
    try:
        do_something()
    except ContractLogicError as e:
        pass
