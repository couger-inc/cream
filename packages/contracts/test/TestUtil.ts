import 'hardhat-deploy'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import hre from 'hardhat'
import { expect } from 'chai'
import { Contract, ContractFactory } from '@ethersproject/contracts'
import { Keypair, PrivKey } from 'maci-domainobjs'
import { config } from '@cream/config'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import { G1Point, G2Point } from 'maci-crypto'
import { VerifyingKey } from 'maci-domainobjs'

const { MaciState } = require('maci-core')
const { MerkleTree } = require('cream-merkle-tree')
const {
  genProofAndPublicSignals,
} = require('@cream/circuits')

export const createMaciState = () => {
  return new MaciState()
}

export const getUnnamedAccounts = async (hre: HardhatRuntimeEnvironment) => {
  const accounts = await hre.getUnnamedAccounts()
  return await Promise.all(accounts.map(async (x) => hre.ethers.getSigner(x)))
}

export interface ContractEvent {
  name: string
  args: any[]
}

export const extractEvents = async (tx: any): Promise<ContractEvent[]> => {
  const receipt = await tx.wait()
  const events: ContractEvent[] = receipt.events
    .filter((x: any) => x.event)
    .map((x: any) => {
      return { name: x.event, args: x.args }
    })
  return events
}

export const extractEventsOfName = async (
  tx: any,
  name: string
): Promise<ContractEvent[]> => {
  const events = await extractEvents(tx)
  return events.filter((x) => x.name === name)
}

export const expectSingleEvent = async (tx: any, name: string) => {
  const events = await extractEvents(tx)
  const fltEvents = events.filter((x) => x.name === name)
  expect(fltEvents.length).to.equal(1)
}

export const extractSignelEventArg = async (
  tx: any,
  name: string,
  argIndex: number
) => {
  const events = await extractEventsOfName(tx, name)
  expect(events.length).to.equal(1)
  return events[0].args[argIndex]
}

export const extractSingleEventArg1 = async (tx: any, name: string) =>
  extractSignelEventArg(tx, name, 0)

export const getNextBlockTimestamp = async () =>
  (await hre.ethers.provider.getBlock('latest')).timestamp + 1

export const setNextBlockTimestamp = async (timestamp: number) =>
  hre.network.provider.send('evm_setNextBlockTimestamp', [timestamp])

export const endVotingPeriod = async () => {
  const endOfVotingPeriod = (await getNextBlockTimestamp()) + config.maci.votingDurationInSeconds
  await setNextBlockTimestamp(endOfVotingPeriod)
  return endOfVotingPeriod
}

export const coordinatorEdDSAKeypair = new Keypair(
  new PrivKey(BigInt(config.maci.coordinatorPrivKey))
)

export const ZERO_VALUE = config.cream.zeroValue
export const LEVELS = config.cream.merkleTreeDepth
export const BALANCE = config.maci.initialVoiceCreditBalance
export const IPFS_HASH = 'QmPChd2hVbrJ6bfo3WBcTW4iZnpHm8TEzWkLHmLpXhF68A'

export const createLocalMerkleTree = (levels: number = LEVELS) => {
  return new MerkleTree(levels, ZERO_VALUE)
}

// due to a bug in 1.0.2, MACI.signUp only works w/ state tree depth 3 or less
export const buildLevel3LocalMerkleTree = () => createLocalMerkleTree(3)

// build vote circuit w/ level = 3 to get around a bug in 1.0.2
export const buildProofWithLevel3VoteCircuit = async (input: any) => {
  return await genProofAndPublicSignals(
    input,
    `${process.env.NODE_ENV}/vote3.circom`,
    'build/vote.zkey',
    'circuits/vote.wasm'
  )
}

