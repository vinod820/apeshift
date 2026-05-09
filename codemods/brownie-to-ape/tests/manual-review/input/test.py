from brownie import accounts
from brownie.network import priority_fee

accounts.add("0x1234...")
priority_fee("2 gwei")
