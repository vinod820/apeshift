from ape import accounts, project

def deploy():
    token = project.Token.deploy(sender=accounts.test_accounts[0])
    last = project.Token.deployments[-1]
    return token
