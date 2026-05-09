from ape import accounts, project

def deploy():
    return project.Token.deploy(sender=accounts.test_accounts[0])

def test_token(accounts):
    # accounts here is the Ape pytest fixture - do NOT rewrite accounts[0]
    token = accounts[0]
