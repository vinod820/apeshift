from brownie import exceptions

def test_error():
    try:
        do_something()
    except exceptions.VirtualMachineError as e:
        pass
