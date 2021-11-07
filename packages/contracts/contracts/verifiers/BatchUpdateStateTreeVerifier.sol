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

pragma solidity ^0.6.12;

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

contract BatchUpdateStateTreeVerifier {

    using Pairing for *;

    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct VerifyingKey {
        Pairing.G1Point alpha1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[17] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alpha1 = Pairing.G1Point(uint256(383284527393552690754986313011203050306822228387514342376555236756372089280),uint256(6385568662123240466074889914039864859867124073993366637662140448130004038866));
        vk.beta2 = Pairing.G2Point([uint256(19478325170413297919923595150839110498078952668939407344173694724832977341728),uint256(11900948123525708465113785836799325003207347447141254331255344236472979888432)], [uint256(5799360993450937286567808910528497502698611244512314539615956128409657739444),uint256(20612279518914060044833200452539332205842004695945736037916505522175297678486)]);
        vk.gamma2 = Pairing.G2Point([uint256(10441884567172459268354233166737154730022394931541198343785464347588533602408),uint256(14261155439428312096401898139123453850252039860249685715858352268740275847524)], [uint256(18763058989903854544163070734676338502208797920892478668795571631146204545105),uint256(6221082618759065147476300512939123282382601671198201150048386136147834415762)]);
        vk.delta2 = Pairing.G2Point([uint256(4238963786793098792380524137342710799782420122261784885798334779209285333547),uint256(15154549740166667864855306245591696625740539097149286605909462312941101233423)], [uint256(16078177387682271871249058223730402642229926364575355585764725368958382231471),uint256(17085894968054513904540986705049973035523378178904278486081618009699326427082)]);
        vk.IC[0] = Pairing.G1Point(uint256(6566228022376868744514895593148781370267501084392141121057640215584495327612),uint256(4406976110445279303093136024039143338617657329633128434407480329152015024898));
        vk.IC[1] = Pairing.G1Point(uint256(7819937113885824303192389254537690333922662300527904839272622182443530547857),uint256(13401721500632601993592480235862568010058921043289578141152224767450277018322));
        vk.IC[2] = Pairing.G1Point(uint256(18782568166279258800856677057296443508828718768558680408276257115761380808615),uint256(12752586184719739715047893838494811228245278380161749553056354243754392210864));
        vk.IC[3] = Pairing.G1Point(uint256(4627016430485371911849453238932756844880493597792470970639679122565564974094),uint256(14823544581093885594393194536361732738858090410455091755086683349867436966130));
        vk.IC[4] = Pairing.G1Point(uint256(19566012381219737920321632744171510289886899922973800583598671997114481060261),uint256(4506029131948741000092994908646407860802325950755297739577198159636262438274));
        vk.IC[5] = Pairing.G1Point(uint256(14391267446792587202544996049856634945469816345556512659392930736702135407949),uint256(8479013925224907886874493160771681969338711072041272479191856059148385243974));
        vk.IC[6] = Pairing.G1Point(uint256(11091682122503872522759425991723349972930367168890967077626143548530938705896),uint256(8519165858405141790553710315162353623988391864510513485326562130407660763870));
        vk.IC[7] = Pairing.G1Point(uint256(17267079777302869404271807753969814915149164586143370490462047183833706907611),uint256(9947672808738624061049464414297680208126594488698852849015887010456691539780));
        vk.IC[8] = Pairing.G1Point(uint256(7651207730720094621420221464479181452017743971426215822779196786944609246054),uint256(654559158524506184452065944746664301840952859922524281349639284207513174671));
        vk.IC[9] = Pairing.G1Point(uint256(3892576231203473604233312383800898879766883216764554424031188885617778748170),uint256(21852987675725838799825891315759979102090201881068783972262341599499742954624));
        vk.IC[10] = Pairing.G1Point(uint256(7752602917589300141277130919581974104422814957985910068016412244395348682371),uint256(6098923277698385241651203637958498170495305581997138687332108771319536819048));
        vk.IC[11] = Pairing.G1Point(uint256(14634652128781155019817409200426128634274363364615010366065682767454867426884),uint256(19261477763441199082087441421841150828741306782753549056344808614805981902709));
        vk.IC[12] = Pairing.G1Point(uint256(5155394510125558712860809150991055462839683952956990495255459748524246307079),uint256(15208022695116253888294890859901977260703302560745500533967195594254624894228));
        vk.IC[13] = Pairing.G1Point(uint256(17779503736317477376307068487111985253737630705024174101390011953465157799170),uint256(8872542743376738185135573974757773678906909716160936302769561510070714595597));
        vk.IC[14] = Pairing.G1Point(uint256(19257411307962768839574679382319066853789364137773384659083024083994177552828),uint256(4322602538604114425434903356574951871994460858253846436028601133014330178978));
        vk.IC[15] = Pairing.G1Point(uint256(21268706817009176666807511743021779205654148947724076484106997954059473121719),uint256(8593814200294596508571634956301109059989483399485124471937663787179348487008));
        vk.IC[16] = Pairing.G1Point(uint256(18935555850731155552795430265031373247324257098725703027362652665901430320192),uint256(1775888006637720485341340461002152053616267195555359825542908857465495937716));

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
        for (uint256 i = 0; i < 16; i++) {
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
