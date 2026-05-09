from brownie import SimpleStorage, accounts

def main():
    account = accounts[0]
    simple_storage = SimpleStorage.deploy({'from': account})
    print(simple_storage.retrieve())