// create MACI instance whose owner is the default signer for testing purpose
// following the way MACIFactory creates it
export const createMACI4Testing = async (
  ConstantInitialVoiceCreditProxy: ContractFactory,
  coordinatorEdDSAKeypair: Keypair,
  Maci: ContractFactory,
  MessageAqFactory: ContractFactory,
  messageTreeDepth: number,
  messageTreeSubDepth: number,
  PollDeployer: ContractFactory,
  PollFactory: ContractFactory,
  signUpToken: Contract,
  SignUpTokenGatekeeper: ContractFactory,
  stateTreeDepth: number,
  VkRegistry: ContractFactory,
  voteOptionTreeDepth: number,
  votingDuration: number,
) => {
  const signUpTokenGatekeeper = await SignUpTokenGatekeeper.deploy(
    signUpToken.address
  )

  const constantInitialVoiceCreditProxy =
    await ConstantInitialVoiceCreditProxy.deploy(
      config.maci.initialVoiceCreditBalance
    )
  const pollFactory = await PollFactory.deploy()
  const messageAqFactory = await MessageAqFactory.deploy()
  await messageAqFactory.transferOwnership(pollFactory.address)

  const maci = await Maci.deploy(
    pollFactory.address,
    signUpTokenGatekeeper.address,
    constantInitialVoiceCreditProxy.address
  )
  await pollFactory.transferOwnership(maci.address)
  const vkRegistry = await VkRegistry.deploy()
  await maci.init(vkRegistry.address, messageAqFactory.address)

  const pollDeployer = await PollDeployer.deploy()

  const pubkey = coordinatorEdDSAKeypair.pubKey.asContractParam()
  await pollDeployer.deploy(
    maci.address,
    stateTreeDepth,
    messageTreeSubDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    votingDuration,
    pubkey.x, // uint256 _coordinatorPubkeyX,
    pubkey.y, // uint256 _coordinatorPubkeyY
  )

  return {
    maci,
  }
}

export const createCream4Testing = async (
  coordinator: SignerWithAddress,
  Cream: ContractFactory,
  creamVerifierAddr: string,
  Maci: ContractFactory,
  maciAddr: string,
  merkleTreeHeight: number,
  ownerSigner: SignerWithAddress,
  signUpDuration: number,
  SignUpToken: ContractFactory,
  signUpTokenAddr: string,
  voterSigners: SignerWithAddress[],
  votingDuration: number,
  VotingToken: ContractFactory,
  votingTokenAddr: string
) => {
  const maci = await Maci.attach(maciAddr)
  const signUpToken = await SignUpToken.attach(signUpTokenAddr)
  const votingToken = await VotingToken.attach(votingTokenAddr)

  const cream = await Cream.deploy(
    creamVerifierAddr,
    votingToken.address,
    merkleTreeHeight,
    voterSigners.map((x) => x.address),
    coordinator.address,
    signUpDuration,
    votingDuration
  )
  await cream.setMaci(maci.address, signUpToken.address)
  await cream.transferOwnership(ownerSigner.address)

  return { cream }
}

export interface SnarkJsVKey {
  protocol: "groth16",
  curve: "bn128",
  nPublic: number,  // 1
  vk_alpha_1: string[3],  // [bn, bn, number]
  vk_beta_2: string[3][2],  // [bn[2], bn[2], number[2]]
  vk_gamma_2: string[3][2],  // [bn[2], bn[2], number[2]]
  vk_delta_2: string[3][2],  // [bn[2], bn[2], number[2]]
  vk_alphabeta_12: string[2][3][2],  // [bn[2], bn[2], number[2]][2]
  IC: string[2][3],  // [bn, bn, number][2]
}

export const buildMaciVerifyingKey = (vKey: SnarkJsVKey): VerifyingKey => {
  return new VerifyingKey(
    new G1Point(
      BigInt(vKey.vk_alpha_1[0]),
      BigInt(vKey.vk_alpha_1[1]),
    ),
    new G2Point(
      [
        BigInt(vKey.vk_beta_2[0][1]),
        BigInt(vKey.vk_beta_2[0][0]),
      ],
      [
        BigInt(vKey.vk_beta_2[1][1]),
        BigInt(vKey.vk_beta_2[1][0]),
      ],
    ),
    new G2Point(
      [
        BigInt(vKey.vk_gamma_2[0][1]),
        BigInt(vKey.vk_gamma_2[0][0]),
      ],
      [
        BigInt(vKey.vk_gamma_2[1][1]),
        BigInt(vKey.vk_gamma_2[1][0]),
      ],
    ),
    new G2Point(
      [
        BigInt(vKey.vk_delta_2[0][1]),
        BigInt(vKey.vk_delta_2[0][0]),
      ],
      [
        BigInt(vKey.vk_delta_2[1][1]),
        BigInt(vKey.vk_delta_2[1][0]),
      ],
    ),
    [
      new G1Point(
        BigInt(vKey.IC[0][0]),
        BigInt(vKey.IC[0][1]),
      ),
      new G1Point(
        BigInt(vKey.IC[1][0]),
        BigInt(vKey.IC[1][1]),
      ),
    ]
  )
}

export interface SnarkJsProof {
  pi_a: string[3],  // [bn, bn, number]
  pi_b: string[3][2],  // [[bn, bn], [bn, bn], [number, number]]
  pi_c: string[3],  // [bn, bn, number]
  protocol: "groth16",
  curve: "bn128"
}

export const buildMaciProof = (proof: SnarkJsProof): bigint[] => {
  return [
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]),
    BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1]),
  ]
}