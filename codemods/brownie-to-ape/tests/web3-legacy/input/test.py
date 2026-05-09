from brownie import web3

def test_balance(accounts):
    bal = web3.eth.getBalance(accounts[0].address)
    block = web3.eth.blockNumber
    chain_id = web3.eth.chainId
