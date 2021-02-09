const { toBN, randomHex } = require('web3-utils')
const { config } = require('cream-config')
const { Keypair } = require('maci-domainobjs')
const { MerkleTree } = require('cream-merkle-tree')
const { revertSnapshot, takeSnapshot } = require('./TestUtil')
const truffleAssert = require('truffle-assertions')
const {
    genProofAndPublicSignals,
    snarkVerify,
    stringifyBigInts,
    unstringifyBigInts,
} = require('cream-circuits')
const {
    bigInt,
    toHex,
    createDeposit,
    createMessage,
    pedersenHash,
    rbigInt,
} = require('libcream')

const Cream = artifacts.require('Cream')
const VotingToken = artifacts.require('VotingToken')
const SignUpToken = artifacts.require('SignUpToken')
const CreamVerifier = artifacts.require('CreamVerifier')
const MiMC = artifacts.require('MiMC')
const MACIFactory = artifacts.require('MACIFactory')
const MACI = artifacts.require('MACI')
const SignUpTokenGatekeeper = artifacts.require('SignUpTokenGatekeeper')
const ConstantInitialVoiceCreditProxy = artifacts.require(
    'ConstantInitialVoiceCreditProxy'
)

const toHex32 = (number) => {
    let str = number.toString(16)
    while (str.length < 64) str = '0' + str
    return str
}

// Ported from old websnark library
// https://github.com/tornadocash/websnark/blob/master/src/utils.js#L74
const toSolidityInput = (proof) => {
    return (
        '0x' +
        unstringifyBigInts([
            proof.pi_a[0],
            proof.pi_a[1],
            proof.pi_b[0][1],
            proof.pi_b[0][0],
            proof.pi_b[1][1],
            proof.pi_b[1][0],
            proof.pi_c[0],
            proof.pi_c[1],
        ])
            .map((x) => toHex32(x))
            .join('')
    )
}

