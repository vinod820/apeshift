from brownie import (
    accounts,
    chain,
    network,
    Token
)

def deploy():
    token = Token.deploy({'from': accounts[0]})
    return token
