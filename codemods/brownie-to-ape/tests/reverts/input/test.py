import brownie

def test_revert(token, accounts):
    with brownie.reverts("insufficient balance"):
        token.transfer(accounts[1], 10**30, {'from': accounts[0]})
