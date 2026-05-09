import pytest
from brownie import exceptions

def test_revert(fund_me, accounts):
    with pytest.raises(exceptions.VirtualMachineError):
        fund_me.withdraw({'from': accounts[1]})
