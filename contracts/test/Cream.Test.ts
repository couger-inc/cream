const fs = require('fs')
const path = require('path')
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
    pedersenHash,
    rbigInt,
} = require('libcream')

const Cream = artifacts.require('Cream')
const SignUpToken = artifacts.require('SignUpToken')
const CreamVerifier = artifacts.require('CreamVerifier')
const MiMC = artifacts.require('MiMC')
const MACIFactory = artifacts.require('MACIfactory')

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
    let tokenContract
    let coordinatorPubKey
    let maciFactory
    let maciTx
    let snapshotId
    let proving_key
    let groth16
    let circuit
    const LEVELS = config.cream.merkleTrees.toString()
    const ZERO_VALUE = config.cream.zeroValue
    const value = config.cream.denomination.toString()
    let recipient = config.cream.recipients[0]
    const fee = bigInt(value).shr(0)
    const contractOwner = accounts[0]
    const voter = accounts[1]
    const relayer = accounts[2]
    const badUser = accounts[3]
    const voter2 = accounts[4]

    before(async () => {
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
        creamVerifier = await CreamVerifier.deployed()
        mimc = await MiMC.deployed()
        tokenContract = await SignUpToken.deployed()
        await Cream.link(MiMC, mimc.address)
        cream = await Cream.new(
            creamVerifier.address,
            tokenContract.address,
            value,
            LEVELS,
            config.cream.recipients
        )
        coordinatorPubKey = new Keypair().pubKey.asContractParam()
        maciFactory = await MACIFactory.deployed()
        maciTx = await maciFactory.deployMaci(
            cream.address,
            cream.address,
            coordinatorPubKey
        )
        await cream.setMaci(maciTx.logs[2].args[0])
        tokenContract = await SignUpToken.deployed()
        snapshotId = await takeSnapshot()
    })

    beforeEach(async () => {
        await tokenContract.giveToken(voter)
        await tokenContract.setApprovalForAll(cream.address, true, {
            from: voter,
        })
    })

    describe('initialize', () => {
        it('should correctly initialize', async () => {
            const denomination = await cream.denomination()
            assert.equal(denomination, value)
        })

        it('should return correct signuptoken address', async () => {
            const tokenAddress = await cream.signUpToken.call()
            assert.equal(tokenAddress, tokenContract.address)
        })

        it('should return correct current token supply amount', async () => {
            const crrSupply = await tokenContract.getCurrentSupply()
            assert.equal(crrSupply.toString(), 2)
        })

        it('should return corret token owner address', async () => {
            const ownerOfToken1 = await tokenContract.ownerOf(1)
            assert.equal(ownerOfToken1, voter)
        })

        it('should return correct recipient address', async () => {
            const expected = recipient
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
        it('Should Fail deposit before calling setMaci()', async () => {
            const newCream = await Cream.new(
                creamVerifier.address,
                tokenContract.address,
                value,
                LEVELS,
                config.cream.recipients
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

        it('should be able to find deposit event from commietment', async () => {
            const deposit1 = createDeposit(rbigInt(31), rbigInt(31))
            const tx1 = await cream.deposit(toHex(deposit1.commitment), {
                from: voter,
            })

            // voter 2 deposit
            await tokenContract.giveToken(voter2)
            await tokenContract.setApprovalForAll(cream.address, true, {
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
            await tokenContract.giveToken(badUser)
            await tokenContract.setApprovalForAll(cream.address, true, {
                from: badUser,
            })
            await tokenContract.setApprovalForAll(badUser, true, {
                from: voter,
            })
            await tokenContract.safeTransferFrom(voter, badUser, 1, {
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

            const balance = await tokenContract.balanceOf(badUser)
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
                relayer: relayer,
                recipient,
                fee,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            const {
                proof,
                publicSignals,
                witness,
                circuit,
            } = await genProofAndPublicSignals(
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

    describe('withdraw', () => {
        it('should correctly work and emit event', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
                nullifier: deposit.nullifier,
                secret: deposit.secret,
                path_elements: merkleProof[0],
                path_index: merkleProof[1],
            }

            let isSpent = await cream.isSpent(toHex(input.nullifierHash))
            assert.isFalse(isSpent)

            const { proof } = await genProofAndPublicSignals(
                input,
                'prod/vote.circom',
                'build/vote.zkey',
                'circuits/vote.wasm'
            )

            const args = [
                toHex(input.root),
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]

            const proofForSolidityInput = toSolidityInput(proof)
            const tx = await cream.withdraw(proofForSolidityInput, ...args, {
                from: relayer,
            })

            // truffleAssert.prettyPrintEmittedEvents(tx)
            truffleAssert.eventEmitted(tx, 'Withdrawal')

            // check if nullifierhash status has changed correctly
            isSpent = await cream.isSpent(toHex(input.nullifierHash))
            assert.isTrue(isSpent)
        })

        it('should correctly transfer token to recipient', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]

            const proofForSolidityInput = toSolidityInput(proof)
            await cream.withdraw(proofForSolidityInput, ...args, {
                from: relayer,
            })

            const newTokenOwner = await tokenContract.ownerOf(1)
            assert.equal(recipient, newTokenOwner)
        })

        it('should prevent excess withdrawal', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            const fake = bigInt('2000000000000000000')
            const args = [
                toHex(input.root),
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(fake),
            ]

            try {
                await cream.withdraw(proofForSolidityInput, ...args, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'Fee exceeds transfer value')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should prevent double spend', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            const args = [
                toHex(input.root),
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]
            await cream.withdraw(proofForSolidityInput, ...args, {
                from: relayer,
            })
            try {
                await cream.withdraw(proofForSolidityInput, ...args, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'The note has been already spent')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should prevent double sepnd with overflow', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            const args = [
                toHex(input.root),
                toHex(
                    toBN(stringifyBigInts(input.nullifierHash)).add(
                        toBN(
                            '21888242871839275222246405745257275088548364400416034343698204186575808495617'
                        )
                    )
                ),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]

            try {
                await cream.withdraw(proofForSolidityInput, ...args, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'verifier-gte-snark-scalar-field')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should throw for corrupted merkle tree root', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            const args = [
                toHex(randomHex(32)),
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]
            try {
                await cream.withdraw(proofForSolidityInput, ...args, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'Cannot find your merkle root')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should reject tampered public input on contract side', async () => {
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            // incorrect nullifierHash, using commitment instead
            let incorrectArgs = [
                toHex(input.root),
                toHex(deposit.commitment),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]

            try {
                await cream.withdraw(proofForSolidityInput, ...incorrectArgs, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'Invalid withdraw proof')
                return
            }
            assert.fail('Expected revert not received')
        })

        it('should throw an error with random recipient', async () => {
            recipient = '0x5aeda56215b167893e80b4fe645ba6d5bab767de'
            const deposit = createDeposit(rbigInt(31), rbigInt(31))
            await tree.insert(deposit.commitment)
            await cream.deposit(toHex(deposit.commitment), { from: voter })
            const root = tree.root
            const merkleProof = tree.getPathUpdate(0)
            const input = {
                root,
                nullifierHash: pedersenHash(deposit.nullifier.leInt2Buff(31))
                    .babyJubX,
                relayer: relayer,
                recipient,
                fee,
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

            const proofForSolidityInput = toSolidityInput(proof)

            const args = [
                toHex(input.root),
                toHex(input.nullifierHash),
                toHex(input.recipient, 20),
                toHex(input.relayer, 20),
                toHex(input.fee),
            ]

            try {
                await cream.withdraw(proofForSolidityInput, ...args, {
                    from: relayer,
                })
            } catch (error) {
                assert.equal(error.reason, 'Recipient do not exist')
                return
            }
            assert.fail('Expected revert not received')
        })
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
        tree = new MerkleTree(LEVELS, ZERO_VALUE)
    })
})
