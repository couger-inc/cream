import * as assert from 'assert'
import {
    AccQueue,
    IncrementalQuinTree,
    genRandomSalt,
    SNARK_FIELD_SIZE,
    NOTHING_UP_MY_SLEEVE,
    hashLeftRight,
    hash3,
    hash5,
    sha256Hash,
    stringifyBigInts,
    Signature,
} from 'maci-crypto'
import {
    PubKey,
    VerifyingKey,
    Command,
    Message,
    Keypair,
    StateLeaf,
    Ballot,
} from 'maci-domainobjs'

interface TreeDepths {
    intStateTreeDepth: number;
    messageTreeDepth: number;
    messageTreeSubDepth: number;
    voteOptionTreeDepth: number;
}

interface BatchSizes {
    tallyBatchSize: number;
    messageBatchSize: number;
}

interface MaxValues {
    maxUsers: number;
    maxMessages: number;
    maxVoteOptions: number;
}

const STATE_TREE_DEPTH = 10

// Also see: Polls.sol
class Poll {
    public duration: number
    // Note that we only store the PubKey on-chain while this class stores the
    // Keypair for the sake of convenience
    public coordinatorKeypair: Keypair
    public treeDepths: TreeDepths
    public batchSizes: BatchSizes
    public maxValues: MaxValues

    public numSignUps: number

    public pollEndTimestamp: BigInt

    public ballots: Ballot[] = []
    public ballotTree: IncrementalQuinTree

    public messages: Message[] = []
    public messageAq: AccQueue
    public messageTree: IncrementalQuinTree
    public commands: Command[] = []

    public signatures: Signature[] = []
    public encPubKeys: PubKey[] = []
    public STATE_TREE_ARITY = 5
    public MESSAGE_TREE_ARITY = 5
    public VOTE_OPTION_TREE_ARITY = 5

    public stateCopied = false
    public stateLeaves: StateLeaf[] = [blankStateLeaf]
    public stateTree = new IncrementalQuinTree(
        STATE_TREE_DEPTH,
        blankStateLeafHash,
        this.STATE_TREE_ARITY,
        hash5,
    )

    // For message processing
    public numBatchesProcessed = 0
    public currentMessageBatchIndex
    public maciStateRef: MaciState
    public pollId: number

    public sbSalts: {[key: number]: BigInt} = {}
    public resultRootSalts: {[key: number]: BigInt} = {}
    public preVOSpentVoiceCreditsRootSalts: {[key: number]: BigInt} = {}
    public spentVoiceCreditSubtotalSalts: {[key: number]: BigInt} = {}

    // For vote tallying
    public results: BigInt[] = []
    public perVOSpentVoiceCredits: BigInt[] = []
    public numBatchesTallied = 0

    public totalSpentVoiceCredits: BigInt = BigInt(0)

    constructor(
        _duration: number,
        _pollEndTimestamp: BigInt,
        _coordinatorKeypair: Keypair,
        _treeDepths: TreeDepths,
        _batchSizes: BatchSizes,
        _maxValues: MaxValues,
        _maciStateRef: MaciState,
    ) {
        this.duration = _duration
        this.pollEndTimestamp = _pollEndTimestamp
        this.coordinatorKeypair = _coordinatorKeypair
        this.treeDepths = _treeDepths
        this.batchSizes = _batchSizes
        this.maxValues = _maxValues
        this.maciStateRef = _maciStateRef
        this.pollId = _maciStateRef.polls.length
        this.numSignUps = Number(_maciStateRef.numSignUps.toString())

        this.messageTree = new IncrementalQuinTree(
            this.treeDepths.messageTreeDepth,
            NOTHING_UP_MY_SLEEVE,
            this.MESSAGE_TREE_ARITY,
            hash5,
        )
        this.messageAq = new AccQueue(
            this.treeDepths.messageTreeSubDepth,
            this.MESSAGE_TREE_ARITY,
            NOTHING_UP_MY_SLEEVE,
        )

        for (let i = 0; i < this.maxValues.maxVoteOptions; i ++) {
            this.results.push(BigInt(0))
            this.perVOSpentVoiceCredits.push(BigInt(0))
        }

        const blankBallot = Ballot.genBlankBallot(
            this.maxValues.maxVoteOptions,
            _treeDepths.voteOptionTreeDepth,
        )
        this.ballots.push(blankBallot)
    }

    private copyStateFromMaci = () => {
        // Copy the state tree, ballot tree, state leaves, and ballot leaves
        assert(this.maciStateRef.stateLeaves.length === this.maciStateRef.stateTree.nextIndex)

        this.stateLeaves = this.maciStateRef.stateLeaves.map(
            (x) => x.copy()
        )
        this.stateTree = this.maciStateRef.stateTree.copy()

        // Create as many ballots as state leaves
        const emptyBallot = new Ballot(
            this.maxValues.maxVoteOptions,
            this.treeDepths.voteOptionTreeDepth,
        )
        const emptyBallotHash = emptyBallot.hash()
        this.ballotTree = new IncrementalQuinTree(
            STATE_TREE_DEPTH,
            emptyBallot.hash(),
            this.STATE_TREE_ARITY,
            hash5,
        )
        this.ballotTree.insert(emptyBallotHash)

        while (this.ballots.length < this.stateLeaves.length) {
            this.ballotTree.insert(emptyBallotHash)
            this.ballots.push(emptyBallot)
        }

        this.numSignUps = Number(this.maciStateRef.numSignUps.toString())

        this.stateCopied = true
    }

