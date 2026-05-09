from brownie import accounts

def deploy(token, accounts):
    token.transfer(accounts[1], 100, {'from': accounts[0], 'gas_price': "20 gwei"})
