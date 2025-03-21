import nacl from './nacl-fast-es.js'
import { decode, encode } from './base64.js'

export const generate = async () => {
  const curve = 'ed25519'

  const keys = nacl.sign.keyPair() 

  return {
    curve,
    public: encode(keys.publicKey) + '.' + curve,
    private: encode(keys.secretKey) + '.' + curve,
    id: '@' + encode(keys.publicKey) + '.' + curve
  }
}

export const loadOrCreate = async (filename) => {

}

export const sign = async (keys, hash) => {

}

export const verify = async (keys, sig, hash) => {

}

