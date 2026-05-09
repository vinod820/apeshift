from brownie import network

def setup():
    network.connect("mainnet")
    network.disconnect()
