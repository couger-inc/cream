import {
    parseArtifact,
    getDefaultSigner,
} from 'maci-contracts'

import {
    PubKey,
    PrivKey,
    Keypair,
    Command,
} from 'maci-domainobjs'

import {
    genRandomSalt,
} from 'maci-crypto'

import {
    promptPwd,
    validateEthAddress,
    validateSaltSize,
    validateSaltFormat,
    contractExists,
    checkDeployerProviderConnection,
    batchTransactionRequests,
} from './utils'

import {readJSONFile} from 'maci-common'
import {contractFilepath} from './config'

import {
    DEFAULT_ETH_PROVIDER,
} from './defaults'

const { ethers } = require('hardhat')

const DEFAULT_SALT = genRandomSalt()

const configureSubparser = (subparsers: any) => {
    const parser = subparsers.addParser(
        'publish',
        { addHelp: true },
    )

    parser.addArgument(
        ['-p', '--pubkey'],
        {
            required: true,
            type: 'string',
            help: 'The MACI public key which should replace the user\'s public key in the state tree',
        }
    )

    parser.addArgument(
        ['-x', '--contract'],
        {
            type: 'string',
            help: 'The MACI contract address',
        }
    )

    const maciPrivkeyGroup = parser.addMutuallyExclusiveGroup({ required: true })

    maciPrivkeyGroup.addArgument(
        ['-dsk', '--prompt-for-maci-privkey'],
        {
            action: 'storeTrue',
            help: 'Whether to prompt for your serialized MACI private key',
        }
    )

    maciPrivkeyGroup.addArgument(
        ['-sk', '--privkey'],
        {
            action: 'store',
            type: 'string',
            help: 'Your serialized MACI private key',
        }
    )

    parser.addArgument(
        ['-i', '--state-index'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The user\'s state index',
        }
    )

    parser.addArgument(
        ['-v', '--vote-option-index'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The vote option index',
        }
    )

    parser.addArgument(
        ['-w', '--new-vote-weight'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The new vote weight',
        }
    )

    parser.addArgument(
        ['-n', '--nonce'],
        {
            required: true,
            action: 'store',
            type: 'int',
            help: 'The message nonce',
        }
    )

    parser.addArgument(
        ['-s', '--salt'],
        {
            action: 'store',
            type: 'string',
            help: 'The message salt',
        }
    )

    parser.addArgument(
        ['-o', '--poll-id'],
        {
            action: 'store',
            required: true,
            type: 'string',
            help: 'The Poll ID',
        }
    )
}

