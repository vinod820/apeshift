from brownie import Token, accounts

def deploy():
    token = Token.deploy({'from': accounts[0]})
    last = Token[-1]
    return token
