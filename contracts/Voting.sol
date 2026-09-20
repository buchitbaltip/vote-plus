// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Voting
 * @notice On-chain tally for a student-president election.
 *
 * Design:
 *  - Vote counts live in contract storage. Nobody (not even the owner) can
 *    set a count directly; the only way to change state is `vote()`, which
 *    can only ever *increment* a counter by one.
 *  - `vote()` is restricted to the owner (the NestJS backend wallet). The
 *    backend is responsible for authenticating the student and enforcing
 *    one-vote-per-student in PostgreSQL; the chain provides an immutable,
 *    publicly auditable tally.
 *  - `getVotes()` is a free `view` call so anyone (the backend, a browser,
 *    an interviewer on Etherscan) can read the raw tally without trusting
 *    the backend.
 */
contract Voting {
    address public immutable owner;
    uint256 public immutable candidateCount;

    // candidateId (1-based) => number of votes
    mapping(uint256 => uint256) private votes;
    uint256 public totalVotes;

    event Voted(uint256 indexed candidateId, uint256 newTotal, uint256 totalVotes);

    error NotOwner();
    error InvalidCandidate(uint256 candidateId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _candidateCount) {
        require(_candidateCount > 0, "candidateCount must be > 0");
        owner = msg.sender;
        candidateCount = _candidateCount;
    }

    /// @notice Add one vote to `candidateId`. Called by the backend after it
    ///         has validated the student's ballot.
    function vote(uint256 candidateId) external onlyOwner {
        if (candidateId == 0 || candidateId > candidateCount) {
            revert InvalidCandidate(candidateId);
        }
        votes[candidateId] += 1;
        totalVotes += 1;
        emit Voted(candidateId, votes[candidateId], totalVotes);
    }

    /// @notice Raw tally for every candidate. Index 0 => candidate #1.
    function getVotes() external view returns (uint256[] memory result) {
        result = new uint256[](candidateCount);
        for (uint256 i = 0; i < candidateCount; i++) {
            result[i] = votes[i + 1];
        }
    }

    /// @notice Tally for a single candidate.
    function getVotes(uint256 candidateId) external view returns (uint256) {
        if (candidateId == 0 || candidateId > candidateCount) {
            revert InvalidCandidate(candidateId);
        }
        return votes[candidateId];
    }
}