    /*
     * Inserts a Message and the corresponding public key used to generate the
     * ECDH shared key which was used to encrypt said message.
     */
    public publishMessage = (
        _message: Message,
        _encPubKey: PubKey,
    ) => {
        assert(
            _encPubKey.rawPubKey[0] < SNARK_FIELD_SIZE &&
            _encPubKey.rawPubKey[1] < SNARK_FIELD_SIZE
        )
        for (const d of _message.data) {
            assert(d < SNARK_FIELD_SIZE)
        }

        this.encPubKeys.push(_encPubKey)
        this.messages.push(_message)

        const messageLeaf = _message.hash(_encPubKey)
        this.messageAq.enqueue(messageLeaf)
        this.messageTree.insert(messageLeaf)

        // Decrypt the message and store the Command
        const sharedKey = Keypair.genEcdhSharedKey(
            this.coordinatorKeypair.privKey,
            _encPubKey,
        )
        const { command, signature } = Command.decrypt(_message, sharedKey)
        this.commands.push(command)
        this.signatures.push(signature)
    }

    /*
     * Merge all enqueued messages into a tree.
     */
    public mergeAllMessages = (
    ) => {
        this.messageAq.mergeSubRoots(0)
        this.messageAq.merge(this.treeDepths.messageTreeDepth)
        assert(this.isMessageAqMerged())

        // TODO: Validate that a tree from this.messages matches the messageAq
        // main root
    }

    public hasUnprocessedMessages = (): boolean => {
        const batchSize = this.batchSizes.messageBatchSize

        let totalBatches =
            this.messages.length <= batchSize ?
            1
            :
            Math.floor(this.messages.length / batchSize)

        if (
            this.messages.length > batchSize &&
            this.messages.length % batchSize > 0
        ) {
            totalBatches ++
        }

        return this.numBatchesProcessed < totalBatches
    }

    /*
     * Process _batchSize messages starting from the saved index.  This
     * function will process messages even if the number of messages is not an
     * exact multiple of _batchSize. e.g. if there are 10 messages, _index is
     * 8, and _batchSize is 4, this function will only process the last two
     * messages in this.messages, and finally update the zeroth state leaf.
     * Note that this function will only process as many state leaves as there
     * are ballots to prevent accidental inclusion of a new user after this
     * poll has concluded.
     * @param _pollId The ID of the poll associated with the messages to
     *        process
     */
    public processMessages = (
        _pollId: number,
    ) => {
        assert(this.hasUnprocessedMessages(), 'No more messages to process')

        // Require that the message queue has been merged
        assert(this.isMessageAqMerged())
        assert(this.messageAq.hasRoot(this.treeDepths.messageTreeDepth))

        const batchSize = this.batchSizes.messageBatchSize

        if (this.numBatchesProcessed === 0) {
            // The starting index of the batch of messages to process.
            // Note that we process messages in reverse order.
            // e.g if there are 8 messages and the batch size is 5, then
            // the starting index should be 5.
            assert(this.currentMessageBatchIndex == undefined)
        }

        if (this.numBatchesProcessed === 0) {
            // Prevent other polls from being processed until this poll has
            // been fully processed
            this.maciStateRef.pollBeingProcessed = true
            this.maciStateRef.currentPollBeingProcessed = _pollId
        }

        // Only allow one poll to be processed at a time
        if (this.maciStateRef.pollBeingProcessed) {
            assert(this.maciStateRef.currentPollBeingProcessed === _pollId)
        }

        if (this.numBatchesProcessed === 0) {
            const r = this.messages.length % batchSize

            if (r === 0) {
                this.currentMessageBatchIndex =
                    Math.floor(this.messages.length / batchSize) * batchSize
            } else {
                this.currentMessageBatchIndex = this.messages.length
            }


            if (this.currentMessageBatchIndex > 0) {
                if (r === 0) {
                    this.currentMessageBatchIndex -= batchSize
                } else {
                    this.currentMessageBatchIndex -= r
                }
            }

            this.sbSalts[this.currentMessageBatchIndex] = BigInt(0)
        }

        // The starting index must be valid
        assert(this.currentMessageBatchIndex >= 0)
        assert(this.currentMessageBatchIndex % batchSize === 0)

        if (!this.stateCopied) {
            this.copyStateFromMaci()
        }

        // Generate circuit inputs
        const circuitInputs = stringifyBigInts(
            this.genProcessMessagesCircuitInputsPartial(
                this.currentMessageBatchIndex
            )
        )

        const currentStateLeaves: StateLeaf[] = []
        const currentStateLeavesPathElements: any[] = []

        const currentBallots: Ballot[] = []
        const currentBallotsPathElements: any[] = []

        const currentVoteWeights: BigInt[] = []
        const currentVoteWeightsPathElements: any[] = []

        for (let i = 0; i < batchSize; i ++) {
            const m = this.currentMessageBatchIndex + batchSize - i - 1
            const messageIndex = m >= this.messages.length ?
                this.messages.length - 1
                :
                m

            const r = this.processMessage(messageIndex)
            //console.log(messageIndex, r ? 'valid' : 'invalid')

            // If the command is valid
            if (r) {
                // TODO: replace with try/catch after implementing error
                // handling
                const index = r.stateLeafIndex

                currentStateLeaves.unshift(r.originalStateLeaf)
                currentBallots.unshift(r.originalBallot)
                currentVoteWeights.unshift(r.originalVoteWeight)
                currentVoteWeightsPathElements.unshift(r.originalVoteWeightsPathElements)

                currentStateLeavesPathElements.unshift(r.originalStateLeafPathElements)
                currentBallotsPathElements.unshift(r.originalBallotPathElements)

                this.stateLeaves[index] = r.newStateLeaf.copy()
                this.stateTree.update(index, r.newStateLeaf.hash())

                this.ballots[index] = r.newBallot
                this.ballotTree.update(index, r.newBallot.hash())

            } else {
                // Since the command is invalid, use a blank state leaf
                currentStateLeaves.unshift(this.stateLeaves[0].copy())
                currentStateLeavesPathElements.unshift(
                    this.stateTree.genMerklePath(0).pathElements
                )

                currentBallots.unshift(this.ballots[0].copy())
                currentBallotsPathElements.unshift(
                    this.ballotTree.genMerklePath(0).pathElements
                )

                // Since the command is invalid, use vote option index 0
                currentVoteWeights.unshift(this.ballots[0].votes[0])

                // No need to iterate through the entire votes array if the
                // remaining elements are 0
                let lastIndexToInsert = this.ballots[0].votes.length - 1
                while (lastIndexToInsert > 0) {
                    if (this.ballots[0].votes[lastIndexToInsert] === BigInt(0)) {
                        lastIndexToInsert --
                    } else {
                        break
                    }
                }

                const vt = new IncrementalQuinTree(
                    this.treeDepths.voteOptionTreeDepth,
                    BigInt(0),
                    5,
                    hash5,
                )
                for (let i = 0; i <= lastIndexToInsert; i ++) {
                    vt.insert(this.ballots[0].votes[i])
                }
                currentVoteWeightsPathElements.unshift(
                    vt.genMerklePath(0).pathElements
                )

            }
        }
        circuitInputs.currentStateLeaves = currentStateLeaves.map((x) => x.asCircuitInputs())
        circuitInputs.currentStateLeavesPathElements = currentStateLeavesPathElements
        circuitInputs.currentBallots = currentBallots.map((x) => x.asCircuitInputs())
        circuitInputs.currentBallotsPathElements = currentBallotsPathElements
        circuitInputs.currentVoteWeights = currentVoteWeights
        circuitInputs.currentVoteWeightsPathElements = currentVoteWeightsPathElements

        this.numBatchesProcessed ++

        if (this.currentMessageBatchIndex > 0) {
            this.currentMessageBatchIndex -= batchSize
        }

        // TODO: ensure newSbSalt differs from currentSbSalt
        const newSbSalt = genRandomSalt()
        this.sbSalts[this.currentMessageBatchIndex] = newSbSalt

        circuitInputs.newSbSalt = newSbSalt
        const newStateRoot = this.stateTree.root
        const newBallotRoot = this.ballotTree.root
        circuitInputs.newSbCommitment = hash3([
            newStateRoot,
            newBallotRoot,
            newSbSalt,
        ])

        const coordPubKeyHash = this.coordinatorKeypair.pubKey.hash()
        circuitInputs.inputHash = sha256Hash([
            circuitInputs.packedVals,
            coordPubKeyHash,
            circuitInputs.msgRoot,
            circuitInputs.currentSbCommitment,
            circuitInputs.newSbCommitment,
            this.pollEndTimestamp,
        ])

        // If this is the last batch, release the lock
        if (this.numBatchesProcessed * batchSize >= this.messages.length) {
            this.maciStateRef.pollBeingProcessed = false
        }
        return stringifyBigInts(circuitInputs)
    }

