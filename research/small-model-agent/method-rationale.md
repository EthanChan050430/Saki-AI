# EGAR: method rationale and research boundaries

This is a proposed training-free action-selection scaffold, not a trained model and not a claim of a globally novel algorithm. Implementation-specific settings and results are recorded in the experiment report and final paper.

## Problem

At decision step t, a small language model receives a user goal g, public tool contracts T and actual observation history H_t. It proposes an action a_t. Let S(a,T) check structural well-formedness, P(a,H_t,T) check runtime preconditions, and E(a,H_t,g) check whether arguments requiring externally obtained evidence have that evidence. Checks must use only information a deployed runtime could possess, never hidden target answers, expected tool sequences or evaluator labels.

The deployment boundary is:

    model proposal -> deterministic checks -> execute OR diagnostic repair

Only the executor may append tool observations. An assistant's quoted or predicted observation is not an observation. Non-action outcomes (ask, abstain, answer) remain available; absence of a valid tool action must never silently become permission to perform a side effect.

## Evidence-gated repair

Within at most K action steps, each allowing at most R repairs (at most K(R+1) proposals overall, not a pooled budget):

1. Propose an action from the same small model, with a typed action interface. In the measured pilot this means post-generation validation, not Ollama format-constrained decoding.
2. Check structure and public runtime constraints.
3. If accepted, execute at most one action and append the genuine result.
4. Otherwise return a concise diagnostic naming the violated public constraint; propose again within the remaining budget.
5. If the budget is exhausted, stop or abstain. Do not execute the last invalid proposal.

A diagnostic can say an identifier has not been obtained from an earlier observation. It cannot reveal the correct hidden identifier. An answer may be structurally valid yet factually wrong; it must not be repaired using test labels. A gate can reduce invalid actions without increasing completed-task success, so both outcomes must be measured.

## What is and is not guaranteed

If every executor entry point enforces the gate, and the gate correctly implements a particular predicate C, then every dispatched action satisfies C. This follows directly because dispatch requires acceptance. It is a software invariant, not an LLM capability theorem.

If a proposal independently passes the gate with probability p, an idealized B-proposal process accepts with probability 1-(1-p)^B. Actual retries are correlated and feedback changes their distribution; the formula is illustrative only and must not be used as an empirical success estimate. Passing the gate is not equivalent to solving the task.

Runtime is bounded by the inference and tool-call limits. Token and latency costs must be measured rather than inferred from nominal retries; early exits, model loading and prompt reuse affect them.

## Novelty boundary

ReAct already couples actions and observations. CRITIC already repairs outputs using external tools. Reflexion already uses feedback without parameter updates. RubricRefine (arXiv:2605.09730v5, method sections 3.1–3.2.3) already combines pre-execution contract and data-provenance checks with iterative repair using a prompted LLM verifier. Typed function interfaces, validation and constrained JSON generation are established. EGAR's proposed distinction is deterministic checking of actual incremental observations, not LLM rubric scoring of candidate programs. This is a testable implementation distinction, not evidence of superiority or publication-grade novelty; the pilot does not directly compare RubricRefine.

## Saki integration contract (not production deployment)

The existing Saki tool registry and parser live in [agentTools.js](../../backend/services/agentTools.js); native-provider message support lives in [nativeToolCalling.js](../../backend/services/nativeToolCalling.js). A future production adapter should map canonical tool names and parameter schemas into the action interface without widening permissions. Research identifiers must not become paths or executable shell commands.

Requirements before enabling a production policy:

- Preserve existing permission checks, optimistic file hashes, session cancellation and native-tool history alignment.
- Classify side effects by explicit tool metadata, not a guessed name prefix.
- Never execute multiple speculative candidates to rank them.
- Track evidence origin and invalidate stale observations after mutations; presence in a history string is not provenance.
- Treat untrusted tool output as data, not instructions.
- Keep the feature opt-in until integration and regression tests validate real tool workflows.
- Evaluate natural-language final-answer correctness independently from tool-call validity.

The current isolated read-only simulator does not establish safety or effectiveness on arbitrary Saki plugins, terminal commands, file mutations or long conversations.
