# Confirmatory evaluation plan: what would establish parity?

This is a follow-up design, not an experiment already performed. The current pilot must not be described as a large-model equivalence study.

## Define the claim before testing

Choose a named large-model version, a named small-model checkpoint and quantization, and a target distribution of Saki tasks. Define whether the target is absolute completion rate, reliability over repeated runs, cost-adjusted utility, or latency. 'Full parameter' alone does not identify a model or control condition.

For success probability difference d = p_small_scaffold - p_large_baseline, predefine a practically acceptable margin delta (for example 0.05, only if application owners accept that loss). Non-inferiority requires a confidence bound above -delta. Equivalence additionally requires the upper bound below +delta. A non-significant difference is not evidence of equivalence.

## Dataset and budget

Use independent task authors and held-out templates, not merely new identifiers in the same templates. Include read-only retrieval, multi-hop dependencies, missing inputs, unavailable tools, distractors, long observations, multilingual instructions and cancellation. Test mutations only in disposable isolated environments with explicit authorization.

Select one pinned version of a public tool-use benchmark, document its license, and follow its official evaluator. Add a separate Saki-specific suite; never merge the scores without a declared weighting. BFCL and ToolSandbox are possible benchmarks, not benchmarks run by this pilot.

Use a pilot-derived variance estimate to power a paired comparison; do not choose sample size after observing significance. Repeat tasks over prespecified seeds. Report per-template and per-run variation rather than treating repeated instances as fully independent. Cluster-bootstrap task templates where appropriate.

## Conditions

1. Small model with production Saki policy.
2. Small model with typed output alone.
3. Small model with conventional execution-error retry.
4. Small model with evidence gating but no diagnostic specificity.
5. Small model with complete EGAR.
6. Named larger model with the same tool descriptions and environment.
7. A faithful RubricRefine baseline (arXiv:2605.09730v5), or an explicitly labeled adaptation when the incremental action interface differs from its code-mode setting. Count rubric-generation and verifier calls in its inference budget. This is essential prior art for pre-execution contract/provenance checking plus repair; comparing only to unstructured retries cannot establish novelty over it.

Match both maximum budgets and actual cost curves. Report success at fixed request, generated-token and wall-clock budgets. Never give only the proposed method access to a hidden correctness checker or more informative tool documentation. If validation enforces additional permissions, all arms must retain the same executor safety boundary; measure differences in planning separately.

## Report

Publish all planned outcomes including negative findings, paired differences and uncertainty, task-family breakdowns, model digests, prompt versions, benchmark/evaluator hashes, software/hardware versions, raw trajectories without private data, failure categories and bootstrap code. Separate cold-start latency from steady-state inference. Keep failures and timeouts in the denominator; report infrastructure failures separately and never silently replace them with successful reruns.

## Deployment gate

A positive synthetic result is insufficient for default production enablement. A real Saki integration must preserve permission checks, file-version preconditions, conversation history, cancellation, streaming and tool-specific argument types. Roll out only with an explicit feature flag and a documented fallback; failed validations must never turn into unrestricted retries or automatic execution of side-effecting candidates.
