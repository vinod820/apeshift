import brownie

def test_error():
    try:
        do_something()
    except brownie.exceptions.VirtualMachineError as e:
        pass
