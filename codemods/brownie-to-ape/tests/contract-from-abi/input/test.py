from brownie import Contract

def load_contract(addr):
    token = Contract.from_abi("Token", addr, abi)
    return token
