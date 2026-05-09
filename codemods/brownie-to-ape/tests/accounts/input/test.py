from brownie import Token, accounts

def deploy():
    return Token.deploy({'from': accounts[0]})

def test_token(accounts):
    # accounts here is the Ape pytest fixture - do NOT rewrite accounts[0]
    token = accounts[0]
