from brownie import Token

def verify():
    Token.publish_source(token_instance)
    info = Token.get_verification_info()
