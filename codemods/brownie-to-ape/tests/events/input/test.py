def test_event(token, accounts):
    tx = token.transfer(accounts[1], 100, {'from': accounts[0]})
    val = tx.events["Transfer"][0]["value"]
    count = len(tx.events["Transfer"])
