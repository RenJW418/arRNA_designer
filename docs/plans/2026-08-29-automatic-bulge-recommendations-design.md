# Automatic bulge recommendation design

## Goal

After a user locks the experimentally tested arRNA and records editing efficiencies, one action searches the experimentally supported deletion and mismatch rule space and recommends ten optimized arRNA designs.

## Scientific contract

- The target site is A0.
- Prefer qualitative increase at A0 and strongly reject qualitative decrease at A0.
- Prefer qualitative decrease at non-target A sites in proportion to their observed editing efficiency.
- Penalize qualitative increase at non-target A sites in proportion to their observed editing efficiency.
- Treat unentered non-target A efficiencies as zero, matching the current workflow.
- Treat overlapping effects from different bulges as unresolved. Do not infer a combined numeric effect.
- The output is a qualitative rule-based ranking, not a prediction of editing-efficiency percentages.

## Structural constraints

- Start from the exact locked arRNA used in the experiment.
- Use only deletion and same-base mismatch candidates present in the selected ADAR rule set.
- A design contains at most four bulges, including bulges already present in the starting arRNA.
- Occupied arRNA intervals cannot overlap.
- Candidates must stay within the displayed arRNA alignment window.
- Mismatch bases are generated automatically and remain manually editable after loading a recommendation.

## Search and ranking

Use a bounded beam search. Expand the starting design one bulge at a time, deduplicate canonical combinations, retain the strongest structurally distinct partial combinations at each depth, and return the ten highest-scoring non-empty designs.

The score contains visible components: target benefit, bystander benefit, target risk, bystander risk, unresolved overlap penalty, bulge-count penalty, and total-size penalty. No hidden trained model or numeric efficiency forecast is introduced.

## Interaction

The sequence board remains the place where efficiencies are entered. A prominent `Design optimized arRNAs` button appears beside the observations. Results are shown as a ranked list of ten compact rows. Each row contains its rank, qualitative score, bulge composition, affected A summary, structural cost, and optimized sequence. The first row is labelled Recommended.

`Use this design` replaces only user-added optimization bulges with the selected combination, keeps the locked starting arRNA and observed efficiencies, refreshes the existing structure overview, and leaves mismatch bases editable.