const publish = async (args: any) => {
    // User's MACI public key
    if (!PubKey.isValidSerializedPubKey(args.pubkey)) {
        console.error('Error: invalid MACI public key')
        return 1
    }

    const userMaciPubKey = PubKey.unserialize(args.pubkey)


    let contractAddrs = readJSONFile(contractFilepath)
    if ((!contractAddrs||!contractAddrs["MACI"]) && !args.contract) {
        console.error('Error: MACI contract address is empty')
        return 1
    }
    const maciAddress = args.contract ? args.contract: contractAddrs["MACI"]

    // MACI contract
    if (!validateEthAddress(maciAddress)) {
        console.error('Error: invalid MACI contract address')
        return 1
    }

    // Ethereum provider
    const ethProvider = args.eth_provider ? args.eth_provider : DEFAULT_ETH_PROVIDER

    // The user's MACI private key
    let serializedPrivkey
    if (args.prompt_for_maci_privkey) {
        serializedPrivkey = await promptPwd('Your MACI private key')
    } else {
        serializedPrivkey = args.privkey
    }

    if (!PrivKey.isValidSerializedPrivKey(serializedPrivkey)) {
        console.error('Error: invalid MACI private key')
        return 1
    }

    const userMaciPrivkey = PrivKey.unserialize(serializedPrivkey)
    // State index
    const stateIndex = BigInt(args.state_index)
    if (stateIndex < 0) {
        console.error('Error: the state index must be greater than 0')
        return
    }

    // Vote option index
    const voteOptionIndex = BigInt(args.vote_option_index)

    if (voteOptionIndex < 0) {
        console.error('Error: the vote option index should be 0 or greater')
        return
    }

    // The nonce
    const nonce = BigInt(args.nonce)

    if (nonce < 0) {
        console.error('Error: the nonce should be 0 or greater')
        return
    }

    // The salt
    let salt
    if (args.salt) {
        if (!validateSaltFormat(args.salt)) {
            console.error('Error: the salt should be a 32-byte hexadecimal string')
            return
        }

        salt = BigInt(args.salt)

        if (!validateSaltSize(args.salt)) {
            console.error('Error: the salt should less than the BabyJub field size')
            return
        }
    } else {
        salt = DEFAULT_SALT
    }

    const signer = await getDefaultSigner()
    if (! (await contractExists(signer.provider, maciAddress))) {
        console.error('Error: there is no MACI contract deployed at the specified address')
        return 1
    }

    const pollId = args.poll_id

    if (pollId < 0) {
        console.error('Error: the Poll ID should be a positive integer.')
        return 1
    }

    const [ maciContractAbi ] = parseArtifact('MACI')
    const [ pollContractAbi ] = parseArtifact('Poll')

	const maciContractEthers = new ethers.Contract(
        maciAddress,
        maciContractAbi,
        signer,
    )

    const pollAddr = await maciContractEthers.getPoll(pollId)
    if (! (await contractExists(signer.provider, pollAddr))) {
        console.error('Error: there is no Poll contract with this poll ID linked to the specified MACI contract.')
        return 1
    }

    //const pollContract = new web3.eth.Contract(pollContractAbi, pollAddr)
    const pollContract = new ethers.Contract(
        pollAddr,
        pollContractAbi,
        signer,
    )

    /*
     * TODO: Find a way to batch transaction requests via Hardhat; otherwise,
     * use Multicall
    const [maxValues, coordinatorPubKeyResult] =
        await batchTransactionRequests(
            ethProvider,
            [
                pollContract.methods.maxValues(),
                pollContract.methods.coordinatorPubKey(),
            ],
            wallet.address
        )

    const a = await maxValues()
    */
    const maxValues = await pollContract.maxValues()
    const coordinatorPubKeyResult = await pollContract.coordinatorPubKey()
    const maxVoteOptions = Number(maxValues.maxVoteOptions)

    // Validate the vote option index against the max leaf index on-chain
    if (maxVoteOptions < voteOptionIndex) {
        console.error('Error: the vote option index is invalid')
        throw new Error()
    }

    const coordinatorPubKey = new PubKey([
        BigInt(coordinatorPubKeyResult.x.toString()),
        BigInt(coordinatorPubKeyResult.y.toString()),
    ])
    const pollContractEthers = new ethers.Contract(
        pollAddr,
        pollContractAbi,
        signer,
    )

    // The new vote weight
    const newVoteWeight = BigInt(args.new_vote_weight)

    const encKeypair = new Keypair()

    const command = new Command(
        stateIndex,
        userMaciPubKey,
        voteOptionIndex,
        newVoteWeight,
        nonce,
        pollId,
        salt,
    )
    const signature = command.sign(userMaciPrivkey)
    const message = command.encrypt(
        signature,
        Keypair.genEcdhSharedKey(
            encKeypair.privKey,
            coordinatorPubKey,
        )
    )

    let tx
    try {
        tx = await pollContractEthers.publishMessage(
            message.asContractParam(),
            encKeypair.pubKey.asContractParam(),
            { gasLimit: 1000000 },
        )
        await tx.wait()

        console.log('Transaction hash:', tx.hash)
        console.log('Ephemeral private key:', encKeypair.privKey.serialize())
    } catch(e: any) {
        if (e.message) {
            if (e.message.endsWith('PollE03')) {
                console.error('Error: the voting period is over.')
            } else {
                console.error('Error: the transaction failed.')
                console.error(e.message)
            }
        }
        return 1
    }

    return 0
}

export {
    publish,
    configureSubparser,
}