    /*
     * Generates inputs for the ProcessMessages circuit.
     */
    public genProcessMessagesCircuitInputsPartial = (
        _index: number,
    ) => {
        const messageBatchSize = this.batchSizes.messageBatchSize

        assert(_index <= this.messages.length)
        assert(_index % messageBatchSize === 0)

        let msgs = this.messages.map((x) => x.asCircuitInputs())
        while (msgs.length % messageBatchSize > 0) {
            msgs.push(msgs[msgs.length - 1])
        }

        msgs = msgs.slice(_index, _index + messageBatchSize)

        let commands = this.commands.map((x) => x.copy())
        while (commands.length % messageBatchSize > 0) {
            commands.push(commands[commands.length - 1])
        }
        commands = commands.slice(_index, _index + messageBatchSize)

        while(this.messageTree.nextIndex < _index + messageBatchSize) {
            this.messageTree.insert(
                this.messageTree.zeroValue
            )
        }

        const messageSubrootPath = this.messageTree.genMerkleSubrootPath(
            _index,
            _index + messageBatchSize,
        )

        assert(
            IncrementalQuinTree.verifyMerklePath(
                messageSubrootPath,
                this.messageTree.hashFunc,
            ) === true
        )

        let batchEndIndex = _index + messageBatchSize
        if (batchEndIndex > this.messages.length) {
            batchEndIndex = this.messages.length
        }

        let encPubKeys = this.encPubKeys.map((x) => x.copy())
        while (encPubKeys.length % messageBatchSize > 0) {
            encPubKeys.push(encPubKeys[encPubKeys.length - 1])
        }
        encPubKeys = encPubKeys.slice(_index, _index + messageBatchSize)

        const stateIndices: number[] = []
        for (let i = 0; i < messageBatchSize; i ++) {
            const stateIndex = Number(commands[i].stateIndex)
            stateIndices.push(stateIndex)
        }

        const msgRoot = this.messageAq.getRoot(this.treeDepths.messageTreeDepth)

        const currentStateRoot = this.stateTree.root
        const currentBallotRoot = this.ballotTree.root
        const currentSbCommitment = hash3([
            currentStateRoot,
            currentBallotRoot,
            this.sbSalts[this.currentMessageBatchIndex],
        ])

        // Generate a SHA256 hash of inputs which the contract provides
        const packedVals =
            BigInt(this.maxValues.maxVoteOptions) +
            (BigInt(this.numSignUps) << BigInt(50)) +
            (BigInt(_index) << BigInt(100)) +
            (BigInt(batchEndIndex) << BigInt(150))

        const coordPubKey = this.coordinatorKeypair.pubKey

        return stringifyBigInts({
            pollEndTimestamp: this.pollEndTimestamp,
            packedVals,
            msgRoot,
            msgs,
            msgSubrootPathElements: messageSubrootPath.pathElements,
            coordPrivKey: this.coordinatorKeypair.privKey.asCircuitInputs(),
            coordPubKey: coordPubKey.asCircuitInputs(),
            encPubKeys: encPubKeys.map((x) => x.asCircuitInputs()),
            currentStateRoot,
            currentBallotRoot,
            currentSbCommitment,
            currentSbSalt: this.sbSalts[this.currentMessageBatchIndex],
        })
    }

