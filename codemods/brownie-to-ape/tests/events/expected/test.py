def test_event(token, accounts):
    tx = token.transfer(accounts[1], 100, sender=accounts[0])
    val = tx.events.filter(contract.Transfer)[0].value
    count = len(tx.events.filter(contract.Transfer))
