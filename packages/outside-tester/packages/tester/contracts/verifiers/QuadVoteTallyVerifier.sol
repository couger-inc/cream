// SPDX-License-Identifier: MIT

// Copyright 2017 Christian Reitwiessner
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// 2019 OKIMS

pragma solidity ^0.7.2;

library Pairing {

    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero.
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {

        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return The sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {

        uint256[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-add-failed");
    }

    /*
     * @return The product of a point on G1 and a scalar, i.e.
     *         p == p.scalar_mul(1) and p.plus(p) == p.scalar_mul(2) for all
     *         points p.
     */
    function scalar_mul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {

        uint256[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require (success,"pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {

        G1Point[4] memory p1 = [a1, b1, c1, d1];
        G2Point[4] memory p2 = [a2, b2, c2, d2];

        uint256 inputSize = 24;
        uint256[] memory input = new uint256[](inputSize);

        for (uint256 i = 0; i < 4; i++) {
            uint256 j = i * 6;
            input[j + 0] = p1[i].X;
            input[j + 1] = p1[i].Y;
            input[j + 2] = p2[i].X[0];
            input[j + 3] = p2[i].X[1];
            input[j + 4] = p2[i].Y[0];
            input[j + 5] = p2[i].Y[1];
        }

        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success,"pairing-opcode-failed");

        return out[0] != 0;
    }
}

contract QuadVoteTallyVerifier {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alpha1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[11] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alpha1 = Pairing.G1Point(uint256(13959258963382324203082836265068655104032967064748167333042072342965031887895),uint256(5833741887165639020186765842789862405176855362934505955193743556985305424217));
        vk.beta2 = Pairing.G2Point([uint256(6735638048799834001144864698540772737617187562809940041141724091262268697946),uint256(12928366308082627379177609022126844456125557731201797763909411395940170553521)], [uint256(3702202272357485489389855021093373204852279056451664633139542337422533485422),uint256(2353363358564816760853396574094303172204988407988589073913039018134253777510)]);
        vk.gamma2 = Pairing.G2Point([uint256(10896222372097494215227550906784461699488233735811804840332345152720550557446),uint256(8862071261786843821360216390242103961727413389810338470421093470343742290761)], [uint256(12753305877093692295762700841804333097152345953671673739149018526124455333716),uint256(6485375115729847605939406953044534583240884700077446121408196497298190988893)]);
        vk.delta2 = Pairing.G2Point([uint256(4297458616722118766222301258801881478634367523183746814521626085809505890342),uint256(4309795853555187316624772315818678312019732845016034785084363517533190769644)], [uint256(13959975552234064999453587459651499056181447297535615013473247780923636015490),uint256(20093756362864994740928654607306550953824269802310726411274841189241777446320)]);
        vk.IC[0] = Pairing.G1Point(uint256(20088723943355522607276308628238151888032871212889038294237496708735812028127),uint256(11476640152908648153381991066029974171019508175950763596022911667761989906592));
        vk.IC[1] = Pairing.G1Point(uint256(9886967852219674528616622689442914176630408317455921590541681602800646735721),uint256(15865868071129525878697449699844401281696991812485578661060326589265988967232));
        vk.IC[2] = Pairing.G1Point(uint256(4270788535740062849209347382223916858861440001699407575570479669578580117159),uint256(5945342548257283301396659668863663385684516996014047845362596157333055904063));
        vk.IC[3] = Pairing.G1Point(uint256(6308482388562311808381519024494257144037987233293951397746475765147000343551),uint256(7602324244546018219749784484628986654998638106114904491828516760973434510829));
        vk.IC[4] = Pairing.G1Point(uint256(5034960482269295415323782058012861215191788523555434213996524328016591625153),uint256(6481694150493216451428219169557786343853878084993600483660685326614570986056));
        vk.IC[5] = Pairing.G1Point(uint256(5157533997834906962474914758960070354964696759836528021755842207875061525908),uint256(20136220668795657381935219371754969815674337066440533221256018174547334989565));
        vk.IC[6] = Pairing.G1Point(uint256(10400720532004863931730617662692403337418889947399756005600287075462486260225),uint256(15358600735505618140695786721158474952956610756472557319945284092266060031839));
        vk.IC[7] = Pairing.G1Point(uint256(5183766185869068753339973264372883927232908854995469359756041965386573865674),uint256(2716513294998682336074945786188741426253800486840639426151990249122386948351));
        vk.IC[8] = Pairing.G1Point(uint256(8132834315906630198845465114641555741266103972637765395562544336532203711274),uint256(777238620686377920665637982217682034797447081530283946734536784027949822958));
        vk.IC[9] = Pairing.G1Point(uint256(10510498071854630203145908300538544606427017288223326076775477893081466175032),uint256(16692476592201424075241528188865501434832961287132722998483216910916088084633));
        vk.IC[10] = Pairing.G1Point(uint256(15518190687953432387003062517891578505312058773139418878539967958125618581993),uint256(16065981315809280037983187353162106860757537445453473102285770417520261209200));

    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory input
    ) public view returns (bool) {

        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);

        VerifyingKey memory vk = verifyingKey();

        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);

        // Make sure that proof.A, B, and C are each less than the prime q
        require(proof.A.X < PRIME_Q, "verifier-aX-gte-prime-q");
        require(proof.A.Y < PRIME_Q, "verifier-aY-gte-prime-q");

        require(proof.B.X[0] < PRIME_Q, "verifier-bX0-gte-prime-q");
        require(proof.B.Y[0] < PRIME_Q, "verifier-bY0-gte-prime-q");

        require(proof.B.X[1] < PRIME_Q, "verifier-bX1-gte-prime-q");
        require(proof.B.Y[1] < PRIME_Q, "verifier-bY1-gte-prime-q");

        require(proof.C.X < PRIME_Q, "verifier-cX-gte-prime-q");
        require(proof.C.Y < PRIME_Q, "verifier-cY-gte-prime-q");

        // Make sure that every input is less than the snark scalar field
        //for (uint256 i = 0; i < input.length; i++) {
        for (uint256 i = 0; i < 10; i++) {
            require(input[i] < SNARK_SCALAR_FIELD,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.plus(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        vk_x = Pairing.plus(vk_x, vk.IC[0]);

        return Pairing.pairing(
            Pairing.negate(proof.A),
            proof.B,
            vk.alpha1,
            vk.beta2,
            vk_x,
            vk.gamma2,
            proof.C,
            vk.delta2
        );
    }
}