    /*
     * Process all messages. This function does not update the ballots or state
     * leaves; rather, it copies and then updates them. This makes it possible
     * to test the result of multiple processMessage() invocations.
     */
    public processAllMessages = () => {
        if (!this.stateCopied) {
            this.copyStateFromMaci()
        }
        const stateLeaves = this.stateLeaves.map((x) => x.copy())
        const ballots = this.ballots.map((x) => x.copy())

        for (let i = 0; i < this.messages.length; i ++) {
            const messageIndex = this.messages.length - i - 1
            const r = this.processMessage(messageIndex)
            if (r) {
                // TODO: replace with try/catch after implementing error
                // handling
                const index = r.stateLeafIndex
                stateLeaves[index] = r.newStateLeaf
                ballots[index] = r.newBallot
            }
        }

        return { stateLeaves, ballots }
    }

    /*
     * Process one message
     */
    private processMessage = (
        _index: number,
    ) => {
        //TODO: throw custom errors for no-ops

        // Ensure that the index is valid
        assert(_index >= 0)
        assert(this.messages.length > _index)

        // Ensure that there is the correct number of ECDH shared keys
        assert(this.encPubKeys.length === this.messages.length)

        const message = this.messages[_index]
        const encPubKey = this.encPubKeys[_index]

        // Decrypt the message
        const sharedKey = Keypair.genEcdhSharedKey(
            this.coordinatorKeypair.privKey,
            encPubKey,
        )
        const { command, signature } = Command.decrypt(message, sharedKey)

        const stateLeafIndex = BigInt(command.stateIndex.valueOf())

        // If the state tree index in the command is invalid, do nothing
        if (
            stateLeafIndex >= BigInt(this.ballots.length) ||
            stateLeafIndex < BigInt(1)
        ) {
            return
        }

        if (stateLeafIndex >= BigInt(this.stateTree.nextIndex)) {
            return
        }

        // The user to update (or not)
        const stateLeaf = this.stateLeaves[Number(stateLeafIndex)]

        // The ballot to update (or not)
        const ballot = this.ballots[Number(stateLeafIndex)]

        // If the signature is invalid, do nothing
        if (!command.verifySignature(signature, stateLeaf.pubKey)) {
            //console.log('Invalid signature. pubkeyx =', stateLeaf.pubKey.rawPubKey[0], 'sig', signature)
            return
        }

        //console.log('Valid signature. pubkeyx =', stateLeaf.pubKey.rawPubKey[0], 'sig', signature)

        // If the nonce is invalid, do nothing
        if (command.nonce !== BigInt(ballot.nonce.valueOf()) + BigInt(1)) {
            return
        }

        const prevSpentCred = ballot.votes[Number(command.voteOptionIndex)]

        const voiceCreditsLeft =
            BigInt(stateLeaf.voiceCreditBalance.valueOf()) +
            (BigInt(prevSpentCred.valueOf()) * BigInt(prevSpentCred.valueOf())) -
            (BigInt(command.newVoteWeight.valueOf()) * BigInt(command.newVoteWeight.valueOf()))


        // If the remaining voice credits is insufficient, do nothing
        if (voiceCreditsLeft < BigInt(0)) {
            return
        }

        // If the vote option index is invalid, do nothing
        if (
            command.voteOptionIndex < BigInt(0) ||
            command.voteOptionIndex >= BigInt(this.maxValues.maxVoteOptions)
        ) {
            return
        }

        // Deep-copy the state leaf and update its attributes
        const newStateLeaf = stateLeaf.copy()
        newStateLeaf.voiceCreditBalance = voiceCreditsLeft
        newStateLeaf.pubKey = command.newPubKey.copy()

        // Deep-copy the ballot and update its attributes
        const newBallot = ballot.copy()
        newBallot.nonce = BigInt(newBallot.nonce.valueOf()) + BigInt(1)
        newBallot.votes[Number(command.voteOptionIndex)] =
            command.newVoteWeight

        const originalStateLeafPathElements
            = this.stateTree.genMerklePath(Number(stateLeafIndex)).pathElements

        const originalBallotPathElements
            = this.ballotTree.genMerklePath(Number(stateLeafIndex)).pathElements

        const voteOptionIndex = Number(command.voteOptionIndex)

        const originalVoteWeight = ballot.votes[voteOptionIndex]
        const vt = new IncrementalQuinTree(
            this.treeDepths.voteOptionTreeDepth,
            BigInt(0),
            5,
            hash5,
        )
        for (let i = 0; i < this.ballots[0].votes.length; i ++) {
            vt.insert(ballot.votes[i])
        }

        const originalVoteWeightsPathElements =
            vt.genMerklePath(voteOptionIndex).pathElements

        return {
            stateLeafIndex: Number(stateLeafIndex),

            newStateLeaf,
            originalStateLeaf: stateLeaf.copy(),
            originalStateLeafPathElements,
            originalVoteWeight,
            originalVoteWeightsPathElements,

            newBallot,
            originalBallot: ballot.copy(),
            originalBallotPathElements,
            command,
        }
    }

