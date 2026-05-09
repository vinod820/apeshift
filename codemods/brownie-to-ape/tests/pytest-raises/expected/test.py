import pytest
from ape.exceptions import ContractLogicError

def test_revert(fund_me, accounts):
    with pytest.raises(ContractLogicError):
        fund_me.withdraw(sender=accounts[1])
