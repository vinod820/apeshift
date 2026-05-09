from ape import networks

def setup():
    networks.connect("mainnet")
    networks.disconnect()