    private isMessageAqMerged = (): boolean => {
        return this.messageAq.getRoot(this.treeDepths.messageTreeDepth) ===
            this.messageTree.root
    }

    public hasUntalliedBallots = () => {
        const batchSize = this.batchSizes.tallyBatchSize
        return this.numBatchesTallied * batchSize < this.ballots.length
    }

    /*
     * Tally a batch of Ballots and update this.results
     */
    public tallyVotes = () => {

        const batchSize = this.batchSizes.tallyBatchSize

        assert(
            this.hasUntalliedBallots(),
            'No more ballots to tally',
        )

        const batchStartIndex = this.numBatchesTallied * batchSize

        const currentResultsRootSalt = batchStartIndex === 0 ?
            BigInt(0)
            :
            this.resultRootSalts[batchStartIndex - batchSize]

        const currentPerVOSpentVoiceCreditsRootSalt = batchStartIndex === 0 ?
            BigInt(0)
            :
            this.preVOSpentVoiceCreditsRootSalts[batchStartIndex - batchSize]

        const currentSpentVoiceCreditSubtotalSalt = batchStartIndex === 0 ?
            BigInt(0)
            :
            this.spentVoiceCreditSubtotalSalts[batchStartIndex - batchSize]

        const currentResultsCommitment = this.genResultsCommitment(currentResultsRootSalt)

        const currentPerVOSpentVoiceCreditsCommitment =
            this.genPerVOSpentVoiceCreditsCommitment(
                currentPerVOSpentVoiceCreditsRootSalt,
                batchStartIndex,
            )

        const currentSpentVoiceCreditsCommitment =
            this.genSpentVoiceCreditSubtotalCommitment(
                currentSpentVoiceCreditSubtotalSalt,
                batchStartIndex,
            )

        const currentTallyCommitment = batchStartIndex === 0 ?
            BigInt(0)
            :
            hash3([
                currentResultsCommitment,
                currentSpentVoiceCreditsCommitment,
                currentPerVOSpentVoiceCreditsCommitment,
            ])

        const ballots: Ballot[] = []
        const currentResults = this.results.map((x) => BigInt(x.toString()))
        const currentPerVOSpentVoiceCredits = this.perVOSpentVoiceCredits.map((x) => BigInt(x.toString()))
        const currentSpentVoiceCreditSubtotal = BigInt(this.totalSpentVoiceCredits.toString())

        for (
            let i = this.numBatchesTallied * batchSize;
            i < this.numBatchesTallied * batchSize + batchSize;
            i ++
        ) {
            if (i >= this.ballots.length) {
                break
            }

            ballots.push(this.ballots[i])

            for (let j = 0; j < this.maxValues.maxVoteOptions; j++) {
                const v = BigInt(this.ballots[i].votes[j].valueOf())

                this.results[j] = BigInt(this.results[j].valueOf()) + v

                this.perVOSpentVoiceCredits[j] =
                    BigInt(this.perVOSpentVoiceCredits[j].valueOf()) + (BigInt(v) * BigInt(v))

                this.totalSpentVoiceCredits =
                    BigInt(this.totalSpentVoiceCredits.valueOf()) + BigInt(v) * BigInt(v)
            }
        }

        const emptyBallot = new Ballot(
            this.maxValues.maxVoteOptions,
            this.treeDepths.voteOptionTreeDepth,
        )

        while (ballots.length < batchSize) {
            ballots.push(emptyBallot)
        }

        const newResultsRootSalt = genRandomSalt()
        const newPerVOSpentVoiceCreditsRootSalt = genRandomSalt()
        const newSpentVoiceCreditSubtotalSalt = genRandomSalt()

        this.resultRootSalts[batchStartIndex] = newResultsRootSalt
        this.preVOSpentVoiceCreditsRootSalts[batchStartIndex] = newPerVOSpentVoiceCreditsRootSalt
        this.spentVoiceCreditSubtotalSalts[batchStartIndex] = newSpentVoiceCreditSubtotalSalt

        const newResultsCommitment = this.genResultsCommitment(newResultsRootSalt)

        const newSpentVoiceCreditsCommitment =
            this.genSpentVoiceCreditSubtotalCommitment(
                newSpentVoiceCreditSubtotalSalt,
                batchStartIndex + batchSize,
            )

        const newPerVOSpentVoiceCreditsCommitment =
            this.genPerVOSpentVoiceCreditsCommitment(
                newPerVOSpentVoiceCreditsRootSalt,
                batchStartIndex + batchSize,
            )

        const newTallyCommitment = hash3([
            newResultsCommitment,
            newSpentVoiceCreditsCommitment,
            newPerVOSpentVoiceCreditsCommitment,
        ])

        //debugger

        const stateRoot = this.stateTree.root
        const ballotRoot = this.ballotTree.root
        const sbSalt = this.sbSalts[this.currentMessageBatchIndex]
        const sbCommitment = hash3([stateRoot, ballotRoot, sbSalt ])

        const packedVals = MaciState.packTallyVotesSmallVals(
            batchStartIndex,
            batchSize,
            this.numSignUps,
        )
        const inputHash = sha256Hash([
            packedVals,
            sbCommitment,
            currentTallyCommitment,
            newTallyCommitment,
        ])

        const ballotSubrootProof = this.ballotTree.genMerkleSubrootPath(
                batchStartIndex,
                batchStartIndex + batchSize,
            )

        const votes = ballots.map((x) => x.votes)

        const circuitInputs = stringifyBigInts({
            stateRoot,
            ballotRoot,
            sbSalt,

            sbCommitment,
            currentTallyCommitment,
            newTallyCommitment,

            packedVals, // contains numSignUps and batchStartIndex
            inputHash,

            ballots: ballots.map((x) => x.asCircuitInputs()),
            ballotPathElements: ballotSubrootProof.pathElements,
            votes,

            currentResults,
            currentResultsRootSalt,

            currentSpentVoiceCreditSubtotal,
            currentSpentVoiceCreditSubtotalSalt,

            currentPerVOSpentVoiceCredits,
            currentPerVOSpentVoiceCreditsRootSalt,

            newResultsRootSalt,
            newPerVOSpentVoiceCreditsRootSalt,
            newSpentVoiceCreditSubtotalSalt,
        })

        this.numBatchesTallied ++

        return circuitInputs
    }

