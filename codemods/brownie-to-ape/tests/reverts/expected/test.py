import ape

def test_revert(token, accounts):
    with ape.reverts("insufficient balance"):
        token.transfer(accounts[1], 10**30, sender=accounts[0])
