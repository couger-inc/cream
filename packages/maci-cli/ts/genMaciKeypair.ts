import {
    Keypair,
} from 'maci-domainobjs'

const configureSubparser = (subparsers: any) => {
    subparsers.addParser(
        'genMaciKeypair',
        { addHelp: true },
    )
}

const genMaciKeypair = async (args: any) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    args; // to suppress never read error
    const keypair = new Keypair()

    const serializedPrivKey = keypair.privKey.serialize()
    const serializedPubKey = keypair.pubKey.serialize()
    console.log('Private key:', serializedPrivKey)
    console.log('Public key: ', serializedPubKey)
}

export {
    genMaciKeypair,
    configureSubparser,
}