    public genResultsCommitment = (_salt: BigInt) => {
        const resultsTree = new IncrementalQuinTree(
            this.treeDepths.voteOptionTreeDepth,
            BigInt(0),
            this.VOTE_OPTION_TREE_ARITY,
            hash5,
        )

        for (const r of this.results) {
            resultsTree.insert(r)
        }

        return hashLeftRight(resultsTree.root, _salt)
    }

    public genSpentVoiceCreditSubtotalCommitment = (
        _salt: BigInt,
        _numBallotsToCount: number,
    ) => {
        let subtotal = BigInt(0)
        for (let i = 0; i < _numBallotsToCount; i ++) {
            if (i >= this.ballots.length) {
                break
            }
            for (let j = 0; j < this.results.length; j ++) {
                const v = BigInt(this.ballots[i].votes[j].valueOf())
                subtotal = BigInt(subtotal) + v * v
            }
        }
        return hashLeftRight(subtotal, _salt)
    }

    //public genSpentVoiceCreditSubtotalCommitment = (_salt) => {
        //return hashLeftRight(this.totalSpentVoiceCredits, _salt)
    //}

    public genPerVOSpentVoiceCreditsCommitment = (
        _salt: BigInt,
        _numBallotsToCount: number,
    ) => {
        const resultsTree = new IncrementalQuinTree(
            this.treeDepths.voteOptionTreeDepth,
            BigInt(0),
            this.VOTE_OPTION_TREE_ARITY,
            hash5,
        )

        const leaves: BigInt[] = []

        for (let i = 0; i < this.results.length; i ++) {
            leaves.push(BigInt(0))
        }

        for (let i = 0; i < _numBallotsToCount; i ++) {
            if (i >= this.ballots.length) {
                break
            }
            for (let j = 0; j < this.results.length; j ++) {
                const v = BigInt(this.ballots[i].votes[j].valueOf())
                leaves[j] = BigInt(leaves[j].valueOf()) + v * v
            }
        }

        for (let i = 0; i < leaves.length; i ++) {
            resultsTree.insert(leaves[i])
        }

        return hashLeftRight(resultsTree.root, _salt)
    }

