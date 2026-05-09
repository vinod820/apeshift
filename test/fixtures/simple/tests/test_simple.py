import pytest
from brownie import SimpleStorage, accounts
import brownie

@pytest.fixture
def simple_storage(SimpleStorage, accounts):
    return SimpleStorage.deploy({'from': accounts[0]})

def test_retrieve(simple_storage):
    assert simple_storage.retrieve() == 0

def test_store(simple_storage, accounts):
    simple_storage.store(15, {'from': accounts[0]})
    assert simple_storage.retrieve() == 15

def test_revert(simple_storage, accounts):
    with brownie.reverts():
        simple_storage.store(0, {'from': accounts[0]})

def test_vm_error(simple_storage):
    try:
        simple_storage.store(0, {'from': accounts[0]})
    except brownie.exceptions.VirtualMachineError as e:
        assert "revert" in str(e)
