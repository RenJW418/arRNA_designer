from app.schemas.design import (
    DesignProvenance,
    EditingSiteResult,
    EngineInfo,
    NormalEditingCandidate,
    NormalEditingRequest,
    NormalEditingResult,
    NormalizedSequenceInput,
    PairingRequirements,
    RuleSetInfo,
)

CODON_TABLE: dict[str, str] = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

ENGINE = EngineInfo(name="leaper-arrna-engine", version="0.2.0")
NORMAL_RULESET = RuleSetInfo(
    id="leaper-normal-editing",
    version="0.1.0",
)


def reverse_complement_rna(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGT", "UGCA"))[::-1]


def _editing_site(sequence: str, target_position: int) -> EditingSiteResult:
    target_index = target_position - 1
    codon_start = (target_index // 3) * 3
    codon = sequence[codon_start:codon_start + 3]
    offset = target_index - codon_start
    edited_codon = f"{codon[:offset]}G{codon[offset + 1:]}"
    amino_acid = CODON_TABLE[codon]
    edited_amino_acid = CODON_TABLE[edited_codon]
    if target_index > 0 and sequence[target_index - 1] == "G":
        category = "blocked_ga"
    elif amino_acid == edited_amino_acid:
        category = "synonymous"
    else:
        category = "editable"
    return EditingSiteResult(
        position=target_position,
        codon=codon,
        edited_codon=edited_codon,
        amino_acid=amino_acid,
        edited_amino_acid=edited_amino_acid,
        category=category,
    )


def _candidate(
    arrna_sequence: str,
    target_index: int,
    candidate_id: str,
    label: str,
    short_label: str,
    description: str,
    deletion_coordinates: list[int],
) -> NormalEditingCandidate:
    deleted = set(deletion_coordinates)
    aligned_guide = "".join(
        "-" if target_index_in_window - target_index in deleted else base
        for target_index_in_window, base in enumerate(reversed(arrna_sequence))
    )
    sequence = "".join(
        base
        for arrna_index, base in enumerate(arrna_sequence)
        if len(arrna_sequence) - 1 - arrna_index - target_index not in deleted
    )
    return NormalEditingCandidate(
        id=candidate_id,
        label=label,
        short_label=short_label,
        description=description,
        arrna_sequence=sequence,
        aligned_guide=aligned_guide,
        deletion_coordinates=deletion_coordinates,
    )


def design_normal_editing(
    payload: NormalEditingRequest,
    flank_length: int = 75,
) -> NormalEditingResult:
    sequence = payload.sequence
    target_index = payload.target_position - 1
    start_index = max(0, target_index - flank_length)
    end_index = min(len(sequence), target_index + flank_length + 1)
    target_window = sequence[start_index:end_index]
    target_index_in_window = target_index - start_index
    upstream_length = target_index_in_window
    downstream_length = len(target_window) - target_index_in_window - 1

    complementary_guide = reverse_complement_rna(target_window)
    mismatch_index = len(complementary_guide) - 1 - target_index_in_window
    baseline_arrna = (
        f"{complementary_guide[:mismatch_index]}C"
        f"{complementary_guide[mismatch_index + 1:]}"
    )

    candidates = [_candidate(
        baseline_arrna,
        target_index_in_window,
        "baseline",
        "Baseline arRNA",
        "No deletion",
        "A-C target mismatch with otherwise complete complementary pairing.",
        [],
    )]
    downstream_deletion = list(range(34, 44))
    upstream_deletion = list(range(-31, -59, -1))
    if downstream_length >= flank_length:
        candidates.append(_candidate(
            baseline_arrna,
            target_index_in_window,
            "downstream-del10",
            "Downstream +34 deletion arRNA",
            "+34 deletion 10",
            "Deletes arRNA bases aligned to target coordinates A+34 through A+43.",
            downstream_deletion,
        ))
    if upstream_length >= flank_length:
        candidates.append(_candidate(
            baseline_arrna,
            target_index_in_window,
            "upstream-del28",
            "Upstream -31 deletion arRNA",
            "-31 deletion 28",
            "Deletes arRNA bases aligned to target coordinates A-31 through A-58.",
            upstream_deletion,
        ))
    if downstream_length >= flank_length and upstream_length >= flank_length:
        candidates.append(_candidate(
            baseline_arrna,
            target_index_in_window,
            "dual-deletion",
            "Dual-deletion arRNA",
            "Dual deletion",
            "Combines the A+34 deletion 10 and A-31 deletion 28 gaps.",
            [*downstream_deletion, *upstream_deletion],
        ))

    required_downstream = 4 if payload.adar_environment == "ADAR1" else 6
    required_upstream = 20 if payload.adar_environment == "ADAR1" else 11
    problems: list[str] = []
    if downstream_length < required_downstream:
        problems.append(
            f"arRNA 5' side requires {required_downstream} paired nt; "
            f"only {downstream_length} are available"
        )
    if upstream_length < required_upstream:
        problems.append(
            f"arRNA 3' side requires {required_upstream} paired nt; "
            f"only {upstream_length} are available"
        )
    warnings = [] if upstream_length == flank_length and downstream_length == flank_length else [
        "The target does not have the complete 75-nt context on both sides."
    ]
    if problems:
        warnings.append("; ".join(problems))

    return NormalEditingResult(
        normalized_input=NormalizedSequenceInput(
            sequence=sequence,
            length=len(sequence),
            target_position=payload.target_position,
        ),
        reference=payload.reference,
        editing_site=_editing_site(sequence, payload.target_position),
        target_window=target_window,
        window_start=start_index + 1,
        window_end=end_index,
        target_index=target_index_in_window,
        upstream_length=upstream_length,
        downstream_length=downstream_length,
        has_full_flanks=upstream_length == flank_length and downstream_length == flank_length,
        pairing=PairingRequirements(
            adar_environment=payload.adar_environment,
            required_upstream=required_upstream,
            required_downstream=required_downstream,
            is_satisfied=not problems,
            message="; ".join(problems) if problems else "Pairing requirements are satisfied.",
        ),
        candidates=candidates,
        warnings=warnings,
        provenance=DesignProvenance(engine=ENGINE, ruleset=NORMAL_RULESET),
    )