    public copy = (): Poll => {
        const copied = new Poll(
            Number(this.duration.toString()),
            BigInt(this.pollEndTimestamp.toString()),
            this.coordinatorKeypair.copy(),
            {
                intStateTreeDepth:
                    Number(this.treeDepths.intStateTreeDepth),
                messageTreeDepth:
                    Number(this.treeDepths.messageTreeDepth),
                messageTreeSubDepth:
                    Number(this.treeDepths.messageTreeSubDepth),
                voteOptionTreeDepth:
                    Number(this.treeDepths.voteOptionTreeDepth),
            },
            {
                tallyBatchSize:
                    Number(this.batchSizes.tallyBatchSize.toString()),
                messageBatchSize:
                    Number(this.batchSizes.messageBatchSize.toString()),
            },
            {
                maxUsers:
                    Number(this.maxValues.maxUsers.toString()),
                maxMessages:
                    Number(this.maxValues.maxMessages.toString()),
                maxVoteOptions:
                    Number(this.maxValues.maxVoteOptions.toString()),
            },
            this.maciStateRef,
        )

        copied.stateLeaves = this.stateLeaves.map((x: StateLeaf) => x.copy())
        copied.messages = this.messages.map((x: Message) => x.copy())
        copied.commands = this.commands.map((x: Command) => x.copy())
        copied.signatures = this.signatures.map((x: Signature) => {
            return {
                R8: [
                    BigInt(x.R8[0].toString()),
                    BigInt(x.R8[1].toString()),
                ],
                S: BigInt(x.S.toString()),
            }
        })
        copied.ballots = this.ballots.map((x: Ballot) => x.copy())
        copied.encPubKeys = this.encPubKeys.map((x: PubKey) => x.copy())
        if (this.ballotTree) {
            copied.ballotTree = this.ballotTree.copy()
        }
        copied.currentMessageBatchIndex = this.currentMessageBatchIndex
        copied.maciStateRef = this.maciStateRef
        copied.messageAq = this.messageAq.copy()
        copied.messageTree = this.messageTree.copy()
        copied.results = this.results.map((x: BigInt) => BigInt(x.toString()))
        copied.perVOSpentVoiceCredits = this.perVOSpentVoiceCredits.map((x: BigInt) => BigInt(x.toString()))

        copied.numBatchesProcessed = Number(this.numBatchesProcessed.toString())
        copied.numBatchesTallied = Number(this.numBatchesTallied.toString())
        copied.pollId = Number(this.pollId.toString())
        copied.totalSpentVoiceCredits = BigInt(this.totalSpentVoiceCredits.toString())

        copied.sbSalts = {}
        copied.resultRootSalts = {}
        copied.preVOSpentVoiceCreditsRootSalts = {}
        copied.spentVoiceCreditSubtotalSalts = {}

        for (const k of Object.keys(this.sbSalts)) {
            copied.sbSalts[k] = BigInt(this.sbSalts[k].toString())
        }
        for (const k of Object.keys(this.resultRootSalts)) {
            copied.resultRootSalts[k] = BigInt(this.resultRootSalts[k].toString())
        }
        for (const k of Object.keys(this.preVOSpentVoiceCreditsRootSalts)) {
            copied.preVOSpentVoiceCreditsRootSalts[k] = BigInt(this.preVOSpentVoiceCreditsRootSalts[k].toString())
        }
        for (const k of Object.keys(this.spentVoiceCreditSubtotalSalts)) {
            copied.spentVoiceCreditSubtotalSalts[k] = BigInt(this.spentVoiceCreditSubtotalSalts[k].toString())
        }

        return copied
    }

    public equals = (p: Poll): boolean => {
        const result =
            this.duration === p.duration &&
            this.coordinatorKeypair.equals(p.coordinatorKeypair) &&
            this.treeDepths.intStateTreeDepth ===
                p.treeDepths.intStateTreeDepth &&
            this.treeDepths.messageTreeDepth ===
                p.treeDepths.messageTreeDepth &&
            this.treeDepths.messageTreeSubDepth ===
                p.treeDepths.messageTreeSubDepth &&
            this.treeDepths.voteOptionTreeDepth ===
                p.treeDepths.voteOptionTreeDepth &&
            this.batchSizes.tallyBatchSize === p.batchSizes.tallyBatchSize &&
            this.batchSizes.messageBatchSize ===
                p.batchSizes.messageBatchSize &&
            this.maxValues.maxUsers === p.maxValues.maxUsers &&
            this.maxValues.maxMessages === p.maxValues.maxMessages &&
            this.maxValues.maxVoteOptions === p.maxValues.maxVoteOptions &&
            this.messages.length === p.messages.length &&
            this.encPubKeys.length === p.encPubKeys.length

        if (! result) {
            return false
        }

        for (let i = 0; i < this.messages.length; i ++) {
            if (!this.messages[i].equals(p.messages[i])) {
                return false
            }
        }
        for (let i = 0; i < this.encPubKeys.length; i ++) {
            if (!this.encPubKeys[i].equals(p.encPubKeys[i])) {
                return false
            }
        }
        return true
    }
}

const blankStateLeaf = StateLeaf.genBlankLeaf()
const blankStateLeafHash = blankStateLeaf.hash()

// A representation of the MACI contract
// Also see MACI.sol
class MaciState {
    public STATE_TREE_ARITY = 5
    public STATE_TREE_SUBDEPTH = 2
    public MESSAGE_TREE_ARITY = 5
    public VOTE_OPTION_TREE_ARITY = 5

    public stateTreeDepth = STATE_TREE_DEPTH
    public polls: Poll[] = []
    public stateLeaves: StateLeaf[] = []
    public stateTree = new IncrementalQuinTree(
        STATE_TREE_DEPTH,
        blankStateLeafHash,
        this.STATE_TREE_ARITY,
        hash5,
    )
    public stateAq: AccQueue = new AccQueue(
        this.STATE_TREE_SUBDEPTH,
        this.STATE_TREE_ARITY,
        blankStateLeafHash,
    )
    public pollBeingProcessed = true
    public currentPollBeingProcessed
    public numSignUps = 0

    constructor () {
        this.stateLeaves.push(blankStateLeaf)
        this.stateTree.insert(blankStateLeafHash)
        this.stateAq.enqueue(blankStateLeafHash)
    }

    public signUp(
        _pubKey: PubKey,
        _initialVoiceCreditBalance: BigInt,
        _timestamp: BigInt,
    ): number {
        const stateLeaf = new StateLeaf(
            _pubKey,
            _initialVoiceCreditBalance,
            _timestamp,
        )
        const h = stateLeaf.hash()
        const leafIndex = this.stateAq.enqueue(h)
        this.stateTree.insert(h)
        this.stateLeaves.push(stateLeaf.copy())
        this.numSignUps ++
        return leafIndex
    }

