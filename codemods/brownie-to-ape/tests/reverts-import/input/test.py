from brownie import reverts

def test_revert(token, accounts):
    with reverts("insufficient balance"):
        token.transfer(accounts[1], 10**30, sender=accounts[0])
