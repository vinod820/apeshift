from ape import chain, networks, provider

def test_balance(accounts):
    bal = provider.get_balance(accounts[0].address)
    block = chain.blocks.head.number
    chain_id = networks.provider.network.chain_id
