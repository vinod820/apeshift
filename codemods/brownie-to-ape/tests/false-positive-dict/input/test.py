# Non-Brownie dict with 'from' key — should NOT be rewritten
def send_email(data):
    msg = {'from': 'alice@example.com', 'to': 'bob@example.com'}
    send(msg)
