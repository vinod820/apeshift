from ape import chain

def test_chain():
    chain.mine(100)
    snap = chain.snapshot()
    chain.restore()
