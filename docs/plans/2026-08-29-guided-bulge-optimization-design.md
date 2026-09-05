# Guided bulge optimization

## Goal

Make experiment-guided optimization understandable on first use without removing the scientific controls needed for inspection and manual refinement.

## Default workflow

1. Lock the exact arRNA used in the experiment.
2. Enter the required A0 editing efficiency. Other A sites are optional and default to 0.
3. Generate ranked designs with one dominant action.
4. Show the top recommendation first, including a plain-language reason, sequence copy, FASTA download and structure view.
5. Reveal all ranked alternatives only when the user chooses to compare them.

## Progressive disclosure

The optimization area has explicit **Automatic design** and **Manual design** modes. Automatic design shows the target sequence, editing-efficiency inputs and ranked recommendations. Manual design exposes bulge placement, effect-range inspection, base-pairing rows, mismatch editing and the complete bulge stack.

Selecting a candidate immediately shows its start-relative experimental effect range. After placement, selecting one bulge in the stack focuses its absolute core increase/decrease ranges in the whole-arRNA overview while muting the other bulges. Deletion gaps use a clean masked break without extra colored end caps.

Automatic recommendations end with a clear recovery path: **Not satisfied with the automatic designs? Try manual design.** Opening manual design presents a modal guide before placement. The user can switch between Deletion and Mismatch, select every size available in the current experimental rule set, and see the matching qualitative effect-range chart update immediately. Confirming the candidate closes the guide and carries that exact type and size into the manual placement interface. The same guide can be reopened from the manual candidate library.

## Interaction states

The progress indicator distinguishes the current step from completed and pending steps. Automatic design remains disabled until A0 has a measured value. An empty recommendation result explains that no legal combination increases A0 under the current qualitative rules and suggests the next action.

## Scientific boundary

The ranking communicates qualitative expected directions only. It does not convert bulge rules into a numeric editing-efficiency prediction.
