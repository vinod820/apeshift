from brownie import network
import brownie.network as network

def get_network():
    return network.show_active()
