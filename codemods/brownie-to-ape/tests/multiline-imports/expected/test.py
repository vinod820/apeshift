from ape import accounts, chain, networks, project

def deploy():
    token = project.Token.deploy(sender=accounts.test_accounts[0])
    return token
