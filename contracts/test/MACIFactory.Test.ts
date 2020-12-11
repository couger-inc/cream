const { revertSnapshot, takeSnapshot } = require('./TestUtil')

const MACIFactory = artifacts.require('MACIFactory')
const BatchUpdateStateTreeVerifierSmall = artifacts.require(
    'BatchUpdateStateTreeVerifierSmall'
)

contract('MACIFactory', (accounts) => {
    let instance
    let snapshotId
    before(async () => {
        instance = await MACIFactory.deployed()
        batchUstVerifierInstance = await BatchUpdateStateTreeVerifierSmall.deployed()
        snapshotId = await takeSnapshot()
    })

    describe('initialize', () => {
        it('should correctly initialized', async () => {
            // TODO: check more variables

            const batchUstVerifierAddress = await instance.batchUstVerifier()
            const votingDuration = await instance.votingDuration()
            assert.equal(
                batchUstVerifierAddress,
                batchUstVerifierInstance.address
            )
            assert.equal(votingDuration, 604800)
        })

        // TODO
        // it('should be able to set MACI parameters', async () => {
        //
        // 	})

        // TODO
        // it('should be able to deploy MACI', async () => {
        //
        // 	})
        // it('should revert if non owner try to deploy MACI', async () => {
        //
        // 	})
    })

    afterEach(async () => {
        await revertSnapshot(snapshotId.result)
        // eslint-disable-next-line require-atomic-updates
        snapshotId = await takeSnapshot()
    })
})
