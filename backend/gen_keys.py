from nacl.signing import SigningKey
import base58

# generate new keypair
sk = SigningKey.generate()
pk = sk.verify_key

pub_b58 = base58.b58encode(pk.encode()).decode()

priv_seed = sk.encode()[:32]
priv_b58 = base58.b58encode(priv_seed).decode()

print("PUBLIC KEY:   ", pub_b58)
print("PRIVATE KEY:  ", priv_b58)
