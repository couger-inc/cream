import * as fs from 'fs'

const WitnessCalculatorBuilder = require("circom_runtime").WitnessCalculatorBuilder;
const testDir = `${__dirname}/../test-site`

export const loadSymbols = (circuit: string) => {
  const m = {}
  const lines = fs.readFileSync(`${testDir}/${circuit}.sym`).toString('utf-8').split('\n')
  for(const line of lines) {
    const toks = line.split(',')
    m[toks[3]] = Number(toks[1])
  }
  return m
}

interface WitnessCalculator {
  calculateWitness: (circuitInputs: any) => any,
}

export const getWitnessCalculator = async (circuit: string): Promise<WitnessCalculator> => {
  const wasm = fs.readFileSync(`${testDir}/${circuit}.wasm`)
  const wc = await WitnessCalculatorBuilder(wasm);
  return wc
}