from ape import accounts

def deploy(token, accounts):
    token.transfer(accounts[1], 100, gas_price="20 gwei", sender=accounts[0])
