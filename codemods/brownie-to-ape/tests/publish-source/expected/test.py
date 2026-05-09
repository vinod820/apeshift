from ape import project

def verify():
    project.Token.publish_source(token_instance)
    info = project.Token.get_verification_info()
