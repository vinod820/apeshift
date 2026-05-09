from ape import Contract

def load_contract(addr):
    token = Contract.at(addr)  # TODO(brownie-to-ape): verify ABI — original contract_type name and .abi ignored
    return token
