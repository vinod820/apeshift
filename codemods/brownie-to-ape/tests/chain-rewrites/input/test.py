from brownie import chain

def test_chain():
    chain.sleep(100)
    snap = chain.snapshot()
    chain.revert()
