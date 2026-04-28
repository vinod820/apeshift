from brownie import Contract, accounts, web3, chain
import brownie

def test_balance():
    bal = web3.eth.getBalance(accounts[0].address)
    assert bal > 0

def test_event(token, accounts):
    tx = token.transfer(accounts[1], 100, {'from': accounts[0]})
    val = tx.events["Transfer"][0]["value"]
    assert val == 100

def test_chain_id():
    cid = web3.eth.chainId
    assert cid == 1337

def test_vm_revert(token, accounts):
    with brownie.reverts("insufficient balance"):
        token.transfer(accounts[1], 10**30, {'from': accounts[0]})