contract('Cream', (accounts) => {
    let cream
    let tree
    let creamVerifier
    let mimc
    let votingToken
    let signUpToken
    let coordinatorPubKey
    let maci
    let maciFactory
    let maciTx
    let snapshotId
    let proving_key
    let groth16
    let circuit
    const LEVELS = config.cream.merkleTrees.toString()
    const ZERO_VALUE = config.cream.zeroValue
    const contractOwner = accounts[0]
    const voter = accounts[1]
    const badUser = accounts[2]
    const coordinator = accounts[3]
    const voter2 = accounts[4]

    // recipient index
    let recipient = 0

    before(async () => {
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
        creamVerifier = await CreamVerifier.deployed()
        mimc = await MiMC.deployed()
        votingToken = await VotingToken.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            votingToken.address,
            LEVELS,
            config.cream.recipients,
            coordinator
        )
        coordinatorPubKey = new Keypair().pubKey
        maciFactory = await MACIFactory.deployed()
        signUpToken = await SignUpToken.deployed()
        const signUpGatekeeper = await SignUpTokenGatekeeper.new(
            signUpToken.address
        )
        const ConstantinitialVoiceCreditProxy = await ConstantInitialVoiceCreditProxy.new(
            config.maci.initialVoiceCreditBalance
        )
        maciTx = await maciFactory.deployMaci(
            signUpGatekeeper.address,
            ConstantinitialVoiceCreditProxy.address,
            coordinatorPubKey.asContractParam()
        )
        const maciAddress = maciTx.logs[2].args[0]
        await signUpToken.transferOwnership(cream.address)
        await cream.setMaci(maciAddress, signUpToken.address, {
            from: accounts[0],
        })
        maci = await MACI.at(maciAddress)
        snapshotId = await takeSnapshot()
    })

    beforeEach(async () => {
        await votingToken.giveToken(voter)
        await votingToken.setApprovalForAll(cream.address, true, {
            from: voter,
        })
    })

    describe('initialize', () => {
        it('should return correct votingToken address', async () => {
            const tokenAddress = await cream.votingToken.call()
            assert.equal(tokenAddress, votingToken.address)
        })

        it('should return correct current token supply amount', async () => {
            const crrSupply = await votingToken.getCurrentSupply()
            assert.equal(crrSupply.toString(), 2)
        })

        it('should return corret token owner address', async () => {
            const ownerOfToken1 = await votingToken.ownerOf(1)
            assert.equal(ownerOfToken1, voter)
        })

        it('should return correct recipient address', async () => {
            const expected = config.cream.recipients[0]
            const returned = await cream.recipients(0)
            assert.equal(expected, returned)
        })

        it('should be able to update verifier contract by owner', async () => {
            const oldVerifier = await cream.verifier()
            const newVerifier = await CreamVerifier.new()
            await cream.updateVerifier(newVerifier.address)
            const result = await cream.verifier()
            assert.notEqual(oldVerifier, result)
        })

        it('should prevent update verifier contract by non-owner', async () => {
            const newVerifier = await CreamVerifier.new()
            try {
                await cream.updateVerifier(newVerifier.address, {
                    from: voter,
                })
            } catch (error) {
                assert.equal(error.reason, 'Ownable: caller is not the owner')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    describe('deposit', () => {
        it('should Fail deposit before calling setMaci()', async () => {
            const newCream = await Cream.new(
                creamVerifier.address,
                votingToken.address,
                LEVELS,
                config.cream.recipients,
                coordinator
            )
            const deposit = createDeposit(rbigInt(31), rbigInt(31))

            try {
                await newCream.deposit(toHex(deposit.commitment), {
                    from: voter,
                })
            } catch (error) {
                assert.equal(error.reason, 'MACI contract have not set yet')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should correctly emit event', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            const tx = await cream.deposit(toHex(deposit.commitment), {
                from: voter,
            })
            truffleAssert.eventEmitted(tx, 'Deposit')
        })

        it('should return correct index', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            const tx = await cream.deposit(toHex(deposit.commitment), {
                from: voter,
            })
            assert.equal(bigInt(tx.logs[0].args.leafIndex), 0)
        })

        it('should be able to find deposit event from commitment', async () => {
            const deposit1 = createDeposit(rbigInt(31), rbigInt(31))
            const tx1 = await cream.deposit(toHex(deposit1.commitment), {
                from: voter,
            })

            // voter 2 deposit
            await votingToken.giveToken(voter2)
            await votingToken.setApprovalForAll(cream.address, true, {
                from: voter2,
            })
            const deposit2 = createDeposit(rbigInt(31), rbigInt(31))
            const tx2 = await cream.deposit(toHex(deposit2.commitment), {
                from: voter2,
            })

            // TODO : load `gemerateMerkleProof` function from cream-lib
            const events = await cream.getPastEvents('Deposit', {
                fromBlock: 0,
            })
            const leaves = events
                .sort(
                    (a, b) =>
                        a.returnValues.leafIndex - b.returnValues.leafIndex
                )
                .map((e) => e.returnValues.commitment)

            for (let i = 0; i < leaves.length; i++) {
                tree.insert(leaves[i])
            }

            let depositEvent = events.find(
                (e) => e.returnValues.commitment === toHex(deposit1.commitment)
            )
            let leafIndex = depositEvent.returnValues.leafIndex

            assert.equal(leafIndex, bigInt(tx1.logs[0].args.leafIndex))

            depositEvent = events.find(
                (e) => e.returnValues.commitment === toHex(deposit2.commitment)
            )
            leafIndex = depositEvent.returnValues.leafIndex

            assert.equal(leafIndex, bigInt(tx2.logs[0].args.leafIndex))
        })

        it('should throw an error for non-token holder', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            try {
                await cream.deposit(toHex(deposit.commitment), {
                    from: badUser,
                })
            } catch (error) {
                assert.equal(
                    error.reason,
                    'Sender does not own appropreate amount of token'
                )
                return
            }
            assert.fail('Expected revert not received')
        })

        // voter and bad user collude pattern
        it('should throw an error for more than two tokens holder', async () => {
            await votingToken.giveToken(badUser)
            await votingToken.setApprovalForAll(cream.address, true, {
                from: badUser,
            })
            await votingToken.setApprovalForAll(badUser, true, {
                from: voter,
            })
            await votingToken.safeTransferFrom(voter, badUser, 1, {
                from: voter,
            })

            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            try {
                await cream.deposit(toHex(deposit.commitment), {
                    from: badUser,
                })
            } catch (error) {
                assert.equal(
                    error.reason,
                    'Sender does not own appropreate amount of token'
                )
                return
            }
            assert.fail('Expected revert not received')

            const balance = await votingToken.balanceOf(badUser)
            assert.equal(2, balance)
        })

        it('should throw an error for same commitment submittion', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            try {
                await cream.deposit(toHex(deposit.commitment), {
                    from: voter,
                })
            } catch (error) {
                assert.equal(error.reason, 'Already submitted')
                return
            }
            assert.fail('Expected revert not received')
        })

        // TODO: add isBeforeVotingDeadline test
    })

    describe('snark proof verification on js side', () => {
        it('should detect tampering', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: deposit.nullifierHash,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof, publicSignals } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            let result = await snarkVerify(proof, publicSignals)
            assert.equal(result, true)

            /* fake public signal */
            publicSignals[0] =
                '133792158246920651341275668520530514036799294649489851421007411546007850802'
            result = await snarkVerify(proof, publicSignals)
            assert.equal(result, false)
        })
    })

    describe('signUpMaci', () => {
        const userKeypair = new Keypair()
        it('should correctly sign up maci', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [toHex(input.root), toHex(input.nullifierHash)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)
            const tx = await cream.signUpMaci(
                userPubKey,
                proofForSolidityInput,
                ...args
            )

            assert.equal(tx.receipt.status, true)
        })

        it('should fail signUp with same proof', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [toHex(input.root), toHex(input.nullifierHash)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)
            await cream.signUpMaci(userPubKey, proofForSolidityInput, ...args)

            try {
                await cream.signUpMaci(
                    userPubKey,
                    proofForSolidityInput,
                    ...args
                )
            } catch (error) {
                assert.equal(
                    error.reason,
                    'The nullifier Has Been Already Spent'
                )
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should prevent double spent with overflow', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [
                toHex(input.root),
                toHex(
                    toBN(stringifyBigInts(input.nullifierHash)).add(
                        toBN(
                            '21888242871839275222246405745257275088548364400416034343698204186575808495617'
                        )
                    )
                ),
            ]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)

            try {
                await cream.signUpMaci(
                    userPubKey,
                    proofForSolidityInput,
                    ...args
                )
            } catch (error) {
                assert.equal(error.reason, 'verifier-gte-snark-scalar-field')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should throw for corrupted merkle tree root', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )
            const fakeRandomRoot = randomHex(32)
            const args = [toHex(fakeRandomRoot), toHex(input.nullifierHash)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)

            try {
                await cream.signUpMaci(
                    userPubKey,
                    proofForSolidityInput,
                    ...args
                )
            } catch (error) {
                assert.equal(error.reason, 'Cannot find your merkle root')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should reject tampered public input on contract side', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            // Use commitment as nullifierHash
            const args = [toHex(input.root), toHex(deposit.commitment)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)

            try {
                await cream.signUpMaci(
                    userPubKey,
                    proofForSolidityInput,
                    ...args
                )
            } catch (error) {
                assert.equal(error.reason, 'Invalid deposit proof')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    describe('publishMessage', () => {
        let userKeypair
        let signUpTx
        beforeEach(async () => {
            userKeypair = new Keypair()
            // Do signUpMaci process
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [toHex(input.root), toHex(input.nullifierHash)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)
            signUpTx = await cream.signUpMaci(
                userPubKey,
                proofForSolidityInput,
                ...args
            )
        })

        it('should correctly publishMessage', async () => {
            const userStateIndex = 1
            const recipientIndex = 0
            const nonce = 1
            const [message, encPubKey] = createMessage(
                userStateIndex,
                userKeypair,
                null,
                coordinatorPubKey,
                recipientIndex,
                null,
                nonce
            )

            const tx = await maci.publishMessage(
                message.asContractParam(),
                encPubKey.asContractParam()
            )

            truffleAssert.eventEmitted(tx, 'PublishMessage')
        })

        it('should correctly publish key change message', async () => {
            const newUserKeyPair = new Keypair()
            const userStateIndex = 1
            const nonce = 1
            const [message, encPubKey] = createMessage(
                userStateIndex,
                userKeypair,
                newUserKeyPair,
                coordinatorPubKey,
                null,
                null,
                nonce
            )

            const tx = await maci.publishMessage(
                message.asContractParam(),
                encPubKey.asContractParam()
            )

            truffleAssert.eventEmitted(tx, 'PublishMessage')
        })

        it('should be able to submit an invalid message', async () => {
            const newUserKeyPair = new Keypair()
            const userStateIndex = 1
            const recipientIndex = 0
            const nonce = 1
            const [message1, encPubKey1] = createMessage(
                userStateIndex,
                userKeypair,
                newUserKeyPair,
                coordinatorPubKey,
                null,
                null,
                nonce
            )
            const tx1 = await maci.publishMessage(
                message1.asContractParam(),
                encPubKey1.asContractParam()
            )

            const [message2, encPubKey2] = createMessage(
                userStateIndex,
                userKeypair,
                null,
                coordinatorPubKey,
                recipientIndex,
                null,
                nonce + 1
            )
            const tx2 = await maci.publishMessage(
                message2.asContractParam(),
                encPubKey2.asContractParam()
            )

            truffleAssert.eventEmitted(tx1, 'PublishMessage')
            truffleAssert.eventEmitted(tx2, 'PublishMessage')
        })

        it('should be able to submit an invalid recipient index', async () => {
            const newUserKeyPair = new Keypair()
            const userStateIndex = 1
            const recipientIndex = 99
            const nonce = 1
            const [message, encPubKey] = createMessage(
                userStateIndex,
                userKeypair,
                null,
                coordinatorPubKey,
                recipientIndex,
                null,
                nonce
            )
            const tx = await maci.publishMessage(
                message.asContractParam(),
                encPubKey.asContractParam()
            )

            truffleAssert.eventEmitted(tx, 'PublishMessage')
        })

        it('should be able to submit message batch', async () => {
            let nonce
            const messages = []
            const encPubKeys = []
            const numMessages = 2
            const userStateIndex = 1

            for (
                let recipientIndex = 1;
                recipientIndex < numMessages + 1;
                recipientIndex++
            ) {
                nonce = recipientIndex
                const [message, encPubKey] = createMessage(
                    userStateIndex,
                    userKeypair,
                    null,
                    coordinatorPubKey,
                    recipientIndex,
                    null,
                    nonce
                )
                messages.push(message.asContractParam())
                encPubKeys.push(encPubKey.asContractParam())
            }

            await cream.submitMessageBatch(messages, encPubKeys)
        })
    })

    describe('publishTallyHash', () => {
        it('should correctly publish tally hash', async () => {
            const hash = 'hash'
            const tx = await cream.publishTallyHash(hash, { from: coordinator })
            truffleAssert.eventEmitted(tx, 'TallyPublished')
        })

        it('should revert if non-coordinator try to publish tally hash', async () => {
            const hash = 'hash'
            try {
                await cream.publishTallyHash(hash)
            } catch (error) {
                assert.equal(error.reason, 'Sender is not the coordinator')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should revert with an empty string', async () => {
            try {
                await cream.publishTallyHash('', { from: coordinator })
            } catch (error) {
                assert.equal(error.reason, 'Tally hash cannot be empty string')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    describe('withdraw', () => {
        beforeEach(async () => {
            const userKeypair = new Keypair()
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [toHex(input.root), toHex(input.nullifierHash)]

            const userPubKey = userKeypair.pubKey.asContractParam()
            const proofForSolidityInput = toSolidityInput(proof)
            await cream.signUpMaci(userPubKey, proofForSolidityInput, ...args)

            const userStateIndex = 1
            const recipientIndex = 0
            const nonce = 1
            const [message, encPubKey] = createMessage(
                userStateIndex,
                userKeypair,
                null,
                coordinatorPubKey,
                recipientIndex,
                null,
                nonce
            )

            await maci.publishMessage(
                message.asContractParam(),
                encPubKey.asContractParam()
            )

            const hash = 'hash'
            await cream.publishTallyHash(hash, { from: coordinator })
        })

        it('should tally be approved', async () => {
            const tx = await cream.approveTally()
            truffleAssert.eventEmitted(tx, 'TallyApproved')
            assert.isTrue(await cream.approved())
        })

        it('should revert before approval', async () => {
            try {
                await cream.withdraw(1, { from: coordinator })
            } catch (error) {
                assert.equal(error.reason, 'Tally result is not approved yet')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should revert if non-coordinator try to withdraw', async () => {
            await cream.approveTally()
            try {
                await cream.withdraw(1, { from: voter })
            } catch (error) {
                assert.equal(error.reason, 'Sender is not the coordinator')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should correctly work and emit event', async () => {
            await cream.approveTally()
            const tx = await cream.withdraw(1, { from: coordinator })
            truffleAssert.eventEmitted(tx, 'Withdrawal')
        })

        it('should correctly transfer token to recipient', async () => {
            await cream.approveTally()
            const tx = await cream.withdraw(0, { from: coordinator })
            const newTokenOwner = await votingToken.ownerOf(1)
            assert.equal(config.cream.recipients[0], newTokenOwner)
        })
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
    })
})
