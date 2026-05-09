# Uppercase class NOT imported from brownie — should NOT be rewritten
class DataFrame:
    pass

def process():
    df = DataFrame.deploy()
    return len(DataFrame)
