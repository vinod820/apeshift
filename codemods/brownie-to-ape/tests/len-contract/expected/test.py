from ape import project

def count():
    return len(project.Token.deployments)