    public deployPoll(
        _duration: number,
        _pollEndTimestamp: BigInt,
        _maxValues: MaxValues,
        _treeDepths: TreeDepths,
        _messageBatchSize: number,
        _coordinatorKeypair: Keypair,
    ): number {
        const poll: Poll = new Poll(
            _duration,
            _pollEndTimestamp,
            _coordinatorKeypair,
             _treeDepths,
            {
                messageBatchSize: _messageBatchSize,
                tallyBatchSize:
                    this.STATE_TREE_ARITY ** _treeDepths.intStateTreeDepth,
            },
            _maxValues,
            this,
        )

        this.polls.push(poll)
        return this.polls.length - 1
    }

    public deployNullPoll() {
        // @ts-ignore
        this.polls.push(null)
    }

    /*
     * Deep-copy this object
     */
    public copy = (): MaciState => {
        const copied = new MaciState()

        copied.stateLeaves = this.stateLeaves.map((x: StateLeaf) => x.copy())
        copied.polls = this.polls.map((x: Poll) => x.copy())

        return copied
    }

    public equals = (m: MaciState): boolean => {
        const result =
            this.STATE_TREE_ARITY === m.STATE_TREE_ARITY &&
            this.MESSAGE_TREE_ARITY === m.MESSAGE_TREE_ARITY &&
            this.VOTE_OPTION_TREE_ARITY === m.VOTE_OPTION_TREE_ARITY &&
            this.stateTreeDepth === m.stateTreeDepth &&
            this.polls.length === m.polls.length &&
            this.stateLeaves.length === m.stateLeaves.length

        if (!result) {
            return false
        }

        for (let i = 0; i < this.polls.length; i ++) {
            if (!this.polls[i].equals(m.polls[i])) {
                return false
            }
        }
        for (let i = 0; i < this.stateLeaves.length; i ++) {
            if (!this.stateLeaves[i].equals(m.stateLeaves[i])) {
                return false
            }
        }

        return true
    }

    public static packTallyVotesSmallVals = (
        batchStartIndex: number,
        batchSize: number,
        numSignUps: number,
    ) => {
        // Note: the << operator has lower precedence than +
        const packedVals =
            (BigInt(batchStartIndex) / BigInt(batchSize)) +
            (BigInt(numSignUps) << BigInt(50))

        return packedVals
    }

    public static unpackTallyVotesSmallVals = (
        packedVals: BigInt,
    ) => {
        let asBin = BigInt(packedVals.valueOf()).toString(2)
        assert(asBin.length <= 100)
        while (asBin.length < 100) {
            asBin = '0' + asBin
        }
        const numSignUps = BigInt('0b' + asBin.slice(0, 50))
        const batchStartIndex = BigInt('0b' + asBin.slice(50, 100))

        return { numSignUps, batchStartIndex }
    }

    public static packProcessMessageSmallVals = (
        maxVoteOptions: BigInt,
        numUsers: BigInt,
        batchStartIndex: number,
        batchEndIndex: number,
    ) => {
        return BigInt(maxVoteOptions.valueOf()) +
            (BigInt(numUsers.valueOf()) << BigInt(50)) +
            (BigInt(batchStartIndex) << BigInt(100)) +
            (BigInt(batchEndIndex) << BigInt(150))
    }

    public static unpackProcessMessageSmallVals = (
        packedVals: BigInt,
    ) => {
        let asBin = BigInt(packedVals.valueOf()).toString(2)
        assert(asBin.length <= 200)
        while (asBin.length < 200) {
            asBin = '0' + asBin
        }
        const maxVoteOptions = BigInt('0b' + asBin.slice(150, 200))
        const numUsers = BigInt('0b' + asBin.slice(100, 150))
        const batchStartIndex = BigInt('0b' + asBin.slice(50, 100))
        const batchEndIndex = BigInt('0b' + asBin.slice(0, 50))

        return {
            maxVoteOptions,
            numUsers,
            batchStartIndex,
            batchEndIndex,
        }
    }
}

const genProcessVkSig = (
    _stateTreeDepth: number,
    _messageTreeDepth: number,
    _voteOptionTreeDepth: number,
    _batchSize: number
): BigInt => {
    return (BigInt(_batchSize) << BigInt(192)) +
           (BigInt(_stateTreeDepth) << BigInt(128)) +
           (BigInt(_messageTreeDepth) << BigInt(64)) +
            BigInt(_voteOptionTreeDepth)
}

const genTallyVkSig = (
    _stateTreeDepth: number,
    _intStateTreeDepth: number,
    _voteOptionTreeDepth: number,
): BigInt => {
    return (BigInt(_stateTreeDepth) << BigInt(128)) +
           (BigInt(_intStateTreeDepth) << BigInt(64)) +
            BigInt(_voteOptionTreeDepth)
}

/*
 * A helper function which hashes a list of results with a salt and returns the
 * hash.
 *
 * @param results A list of vote weights
 * @parm salt A random salt
 * @return The hash of the results and the salt, with the salt last
 */
const genTallyResultCommitment = (
    results: BigInt[],
    salt: BigInt,
    depth: number,
): BigInt => {

    const tree = new IncrementalQuinTree(depth, BigInt(0), 5, hash5)
    for (const result of results) {
        tree.insert(BigInt(result.valueOf()))
    }
    return hashLeftRight(tree.root, salt)
}

export {
    MaxValues,
    TreeDepths,
    MaciState,
    Poll,
    genProcessVkSig,
    genTallyVkSig,
    genTallyResultCommitment,
    STATE_TREE_DEPTH,
}
