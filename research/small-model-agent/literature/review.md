# Literature Review: Training-Free Methods for Small Local LLMs as Tool-Using Agents

*Compiled 2026-11-11. Scope: inference-time / scaffolding methods that help 3B–14B quantized local models (e.g. via Ollama) handle ReAct-style or native function-calling agent tasks.*

## Verification protocol

- Every paper below had its metadata (title, authors, date, arXiv comment/venue field, abstract) pulled live from the **arXiv API (export.arxiv.org)** during this task. BFCL was confirmed on its **PMLR proceedings page** instead.
- Venues are given only where at least one of these confirms them:
  - (a) the arXiv comment field,
  - (b) the PMLR or ACL Anthology page,
  - (c) a Semantic Scholar record that carries a conference DBLP/ACL ID.
- Where Semantic Scholar lists a venue but the DBLP key is still the arXiv/CoRR record, the venue is marked **(venue per S2, unconfirmed)**.
- Numbers marked **[full text]** come from reading the paper's HTML full text; all others come from the abstract.
- Papers I searched for but could not confirm are left out. In particular, "Octopus v2" is included, but nothing beyond its abstract was verified.
- **Totals:** 49 papers verified, 46 of them in clusters 1–7. The other three (Tool Documentation, MemGPT, the 2026 tool-use survey) are cited inline.

---

## Cluster 1 — Agent scaffolds

**[1] ReAct: Synergizing Reasoning and Acting in Language Models.** Yao et al., 2022/2023. ICLR 2023 (arXiv comment). arXiv:2210.03629. https://arxiv.org/abs/2210.03629
- **Method:** Interleaves free-text "Thought" reasoning traces with "Action" tool calls and "Observation" results in a single prompt loop. Reasoning lets the model induce, track and update plans and handle exceptions; actions ground it in external information.
- **Results:** With one or two in-context examples, ReAct beats imitation and RL baselines by +34% absolute success on ALFWorld and +10% on WebShop. It reduces hallucination versus CoT on HotpotQA and FEVER.
- **Relevance:** This is the baseline loop for any method we build. Its results were obtained with very large models (PaLM-540B, GPT-3), and it makes no special provision for weak format-following.

**[2] ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models.** Xu et al., 2023. arXiv:2305.18323. https://arxiv.org/abs/2305.18323
- **Method:** A Planner writes the whole tool plan up front, using variable placeholders (#E1, #E2…). Workers execute the plan and a Solver composes the answer, so observations never re-enter the planner's prompt.
- **Results:** 5× token efficiency and +4% accuracy on HotpotQA, plus robustness to tool failure. The authors show reasoning can be offloaded from 175B GPT-3.5 into a 7B LLaMA, but that step uses instruction fine-tuning.
- **Relevance:** Plan-first execution produces short contexts, which suits small models. The cost is that the plan cannot adapt to unexpected observations, and the small-model result depends on fine-tuning.

**[3] An LLM Compiler for Parallel Function Calling (LLMCompiler).** Kim et al., 2023. ICML 2024 (arXiv comment). arXiv:2312.04511. https://arxiv.org/abs/2312.04511
- **Method:** A Function Calling Planner emits a DAG of tasks. A Task Fetching Unit dispatches them, and an Executor runs independent calls in parallel. Replanning is supported.
- **Results:** Up to 3.7× latency speedup, 6.7× cost savings and about 9% higher accuracy than ReAct.
- **Relevance:** This is the planner format TinyAgent [7] builds on. Prompted off-the-shelf small models are poor at emitting the DAG format: TinyAgent reports 12.71% success for TinyLlama-1.1B and 41.25% for a 7B model before fine-tuning [full text of 7].

**[4] Reflexion: Language Agents with Verbal Reinforcement Learning.** Shinn et al., 2023. NeurIPS 2023 (S2/DBLP conf/nips). arXiv:2303.11366. https://arxiv.org/abs/2303.11366
- **Method:** After a failed trial, the agent writes a verbal self-reflection into an episodic memory buffer and retries with that reflection in context. No weights are updated.
- **Results:** 91% pass@1 on HumanEval, versus 80% for GPT-4 at the time.
- **Relevance:** Training-free, but it needs multiple trials plus a success or feedback signal, and it relies on the model's ability to reflect. Huang et al. [14b] show intrinsic self-correction without external feedback can degrade reasoning, which is a risk for small models.

**[5] Language Agent Tree Search (LATS).** Zhou et al., 2023. ICML 2024 (venue per S2; DBLP key is CoRR, so unconfirmed). arXiv:2310.04406. https://arxiv.org/abs/2310.04406
- **Method:** Monte Carlo Tree Search over agent trajectories. The LM serves as policy, value function and self-reflector, and environment feedback is used.
- **Results:** 92.7% pass@1 on HumanEval with GPT-4, and a 75.9 WebShop score with GPT-3.5, comparable to fine-tuning.
- **Relevance:** The strongest training-free search scaffold, but it needs many LLM calls per decision plus environment rollouts, which is expensive on local hardware. It also assumes the LM can evaluate states, which small models do poorly.

**[6] Plan-and-Solve Prompting.** Wang et al., 2023. ACL 2023 (arXiv comment). arXiv:2305.04091. https://arxiv.org/abs/2305.04091
- **Method:** A zero-shot prompt that first asks for a plan dividing the task into subtasks, then executes them. PS+ adds detailed instructions to reduce calculation and missing-step errors.
- **Results:** Consistently beats Zero-shot-CoT on 10 datasets with GPT-3, and is comparable to 8-shot CoT on math.
- **Relevance:** The canonical plan-then-execute prompt. It was evaluated on reasoning tasks with GPT-3, not on tool use or small models.

*Related scaffolds also verified:*
- **[6b] CodeAct: Executable Code Actions Elicit Better LLM Agents.** Wang et al., ICML 2024. arXiv:2402.01030. Code actions beat JSON/text actions by up to 20% across 17 LLMs on API-Bank and a new benchmark.
- **[6c] ToolChain\*.** Zhuang et al., 2023. arXiv:2310.13227. A* search over API-call trees: +3.1% on planning and +3.5% on reasoning tasks, using 7.35× and 2.31× less time respectively.
- **[6d] StateAct.** Rozanov & Rei, 2024/25. arXiv:2410.02810; ACL Anthology 2025.realm-1.27 per search result.
  - **Method:** Training-free. Adds goal "self-prompting" at every step plus an explicit "chain-of-states", all within a single LLM call.
  - **Results:** Beats ReAct by more than 10% on ALFWorld, 30% on TextCraft and 7% on WebShop.
  - **Caveat:** Evaluated on frontier LLMs.

---

## Cluster 2 — Small models as tool users

**[7] TinyAgent: Function Calling at the Edge.** Erdogan et al., 2024. EMNLP 2024 Demo (arXiv comment). arXiv:2409.00608. https://arxiv.org/abs/2409.00608
- **Method:** LLMCompiler-format function calling. TinyLlama-1.1B and Wizard-2-7B are fine-tuned with LoRA on 80K synthetic examples. A **Tool RAG** step uses a fine-tuned DeBERTa-v3-small multi-label classifier over 16 tools, keeping a tool if its probability exceeds 0.5 (about 3.97 tools per query, recall 0.998). Models are 4-bit quantized.
- **Results [full text]:**
  - Before fine-tuning, success was 12.71% (1.1B) and 41.25% (7B).
  - After fine-tuning: 78.89% and 83.09%, against 79.08% for GPT-4-Turbo.
  - Tool RAG cuts prompt tokens from 2762 to 1397 and raises success to 80.06% and 84.95%.
  - Basic embedding-similarity RAG *hurt* accuracy (74.88% and 78.50%) because it misses "auxiliary" tools the query never mentions, such as get_email_address.
- **Relevance:** Shows that pruning tools helps small models and that naive similarity retrieval can hurt. The large gains come from fine-tuning, and the retriever is trained.

**[8] Less is More: Optimizing Function Calling for LLM Execution on Edge Devices.** Paramanayakam et al., 2024. DATE 2025 (arXiv comment). arXiv:2411.15399. https://arxiv.org/abs/2411.15399
- **Method:** Fine-tuning-free dynamic tool selection.
  - The edge LLM first describes, in JSON, the "ideal tools" it would need.
  - These descriptions are embedded with MPNet, and a FAISS k-NN search runs over individual tools (Level 1) or offline-clustered tool groups (Level 2).
  - Only the best-matching subset is given to the model. If similarity is below 0.5 or the model reports failure, it falls back to the full tool set.
- **Setup [full text]:** Hermes2-Pro-8B, Llama3.1-8B, Mistral, Phi3, Qwen2-1.5B and Qwen2-7B, run **via Ollama** at q4_0/q4_1/q4_K_M/q8_0 on a Jetson AGX Orin. Benchmarks: BFCL (51 functions) and GeoEngine (46 functions).
- **Results:**
  - Up to 70% less execution time and 40% less power.
  - Success-rate gains for most models, though none for Mistral.
  - Quantization effect for Llama3.1-8B without the method [full text]: BFCL success falls from 63.04% (full precision) to 39.57% (q4_K_M) and 20.43% (q4_0).
  - In one query, 46 tools in context failed while 19 succeeded.
- **Relevance:** The closest prior work in setting (Ollama, quantized, training-free). It only addresses tool-set size. There is no per-step selection, no argument-level help and no stopping logic, and evidence on tool count is anecdotal.

**[9] Small LLMs Are Weak Tool Learners: A Multi-LLM Agent (α-UMi).** Shen et al., 2024. EMNLP 2024 (S2 ACL ID 2024.emnlp-main.929). arXiv:2401.07324. https://arxiv.org/abs/2401.07324
- **Method:**
  - Splits the agent into a **planner** (writes a rationale, then picks one of "Next: Caller", "Next: Summarizer" or "Give up"), a **caller** (emits the API call given the rationale) and a **summarizer** (writes the final answer).
  - Each role is a separately fine-tuned 7B or 13B LLaMA-2, trained in two stages: global then role-specific.
- **Results [full text]:**
  - α-UMi-7B reaches a 70.9% average pass rate on ToolBench, against 71.1% for GPT-4 with DFSDT and 60.7% for ToolLLaMA.
  - In-domain, the single-LLM 7B has a hallucination rate of 2.32 versus 0.57 for α-UMi.
  - The authors attribute small-model failure to limited capacity when one model must plan, call and summarize. Single-LLM loss plateaus, and the skills conflict.
- **Relevance:** This is the key motivation paper: decomposing roles helps small models. However, the gain needs fine-tuning and three model copies. The open question is whether **role decomposition with a single model and different prompts or decoding constraints per role** captures part of the gain without training. I did not find a paper that tests this directly.

**[10] Octopus v2: On-device language model for super agent.** Chen & Li, 2024. arXiv:2404.01744. https://arxiv.org/abs/2404.01744
- **Method:** A 2B on-device model fine-tuned so functions map to special tokens ("functional tokens"), cutting context length by 95%.
- **Results:** Claims to beat GPT-4 in accuracy and latency on its task, and to be 35× faster than Llama-7B with RAG-based function calling.
- **Relevance:** Training-based, and tied to a fixed function set. It is useful mainly as a contrast case.

**[11] Hammer: Robust Function-Calling for On-Device Language Models via Function Masking.** Lin et al., 2024. arXiv:2410.04587. https://arxiv.org/abs/2410.04587
- **Finding:** Function-calling models are "misled by specific naming conventions", so performance varies widely across benchmarks.
- **Method:** Hammer fine-tunes with function masking and irrelevance-detection data.
- **Relevance:** Documents that small models are brittle to tool names. Hammer fixes this with training; PA-Tool [12] is a training-free alternative.

**[12] Don't Adapt Small Language Models for Tools; Adapt Tool Schemas to the Models (PA-Tool).** Lee et al., 2025. ACL 2026 Main (arXiv comment). arXiv:2510.07248. https://arxiv.org/abs/2510.07248
- **Finding:** Identifies **schema misalignment**: small models hallucinate plausible tool names that are not in the schema, because they internalized other naming conventions during pretraining.
- **Method:** Training-free. Renames tool components to the candidate with the highest "peakedness", a pretraining-familiarity signal.
- **Results:**
  - Up to 17% improvement on MetaTool and RoTBench, with misalignment errors down 80%.
  - Constrained generation alone raised Qwen2.5-7B single-turn tool selection on RoTBench from 49.5% to 78.1%.
  - It also *lowered* MetaTool reliability for Qwen2.5-3B, from 83.6% to 60.9%: enum constraints push the model to emit a tool even when none applies. *(These two numbers come from a search-result snippet of the full text, not re-read by me, so treat them as UNVERIFIED detail.)*
- **Relevance:** A directly relevant training-free lever, operating at the interface level rather than in the loop.

**[13] Small Models, Big Tasks: An Exploratory Empirical Study on Small Language Models for Function Calling.** Kavathekar et al., 2025. EASE 2025 (arXiv comment). arXiv:2504.19277. https://arxiv.org/abs/2504.19277
- **Method:** An empirical study of small language models on function calling in zero-shot, few-shot and fine-tuned settings, including on-edge latency and memory measurements.
- **Results:** Small models improve from zero-shot to few-shot to fine-tuned but "struggle significantly with adhering to the given output format."
- **Relevance:** Documents that format adherence is the leading small-model failure.

**[14] LongFuncEval: Measuring the effectiveness of long context models for function calling.** Kate et al., 2025. arXiv:2505.10570. https://arxiv.org/abs/2505.10570
- **Results:**
  - Performance drops by **7%–85% as the number of tools grows**.
  - Answer retrieval degrades by 7%–91% as tool responses get longer.
  - Accuracy degrades by 13%–40% as multi-turn conversations get longer.
  - These effects appear across model families and sizes, even with 128K-context models.
- **Relevance:** The strongest quantitative evidence for tool-count and observation-length degradation. It motivates both tool pruning and observation compression.

*Also verified:* **[14a] Small Reasoning Models are Instruction Followers in Function Calling (IFFC).** Taheri et al., 2026. arXiv:2608.22472.
- **Method:** Decouples function-calling logic into a smaller model working in an instruction-following (not tool-calling) context.
- **Results:** Beats both native function calling and prompt-based function calling, and stays robust under aggressive quantization.
- **Relevance:** Further evidence that the native function-calling template can be a handicap.

---

## Cluster 3 — Tool retrieval and selection

**[15] Gorilla: Large Language Model Connected with Massive APIs.** Patil et al., 2023. NeurIPS (venue per S2; DBLP key CoRR, unconfirmed). arXiv:2305.15334. https://arxiv.org/abs/2305.15334
- **Method:** A fine-tuned LLaMA trained with retriever-aware training on API docs. Also introduces APIBench (HuggingFace, TorchHub and TensorHub APIs).
- **Results:** Surpasses GPT-4 on writing API calls and reduces hallucinated API usage.
- **Relevance:** Shows retrieval plus documentation helps with argument hallucination, but relies on fine-tuning.

**[16] ToolLLM: Facilitating LLMs to Master 16000+ Real-world APIs.** Qin et al., 2023. ICLR 2024 (venue per S2; unconfirmed). arXiv:2307.16789. https://arxiv.org/abs/2307.16789
- **Method:**
  - ToolBench: 16,464 RapidAPI APIs, with instructions and solution paths generated by ChatGPT.
  - **DFSDT**, a depth-first-search decision tree that lets the model evaluate multiple reasoning traces and backtrack.
  - A neural API retriever, and the ToolEval evaluator.
- **Results:** ToolLLaMA, a fine-tuned 7B model, is comparable to ChatGPT.
- **Relevance:** DFSDT is a training-free search procedure that can be reused, but it is costly (many calls). The retriever is trained.

**[17] Re-Invoke: Tool Invocation Rewriting for Zero-Shot Tool Retrieval.** Chen et al., 2024. EMNLP Findings 2024 (arXiv comment). arXiv:2408.01875. https://arxiv.org/abs/2408.01875
- **Method:** Fully unsupervised.
  - At index time, generates synthetic queries for each tool document.
  - At query time, an LLM extracts the user's intents.
  - Tools are ranked with multi-view, intent-based similarity.
- **Results:** On ToolE, +20% relative nDCG@5 for single-tool retrieval and +39% for multi-tool retrieval.
- **Relevance:** Training-free retrieval suited to local models (query rewriting could even be done by the small model itself). It addresses retrieval only, not downstream agent success.

**[18] Retrieval Models Aren't Tool-Savvy: Benchmarking Tool Retrieval for LLMs (ToolRet).** Shi et al., 2025. ACL 2025 (arXiv comment). arXiv:2503.01763. https://arxiv.org/abs/2503.01763
- **Benchmark:** 7.6K retrieval tasks over a 43K-tool corpus.
- **Results:** Strong conventional IR models perform poorly on it, and the low retrieval quality degrades downstream pass rates. The authors release 200K training instances.
- **Relevance:** A warning that off-the-shelf embedding retrieval for tool pruning is a weak link. This matches TinyAgent's finding that basic RAG hurt.

**[19] AnyTool: Self-Reflective, Hierarchical Agents for Large-Scale API Calls.** Du et al., 2024. ICML 2024 (S2/DBLP conf/icml). arXiv:2402.04253. https://arxiv.org/abs/2402.04253
- **Method:** A hierarchical API retriever (category, then tool, then API), a solver, and a self-reflection re-activation loop. It uses GPT-4 function calling with no training.
- **Results:** +35.4% average pass rate over ToolLLM on ToolBench. The paper also shows ToolBench's original evaluation inflated pass rates.
- **Relevance:** Training-free and hierarchical, but built on GPT-4. Whether hierarchical self-retrieval works with 7B models is untested there.

*Also verified:*
- **[19a] Toolshed** (Lumer et al., 2024, arXiv:2410.14594). Fine-tuning-free RAG-Tool Fusion with pre-, intra- and post-retrieval steps: +46%, +56% and +47% absolute Recall@5 on ToolE single-tool, ToolE multi-tool and Seal-Tools.
- **[19b] RAG-MCP** (Gan & Sun, 2025, arXiv:2505.03275). Semantic retrieval over MCP tools cuts prompt tokens by more than 50% and raises tool-selection accuracy from 13.62% to 43.13%.
- **[19c] MCP-Zero** (Fei et al., 2025, arXiv:2506.01056). The *model* actively requests tools it lacks, which are found via hierarchical semantic routing. Reports a 98% token reduction on API-Bank.
- **[19d] Dynamic Tool Dependency Retrieval (DTDR)** (Patel et al., 2025, arXiv:2512.17052). Conditions retrieval on the evolving *plan*, not just the query, for on-device agents. Success rate rises 23%–104% over static retrievers. It learns dependencies from demonstrations, so it is lightly data-driven.
- **[19e] EasyTool** (Yuan et al., NAACL 2025 per S2/DBLP conf/naacl, arXiv:2401.06201). Converts verbose tool docs into concise, unified tool instructions, cutting tokens and incorrect tool usage.
- **[19f] DRAFT** (Qu et al., ICLR 2025 Oral per arXiv comment, arXiv:2410.08197). Iteratively rewrites tool documentation from trial-and-error feedback.

---

## Cluster 4 — Constrained and structured decoding

**[20] Grammar-Constrained Decoding for Structured NLP Tasks without Finetuning.** Geng et al., 2023. EMNLP 2023 (arXiv comment). arXiv:2305.13971. https://arxiv.org/abs/2305.13971
- **Method:** Formal grammars, including *input-dependent grammars*, constrain an LM's output for information extraction, entity disambiguation and parsing.
- **Results:** Grammar-constrained LMs beat unconstrained ones and sometimes beat fine-tuned task models.
- **Relevance:** Input-dependent grammars map naturally onto "the grammar is the current tool schema subset", a key building block.

**[21] Efficient Guided Generation for Large Language Models (Outlines).** Willard & Louf, 2023. arXiv:2307.09702. https://arxiv.org/abs/2307.09702
- **Method:** Recasts guided generation as finite-state-machine transitions with a precomputed vocabulary index, supporting regexes and CFGs at low overhead.
- **Relevance:** The core mechanism behind JSON-schema-constrained tool calls. Ollama's `format`/JSON-schema structured outputs are grammar-based in a similar way (via llama.cpp GBNF). That last point comes from my background knowledge and was not verified in this task.

**[22] XGrammar: Flexible and Efficient Structured Generation Engine for LLMs.** Dong et al., 2024. MLSys 2025 (arXiv comment). arXiv:2411.15100. https://arxiv.org/abs/2411.15100
- **Method:** Splits the vocabulary into context-independent tokens (prechecked) and context-dependent tokens, uses a persistent stack, and co-designs with the inference engine.
- **Results:** Up to 100× speedup and near-zero end-to-end overhead.
- **Relevance:** Constrained decoding is now essentially free in latency, so the remaining question is accuracy, not cost.

**[23] Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of LLMs.** Tam et al., 2024. EMNLP 2024 Industry Track (S2 ACL ID 2024.emnlp-industry.91). arXiv:2408.02442. https://arxiv.org/abs/2408.02442
- **Method:** Compares JSON mode (constrained decoding), format-restricting instructions and a two-step NL-to-Format approach.
- **Results [full text]:**
  - LLaMA-3-8B on Last Letter falls from 70.1 to 7.56 under JSON mode.
  - On GSM8K it falls from 74.7 to 65.38.
  - GPT-3.5 GSM8K falls from 76.6 to 29.87, because 100% of its JSON-mode outputs put the "answer" key before the "reason" key, removing CoT.
  - On *classification* tasks, format restriction often helps. For example, Gemini on DDXPlus rises from 41.6 to 84.92 under JSON mode.
  - NL-to-Format, which reasons first and then converts, roughly recovers natural-language performance.
- **Relevance:** Central to the design.
  - Constraints *hurt reasoning* but *help selection-type decisions*.
  - That suggests reasoning freely, then constraining only the action (tool name, arguments) is the safe pattern.

**[24] CRANE: Reasoning with constrained LLM generation.** Banerjee et al., 2025. ICML 2025 (arXiv comment). arXiv:2502.09061. https://arxiv.org/abs/2502.09061
- **Method:** Gives a theoretical account of why very restrictive grammars reduce reasoning. Proposes augmenting the grammar so it allows free reasoning, with constraints applied only inside delimited answer segments.
- **Results:** Up to +10 points on GSM-Symbolic and FOLIO over both constrained and unconstrained baselines.
- **Relevance:** The principled version of "think free, act constrained". It was not evaluated on tool calling or multi-step agents.

*Also verified:*
- **[24a] Grammar-Aligned Decoding** (Park et al., NeurIPS 2024, arXiv:2405.21047). Greedy grammar-constrained decoding distorts the LM distribution, yielding grammatical but low-likelihood outputs; the authors propose ASAp.
- **[24b] JSONSchemaBench** (Geng et al., 2025, arXiv:2501.10868). 10K real-world JSON schemas used to evaluate Guidance, Outlines, llama.cpp, XGrammar, OpenAI and Gemini on efficiency, coverage and quality.
- **[24c] Thinking Before Constraining / In-Writing** (Nguyen et al., 2026, arXiv:2601.07525; "v2-EMNLP" in the arXiv comment). Free reasoning, then structured decoding triggered by a trigger token; up to +27% over natural generation. Tested on classification and reasoning, not agents.
- **[24d] Constrained Decoding Eliminates Structural Failures in Small LLMs but Reveals a Scale-Dependent Semantic Gap** (Chavan, 2026, arXiv:2609.23742). For 0.6B–4B models, Outlines and XGrammar raise schema validity from 78.6–92.9% to 100%. But "instruction-semantic failures (e.g., multi-step function calling) remain CD-resistant."
- **[24e] Repair, Not Improvement: Decomposing Constrained Decoding in Tool-Call Abstention** (Lee, 2026, arXiv:2608.13959).
  - **Setup:** Models from 0.6B to 4B.
  - **Abstention:** Grammar restriction over tool names hurts abstention (choosing *not* to call a tool), by up to −29.5 points. What it repairs is "readable output, not judgment."
  - **Tool-needed items:** The effect is positive throughout.

---

## Cluster 5 — Test-time compute for small models

**[25] Self-Consistency Improves Chain of Thought Reasoning in LMs.** Wang et al., 2022. ICLR 2023 (arXiv comment). arXiv:2203.11171. https://arxiv.org/abs/2203.11171
- **Method:** Sample diverse CoT paths and take a majority vote over final answers.
- **Results:** +17.9% on GSM8K, +11.0% on SVAMP and +12.2% on AQuA.
- **Relevance:** Requires discrete, comparable answers. For tool calls, that means a canonical form of the call.

**[26] Let's Sample Step by Step: Adaptive-Consistency.** Aggarwal et al., 2023. EMNLP 2023 (arXiv comment). arXiv:2305.11860. https://arxiv.org/abs/2305.11860
- **Method:** Adds a lightweight stopping criterion based on agreement among samples drawn so far.
- **Results:** Up to 7.9× fewer samples, with less than 0.1% average accuracy loss, across 17 datasets.
- **Relevance:** The direct ancestor of per-step adaptive voting for agents (see TrACE [30]).

**[27] Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters.** Snell et al., 2024. arXiv:2408.03314. https://arxiv.org/abs/2408.03314
- **Method:** Studies verifier search with process reward models (PRMs) and adaptive revision.
- **Results:**
  - The best strategy depends on prompt difficulty.
  - A compute-optimal allocation is more than 4× more efficient than best-of-N.
  - In FLOPs-matched comparisons, a smaller model with test-time compute beats a **14× larger** model on problems where the small model has non-trivial success.
- **Relevance:** The theoretical justification for spending local compute instead of parameters. The setting is math with a trained PRM, so no agent or tool-use evidence.

**[28] Universal Self-Consistency for LLM Generation.** Chen et al., 2023. arXiv:2311.17311. https://arxiv.org/abs/2311.17311
- **Method:** The LLM itself selects the most consistent candidate among samples, for free-form outputs where exact-match voting is undefined.
- **Results:** Matches self-consistency on math and execution-based voting on code.
- **Relevance:** An option for voting over tool calls whose arguments differ only superficially. It costs an extra call and relies on the small model's judgment.

**[29] Soft Self-Consistency Improves Language Model Agents.** Wang et al., 2024. ACL 2024 (arXiv comment). arXiv:2402.13212. https://arxiv.org/abs/2402.13212
- **Finding:** Majority voting *fails to give consistent gains* on interactive multi-action tasks, because valid actions are sparse and diverse.
- **Method:** Soft-SC scores candidates by likelihood instead of vote count.
- **Results:** Same or better performance with half the samples; +6.6% on WebShop and +4.7% on ALFWorld over SC at a fixed sample count.
- **Relevance:** Highly relevant. Ollama exposes logprobs only in limited form; that is my background knowledge and not verified here.

**[30] Don't Overthink It: Inter-Rollout Action Agreement as a Free Adaptive-Compute Signal for LLM Agents (TrACE).** Sethi, 2026. arXiv:2604.08369. https://arxiv.org/abs/2604.08369
- **Method:**
  - Per agent step, sample k_init=2 candidate actions at temperature 0.7.
  - Canonicalize them (lowercase, strip punctuation and whitespace) and check exact match.
  - Commit if plurality agreement is at least 0.75; otherwise keep sampling up to k_max ∈ {4, 8} [full text].
- **Setup:** Qwen2.5-3B-Instruct Q4_K_M on CPU via llama-cpp-python [full text].
- **Results:**
  - TrACE-4 matches SC-4 accuracy with 33% fewer calls on GSM8K and 39% fewer on MiniHouse.
  - TrACE-8 matches SC-8 with 55% and 65% fewer.
  - **Caveat [full text]:** On MiniHouse, *no* method beat greedy decoding (0.367 for every method). The benefit is efficiency relative to self-consistency, not accuracy. Actions were plain-text choices from an enumerated list, not structured tool calls with arguments. Samples were tiny (n=30 and n=50).
- **Relevance:** The **closest prior work to a "small local model plus per-step adaptive voting" algorithm**, and a must-cite. Its limits mark gaps: no structured function calls, no argument-level canonicalization, no accuracy gain, and no real tool benchmark.

**[31] Agentic Test-Time Scaling for WebAgents (CATTS).** Lee et al., 2026. arXiv:2602.12276. https://arxiv.org/abs/2602.12276
- **Method:**
  - Sample N actions per step and deduplicate them with an LLM.
  - Use vote entropy or the top-1/top-2 margin to decide whether to call an LLM arbiter.
- **Results:**
  - Up to +11.8% over majority voting, with fewer tokens.
  - **Uniform scaling saturates or hurts:** Online-Mind2Web majority vote falls from 22.6% (N=1) to 15.1% (N=20) [full text].
  - Arbiters that override high-consensus votes hurt success (46.9% versus 35.0%) [full text].
- **Setup:** Backbone is gpt-oss-120b, not a small model.
- **Relevance:** Strong evidence that confidence-gated compute beats uniform voting in agent loops. The open question is small models.

**[32] Scaling Test-time Compute for LLM Agents.** Zhu et al., 2025. arXiv:2506.12928. https://arxiv.org/abs/2506.12928
- **Method:** A systematic study of parallel sampling (BoN, beam search, DVTS), sequential revision, verifiers and merging methods, and rollout diversification for agents.
- **Results:** Test-time compute helps. *Knowing when to reflect* matters. List-wise verification is the best merging method, and diverse rollouts help.
- **Relevance:** A useful catalog. Models studied are mostly large.

*Also verified:*
- **[32a] More Agents Is All You Need** (Li et al., TMLR, arXiv:2402.05120). Sampling-and-voting performance scales with the number of agents, with larger gains on harder tasks.
- **[32b] When Agents Disagree With Themselves** (Mehta, 2026, ICML 2026 workshop, arXiv:2602.11619).
  - **Variance:** Same-input runs yield 2.3–4.2 distinct action sequences per 10 runs.
  - **Accuracy by consistency:** Consistent tasks reach 82–87% accuracy; inconsistent ones reach 41–65%.
  - **Divergence point:** Divergence concentrates at **step 2**.
  - **Selective prediction:** Answering only when all three runs agree adds 6–14pp at 54–62% coverage.
- **[32c] RCAgent** (Wang et al., CIKM 2024, arXiv:2310.16340). Trajectory-level self-consistency that starts sampling only at the finalization step.
- **[32d] KATE** (Hao et al., 2026, arXiv:2606.10875).
  - **Finding:** For tool use, expanding reasoning *width* (parallel sampling plus aggregation) activates knowledge better than expanding *depth*, which has diminishing returns.
  - **Results:** Evaluated on BFCL-V3 and AppWorld across model scales. A search snippet claims +15% on Qwen3-8B BFCL-V3 in the training-free setting. **UNVERIFIED**: that figure is not in the abstract.

---

## Cluster 6 — Context management for agents

**[33] Lost in the Middle: How Language Models Use Long Contexts.** Liu et al., 2023. TACL 2023 (arXiv comment). arXiv:2307.03172. https://arxiv.org/abs/2307.03172
- **Finding:** Performance is highest when relevant information sits at the start or end of the context and degrades significantly in the middle, even for long-context models.
- **Relevance:** In long ReAct traces, the original task and key earlier observations drift into the "middle". This motivates restating goal and state near the end of the prompt (as StateAct [6d] does).

**[34] The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management.** Lindenbauer et al., 2025. NeurIPS 2025 DL4C workshop (arXiv comment). arXiv:2508.21433. https://arxiv.org/abs/2508.21433
- **Method:** Replaces old tool observations with a placeholder while keeping the agent's own reasoning and actions.
- **Results:** On SWE-bench Verified across five model configurations, this halves cost and matches or slightly beats LLM summarization. A hybrid cuts a further 7–11%.
- **Relevance:** Cheap, training-free context control. For small models, a summarization call is itself error-prone, so masking is attractive. It has not been tested on small models or on function-calling benchmarks.

**[35] ACON: Optimizing Context Compression for Long-horizon LLM Agents.** Kang et al., 2025. ICML 2026 (arXiv comment). arXiv:2510.00615. https://arxiv.org/abs/2510.00615
- **Method:** Compresses history and observations when length thresholds are exceeded, following natural-language guidelines optimized from contrastive failure analysis by an optimizer LLM. The compressor can be distilled into a small model.
- **Results [full text]:**
  - Peak tokens drop 26–54%.
  - Naive baselines hurt: on AppWorld with gpt-4.1, FIFO truncation drops accuracy from 56.0 to 45.8 and prompted summarization to 43.5.
  - For small agents, Qwen3-14B goes from 25.6% to 33.9% on AppWorld and from 0.158 to 0.23 EM on 8-objective QA. That is the "up to 46%" figure, a relative gain.
- **Relevance:** Shows context distraction is a real small-model failure and naive truncation or summarization can hurt. Guideline optimization needs a large optimizer model and training tasks.

*Also verified:*
- **[35a] MemGPT** (Packer et al., 2023, arXiv:2310.08560). OS-style virtual context management with tiered memory and interrupts.
- **[35b] LLMs Get Lost In Multi-Turn Conversation** (Laban et al., 2025, arXiv:2505.06120). An average 39% drop from single-turn to multi-turn across six tasks. LLMs commit early to wrong assumptions and "do not recover."
- **[35c] Agent Workflow Memory** (Wang et al., 2024, arXiv:2409.07429). Induces reusable workflows from past trajectories, with +24.6% and +51.1% relative success on Mind2Web and WebArena.

---

## Cluster 7 — Benchmarks

**[36] The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of LLMs.** Patil et al., 2025. ICML 2025, PMLR vol. 267, pp. 48371–48392. https://proceedings.mlr.press/v267/patil25a.html (OpenReview id 2GmDdhBdDk)
- **Coverage:** Serial and parallel calls across languages, evaluated with AST matching. Also covers irrelevance/abstention and stateful multi-turn agentic settings (v3/v4).
- **Finding:** "memory, dynamic decision-making, and long-horizon reasoning remain open challenges."
- **Relevance:** The primary evaluation target. It already contains many small open models, giving a gap baseline.

**[37] τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains.** Yao et al., 2024. arXiv:2406.12045. https://arxiv.org/abs/2406.12045
- **Coverage:** An LM-simulated user, domain APIs and policy documents, with evaluation by final database state. Introduces the **pass^k** reliability metric.
- **Results:** GPT-4o succeeds on less than 50% of tasks, with pass^8 below 25% in retail.
- **Relevance:** pass^k is the right metric for consistency-oriented methods. Task difficulty may floor small models.
- **Follow-up [37a]:** **τ²-Bench** (Barres et al., 2025, arXiv:2506.07982) adds a dual-control telecom domain.

**[38] API-Bank: A Comprehensive Benchmark for Tool-Augmented LLMs.** Li et al., 2023. EMNLP 2023 (arXiv comment). arXiv:2304.08244. https://arxiv.org/abs/2304.08244
- **Coverage:** 73 runnable APIs and 314 dialogues with 753 calls, evaluating planning, retrieval and calling.
- **Relevance:** Small and runnable, so cheap for local evaluation.

**[39] NESTFUL: A Benchmark for Evaluating LLMs on Nested Sequences of API Calls.** Basu et al., 2024. EMNLP (venue per S2; unconfirmed). arXiv:2409.03797. https://arxiv.org/abs/2409.03797
- **Coverage:** More than 1,800 executable nested sequences, where one call's output feeds a later call's input.
- **Results:** The best model, GPT-4o, reaches only 28% full-sequence accuracy.
- **Relevance:** Tests data flow between calls, a likely small-model weakness and a natural target for ReWOO/LLMCompiler-style variable binding.

**[40] ToolSandbox: A Stateful, Conversational, Interactive Evaluation Benchmark for LLM Tool Use.** Lu et al., 2024. NAACL (venue per S2; unconfirmed). arXiv:2408.04682. https://arxiv.org/abs/2408.04682
- **Coverage:** Stateful tools with implicit state dependencies, an on-policy user simulator and milestone-based evaluation.
- **Results:** Shows a "significant performance gap" between open-source and proprietary models. State dependency, canonicalization and insufficient-information cases are hard even for state-of-the-art models.

**[41] ToolHop: A Query-Driven Benchmark for Evaluating LLMs in Multi-Hop Tool Use.** Ye et al., 2025. ACL 2025 Main (arXiv comment). arXiv:2501.02506. https://arxiv.org/abs/2501.02506
- **Coverage:** 995 queries and 3,912 locally executable tools.
- **Overall:** The best model, GPT-4o, reaches 49.04%.
- **Results by framework [full text, Table 11]:**

  | Model | Native FC | ReAct | CodeAct |
  |---|---|---|---|
  | Qwen2.5-7B | 16.18 | **40.50** | 22.91 |
  | LLaMA3.1-8B | 13.47 | **38.59** | 25.63 |
  | GPT-4o | 47.74 | 54.17 | 44.92 |

- **Interpretation:** Under native function-calling templates, small models "invoke tools directly without explicit reasoning."
- **Error types:** Tool hallucination, parameter hallucination and missing parameters. LLaMA3.1-8B had errors in 41.61% of queries.
- **Relevance:** Key evidence. **For small models, ReAct-style prompting more than doubles accuracy over native function calling, and the gap to GPT-4o shrinks from about 31 points to about 14.**

*Also verified:*
- **[41a] When2Call** (Ross et al., NAACL 2025 per arXiv comment and ACL Anthology 2025.naacl-long.174, arXiv:2504.18851). Tests when to call a tool, ask a follow-up, or say it cannot answer. State-of-the-art tool-calling models show "significant room for improvement."
- **[41b] AgentBench** (Liu et al., ICLR 2024, arXiv:2308.03688). A significant gap between commercial models and open models up to 70B. Main failure causes: poor long-term reasoning, decision-making and instruction following.
- **[41c] MTU-Bench** (Wang et al., 2024, arXiv:2410.11710). Covers single/multi-turn and single/multi-tool settings.
- **[41d] m&m's** (Ma et al., ECCV 2024 per S2/DBLP conf/eccv, arXiv:2403.11085). Compares multi-step versus step-by-step planning, JSON versus code formats, and parsing, verification and execution feedback.
- **[41e] MCPVerse** (Lei et al., 2025, arXiv:2508.16260). With more than 550 real tools (over 140K tokens), most models degrade as the tool set grows.
- **[41f] Calibration is the Bottleneck** (Zhao et al., Findings of EMNLP 2026, arXiv:2609.00949). Decomposes multi-turn failures into action-class miscalibration (TOOL_CALL / ASK / REFUSE / CONFIRM) versus execution failure. Context-only perturbations shift accuracy by +11.5 to −21.0 pp depending on model family.
- **[41g] LLM Agents Already Know When to Call Tools — Even Without Reasoning** (Sun et al., NeurIPS 2026, arXiv:2605.09252).
  - **Training-free baselines fail:** Prompt-only suppression of tool calls also suppresses necessary ones, and Reason-then-Act costs accuracy.
  - **Hidden-state signal:** Tool necessity is linearly decodable from hidden states (AUROC 0.89–0.96).
  - **Method:** Probe&Prefill trains a lightweight linear probe on that signal.

---

## Synthesis

### (a) Documented failure modes of small models in agent loops

1. **Format and schema non-adherence.** Unparseable or ill-formed calls, and hallucinated tool or parameter names.
   - Documented by Small Models, Big Tasks [13], ToolHop [41] (tool and parameter hallucination; 41.61% of LLaMA3.1-8B queries contained errors) and α-UMi [9] (hallucination rate 2.32 vs 0.57).
   - The names are often *plausible but wrong* because they follow pretraining naming conventions: PA-Tool [12] and Hammer [11].
2. **Degradation as the number of tools grows.**
   - LongFuncEval [14] reports drops of 7–85%; MCPVerse [41e] shows the same pattern.
   - Less-is-More [8] shows a 46-tool prompt failing where 19 tools succeed on an 8B q4 model.
   - TinyAgent [7] halves the prompt with tool RAG.
3. **Skipping reasoning under native function-calling templates.** ToolHop [41] finds small models jump straight to calls, more than halving accuracy versus ReAct. IFFC [14a] and the format-restriction results [23] point the same way.
4. **Long-context and observation distraction.**
   - Lost-in-the-middle [33], and LongFuncEval's 7–91% degradation with longer tool responses [14].
   - ACON [35] shows small agents benefit most from compression.
   - Multi-turn degradation: Laban et al. [35b].
5. **Wrong control decisions** about whether to call, ask, abstain or stop. Documented by When2Call [41a], Calibration-is-the-Bottleneck [41f], When2Tool [41g] and constrained-abstention [24e]. α-UMi [9] gives "when to finish" its own planner decision.
6. **Early divergence and error compounding.** Divergence concentrates at step 2 [32b]; models "get lost and do not recover" [35b]; per-step errors compound over long horizons [31].
7. **Quantization amplifies all of the above.** Llama3.1-8B on BFCL falls from 63.0% (full precision) to 39.6% (q4_K_M) [8, full text].
8. **Multi-role overload.** A single small model handling planning, calling and summarizing hits a capacity limit [9].

### (b) Training-free levers known to work, and their limits

- **Reasoning before acting (ReAct).** The largest single training-free gain observed for 7–8B models in ToolHop: native FC 16% → ReAct 40% [41]. Limitation: free-text actions must be parsed, and that is where format errors appear.
- **Tool-set reduction or retrieval** [7, 8, 17, 19a–d].
  - Works, but retrieval quality is the weak point: ToolRet [18]. In TinyAgent [7], naive similarity RAG *lowered* accuracy because it missed auxiliary tools.
  - Static, query-only retrieval misses multi-step dependencies [19d].
- **Constrained decoding.**
  - Guarantees syntax at near-zero cost [21, 22] and helps selection-type decisions [23].
  - It **hurts reasoning** when applied to the whole output [23, 24]. It distorts the distribution [24a]. It does not fix semantic or multi-step errors [24d]. On small models it **removes abstention** [24e, 12].
  - The fix is to reason freely and constrain only the action [24, 24c], but this is untested in agent loops.
- **Interface and documentation rewriting** [12, 19e, 19f]. Training-free and effective. It is an offline, one-time cost, and some variants (DRAFT) need many trial runs.
- **Sampling and voting** [25–32].
  - Helps single-answer reasoning. On multi-action agent tasks, plain majority voting gives inconsistent gains [29], saturates or even hurts at larger N [31], and multiplies cost on local hardware.
  - Adaptive or confidence-gated allocation [26, 30, 31] recovers most of the efficiency, but TrACE's only small-model agent result showed **no accuracy gain over greedy** [30].
  - Agreement or variance is a usable *uncertainty signal* for selective answering [32b].
- **Context control.** Observation masking matches LLM summarization at half the cost [34]. Naive FIFO truncation and prompted summarization can hurt [35]. Goal restatement and state tracking help [6d, 33].
- **Search** (LATS, DFSDT, ToolChain\*) [5, 16, 6c]. Strong, but call-hungry, and it relies on LM self-evaluation, which small models do poorly. Intrinsic self-correction is unreliable without external feedback [14b, Huang et al. 2310.01798].

### (c) Gaps: combinations I did **not** find for training-free, single-small-model agents

Each statement below means "I did not find it in this search", not "nobody has done it".

1. **Per-step adaptive voting over *structured* function calls.** TrACE [30] votes over enumerated plain-text actions with string canonicalization. CATTS [31] uses a 120B model plus an LLM deduplicator. I did not find a method that canonicalizes tool calls (tool name plus type-normalized, order-insensitive arguments, with argument-level partial agreement) and gates compute on that agreement for a 3–14B model on BFCL, NESTFUL or ToolHop.
2. **Role decomposition with a single small model, without training.** α-UMi [9] shows splitting planner, caller and summarizer helps, but only with three fine-tuned models. I did not find a training-free version that uses one model with role-specific prompts *and role-specific decoding constraints*. For example: free reasoning for the planner; a grammar restricted to the retrieved tool subset and that tool's argument schema for the caller; and a separate constrained control decision {call, ask, answer, abstain} for the planner.
3. **Separating the control decision from argument filling to protect abstention.** [24e] and [12] show tool-name grammars destroy abstention in small models. When2Tool [41g] needs a trained probe. I did not find a training-free scheme where the stop/abstain/ask decision is a separately sampled, voted classification-style step. Format constraints help classification [23], so this might preserve both properties.
4. **Plan-conditioned, per-step tool subsetting driven by the small model itself, combined with constrained calling.** Less-is-More [8] selects once per query. DTDR [19d] conditions on the plan but learns dependencies from demonstrations. MCP-Zero [19c] was not shown on small models. I did not find per-step re-retrieval plus grammar restriction to the subset on quantized 7B models.
5. **Context management evaluated for small models on function-calling benchmarks.** Observation masking [34] was tested on SWE-bench with larger models. ACON [35] needs a large optimizer. I did not find a study of masking, structured state ledgers (StateAct-style [6d]) or variable-binding memory (ReWOO-style [2]) for 3–14B models on BFCL multi-turn, NESTFUL or ToolSandbox.
6. **Agreement-based selective verification at the divergence point.** [32b] finds divergence concentrates early (step 2). I did not find a method that spends extra samples specifically at early or high-entropy steps of tool-use trajectories and then stops spending.
7. **A unified small-model study under quantization.** Except Less-is-More [8], almost all scaffold and test-time-compute papers use full-precision or frontier models. I did not find a systematic evaluation of scaffold × quantization level × model size on a standard tool benchmark.

**Positioning:** A new algorithm would most clearly extend prior work if it combined the following, evaluated on BFCL v3/v4 multi-turn plus NESTFUL or ToolHop with Ollama-quantized 3–14B models, and reported pass^k:
- (i) ReAct-style free reasoning;
- (ii) per-step model-driven tool subsetting;
- (iii) grammar constraints applied only to the action span;
- (iv) a separate voted control decision (call/ask/answer/abstain);
- (v) canonicalized, agreement-gated adaptive sampling over structured calls;
- (vi) masking-based context control.

Baselines must include ReAct, native FC, Less-is-More-style selection, SC/Adaptive-Consistency and TrACE.

---

## BibTeX

```bibtex
@inproceedings{yao2023react,
  title={ReAct: Synergizing Reasoning and Acting in Language Models},
  author={Yao, Shunyu and Zhao, Jeffrey and Yu, Dian and Du, Nan and Shafran, Izhak and Narasimhan, Karthik and Cao, Yuan},
  booktitle={International Conference on Learning Representations (ICLR)},
  year={2023},
  eprint={2210.03629},
  archivePrefix={arXiv}
}
@article{xu2023rewoo,
  title={ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models},
  author={Xu, Binfeng and Peng, Zhiyuan and Lei, Bowen and Mukherjee, Subhabrata and Liu, Yuchen and Xu, Dongkuan},
  journal={arXiv preprint arXiv:2305.18323},
  year={2023}
}
@inproceedings{kim2024llmcompiler,
  title={An LLM Compiler for Parallel Function Calling},
  author={Kim, Sehoon and Moon, Suhong and Tabrizi, Ryan and Lee, Nicholas and Mahoney, Michael W. and Keutzer, Kurt and Gholami, Amir},
  booktitle={International Conference on Machine Learning (ICML)},
  year={2024},
  eprint={2312.04511},
  archivePrefix={arXiv}
}
@inproceedings{shinn2023reflexion,
  title={Reflexion: Language Agents with Verbal Reinforcement Learning},
  author={Shinn, Noah and Cassano, Federico and Berman, Edward and Gopinath, Ashwin and Narasimhan, Karthik and Yao, Shunyu},
  booktitle={Advances in Neural Information Processing Systems (NeurIPS)},
  year={2023},
  eprint={2303.11366},
  archivePrefix={arXiv}
}
@article{zhou2023lats,
  title={Language Agent Tree Search Unifies Reasoning Acting and Planning in Language Models},
  author={Zhou, Andy and Yan, Kai and Shlapentokh-Rothman, Michal and Wang, Haohan and Wang, Yu-Xiong},
  journal={arXiv preprint arXiv:2310.04406},
  note={ICML 2024 per Semantic Scholar (unconfirmed)},
  year={2023}
}
@inproceedings{wang2023planandsolve,
  title={Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models},
  author={Wang, Lei and Xu, Wanyu and Lan, Yihuai and Hu, Zhiqiang and Lan, Yunshi and Lee, Roy Ka-Wei and Lim, Ee-Peng},
  booktitle={Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (ACL)},
  year={2023},
  eprint={2305.04091},
  archivePrefix={arXiv}
}
@inproceedings{wang2024codeact,
  title={Executable Code Actions Elicit Better LLM Agents},
  author={Wang, Xingyao and Chen, Yangyi and Yuan, Lifan and Zhang, Yizhe and Li, Yunzhu and Peng, Hao and Ji, Heng},
  booktitle={International Conference on Machine Learning (ICML)},
  year={2024},
  eprint={2402.01030},
  archivePrefix={arXiv}
}
@article{zhuang2023toolchainstar,
  title={ToolChain*: Efficient Action Space Navigation in Large Language Models with A* Search},
  author={Zhuang, Yuchen and Chen, Xiang and Yu, Tong and Mitra, Saayan and Bursztyn, Victor and Rossi, Ryan A. and others},
  journal={arXiv preprint arXiv:2310.13227},
  year={2023}
}
@article{rozanov2024stateact,
  title={StateAct: Enhancing LLM Base Agents via Self-prompting and State-tracking},
  author={Rozanov, Nikolai and Rei, Marek},
  journal={arXiv preprint arXiv:2410.02810},
  year={2024}
}
@inproceedings{erdogan2024tinyagent,
  title={TinyAgent: Function Calling at the Edge},
  author={Erdogan, Lutfi Eren and Lee, Nicholas and Jha, Siddharth and Kim, Sehoon and Tabrizi, Ryan and Moon, Suhong and others},
  booktitle={Proceedings of EMNLP 2024: System Demonstrations},
  year={2024},
  eprint={2409.00608},
  archivePrefix={arXiv}
}
@inproceedings{paramanayakam2025lessismore,
  title={Less is More: Optimizing Function Calling for LLM Execution on Edge Devices},
  author={Paramanayakam, Varatheepan and Karatzas, Andreas and Anagnostopoulos, Iraklis and Stamoulis, Dimitrios},
  booktitle={Design, Automation and Test in Europe Conference (DATE)},
  year={2025},
  eprint={2411.15399},
  archivePrefix={arXiv}
}
@inproceedings{shen2024smallllms,
  title={Small LLMs Are Weak Tool Learners: A Multi-LLM Agent},
  author={Shen, Weizhou and Li, Chenliang and Chen, Hongzhan and Yan, Ming and Quan, Xiaojun and Chen, Hehong and others},
  booktitle={Proceedings of EMNLP 2024},
  year={2024},
  eprint={2401.07324},
  archivePrefix={arXiv}
}
@article{chen2024octopusv2,
  title={Octopus v2: On-device language model for super agent},
  author={Chen, Wei and Li, Zhiyuan},
  journal={arXiv preprint arXiv:2404.01744},
  year={2024}
}
@article{lin2024hammer,
  title={Hammer: Robust Function-Calling for On-Device Language Models via Function Masking},
  author={Lin, Qiqiang and Wen, Muning and Peng, Qiuying and Nie, Guanyu and Liao, Junwei and Wang, Jun and others},
  journal={arXiv preprint arXiv:2410.04587},
  year={2024}
}
@inproceedings{lee2026patool,
  title={Don't Adapt Small Language Models for Tools; Adapt Tool Schemas to the Models},
  author={Lee, Jonggeun and Song, Woojung and Han, Jongwook and Pyun, Haesung and Jo, Yohan},
  booktitle={Proceedings of ACL 2026},
  year={2026},
  eprint={2510.07248},
  archivePrefix={arXiv}
}
@inproceedings{kavathekar2025smallmodels,
  title={Small Models, Big Tasks: An Exploratory Empirical Study on Small Language Models for Function Calling},
  author={Kavathekar, Ishan and Donakanti, Raghav and Kumaraguru, Ponnurangam and Vaidhyanathan, Karthik},
  booktitle={Proceedings of the 29th International Conference on Evaluation and Assessment in Software Engineering (EASE)},
  year={2025},
  eprint={2504.19277},
  archivePrefix={arXiv}
}
@article{kate2025longfunceval,
  title={LongFuncEval: Measuring the effectiveness of long context models for function calling},
  author={Kate, Kiran and Pedapati, Tejaswini and Basu, Kinjal and Rizk, Yara and Chenthamarakshan, Vijil and Chaudhury, Subhajit and others},
  journal={arXiv preprint arXiv:2505.10570},
  year={2025}
}
@article{taheri2026iffc,
  title={Small Reasoning Models are Instruction Followers in Function Calling},
  author={Taheri, Yalda and Heydari, Mohammad Hassan and Naaman, Erfan and Fatemi, Afsaneh},
  journal={arXiv preprint arXiv:2608.22472},
  year={2026}
}
@article{patil2023gorilla,
  title={Gorilla: Large Language Model Connected with Massive APIs},
  author={Patil, Shishir G. and Zhang, Tianjun and Wang, Xin and Gonzalez, Joseph E.},
  journal={arXiv preprint arXiv:2305.15334},
  year={2023}
}
@article{qin2023toolllm,
  title={ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs},
  author={Qin, Yujia and Liang, Shihao and Ye, Yining and Zhu, Kunlun and Yan, Lan and Lu, Yaxi and others},
  journal={arXiv preprint arXiv:2307.16789},
  note={ICLR 2024 per Semantic Scholar (unconfirmed)},
  year={2023}
}
@inproceedings{chen2024reinvoke,
  title={Re-Invoke: Tool Invocation Rewriting for Zero-Shot Tool Retrieval},
  author={Chen, Yanfei and Yoon, Jinsung and Sachan, Devendra Singh and Wang, Qingze and Cohen-Addad, Vincent and Bateni, Mohammadhossein and others},
  booktitle={Findings of EMNLP 2024},
  year={2024},
  eprint={2408.01875},
  archivePrefix={arXiv}
}
@inproceedings{shi2025toolret,
  title={Retrieval Models Aren't Tool-Savvy: Benchmarking Tool Retrieval for Large Language Models},
  author={Shi, Zhengliang and Wang, Yuhan and Yan, Lingyong and Ren, Pengjie and Wang, Shuaiqiang and Yin, Dawei and Ren, Zhaochun},
  booktitle={Findings/Proceedings of ACL 2025},
  year={2025},
  eprint={2503.01763},
  archivePrefix={arXiv}
}
@inproceedings{du2024anytool,
  title={AnyTool: Self-Reflective, Hierarchical Agents for Large-Scale API Calls},
  author={Du, Yu and Wei, Fangyun and Zhang, Hongyang},
  booktitle={International Conference on Machine Learning (ICML)},
  year={2024},
  eprint={2402.04253},
  archivePrefix={arXiv}
}
@article{lumer2024toolshed,
  title={Toolshed: Scale Tool-Equipped Agents with Advanced RAG-Tool Fusion and Tool Knowledge Bases},
  author={Lumer, Elias and Subbiah, Vamse Kumar and Burke, James A. and Basavaraju, Pradeep Honaganahalli and Huber, Austin},
  journal={arXiv preprint arXiv:2410.14594},
  year={2024}
}
@article{gan2025ragmcp,
  title={RAG-MCP: Mitigating Prompt Bloat in LLM Tool Selection via Retrieval-Augmented Generation},
  author={Gan, Tiantian and Sun, Qiyao},
  journal={arXiv preprint arXiv:2505.03275},
  year={2025}
}
@article{fei2025mcpzero,
  title={MCP-Zero: Active Tool Discovery for Autonomous LLM Agents},
  author={Fei, Xiang and Zheng, Xiawu and Feng, Hao},
  journal={arXiv preprint arXiv:2506.01056},
  year={2025}
}
@article{patel2025dtdr,
  title={Dynamic Tool Dependency Retrieval for Lightweight Function Calling},
  author={Patel, Bhrij and Belli, Davide and Jalalirad, Amir and Arnold, Maximilian and Ermolov, Aleksandr and Major, Bence},
  journal={arXiv preprint arXiv:2512.17052},
  year={2025}
}
@inproceedings{yuan2025easytool,
  title={EASYTOOL: Enhancing LLM-based Agents with Concise Tool Instruction},
  author={Yuan, Siyu and Song, Kaitao and Chen, Jiangjie and Tan, Xu and Shen, Yongliang and Kan, Ren and Li, Dongsheng and Yang, Deqing},
  booktitle={Proceedings of NAACL 2025},
  year={2025},
  eprint={2401.06201},
  archivePrefix={arXiv}
}
@inproceedings{qu2025draft,
  title={From Exploration to Mastery: Enabling LLMs to Master Tools via Self-Driven Interactions},
  author={Qu, Changle and Dai, Sunhao and Wei, Xiaochi and Cai, Hengyi and Wang, Shuaiqiang and Yin, Dawei and others},
  booktitle={International Conference on Learning Representations (ICLR)},
  year={2025},
  eprint={2410.08197},
  archivePrefix={arXiv}
}
@inproceedings{geng2023gcd,
  title={Grammar-Constrained Decoding for Structured NLP Tasks without Finetuning},
  author={Geng, Saibo and Josifoski, Martin and Peyrard, Maxime and West, Robert},
  booktitle={Proceedings of EMNLP 2023},
  year={2023},
  eprint={2305.13971},
  archivePrefix={arXiv}
}
@article{willard2023outlines,
  title={Efficient Guided Generation for Large Language Models},
  author={Willard, Brandon T. and Louf, R{\'e}mi},
  journal={arXiv preprint arXiv:2307.09702},
  year={2023}
}
@inproceedings{dong2025xgrammar,
  title={XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models},
  author={Dong, Yixin and Ruan, Charlie F. and Cai, Yaxing and Lai, Ruihang and Xu, Ziyi and Zhao, Yilong and Chen, Tianqi},
  booktitle={Proceedings of Machine Learning and Systems (MLSys)},
  year={2025},
  eprint={2411.15100},
  archivePrefix={arXiv}
}
@inproceedings{tam2024speakfreely,
  title={Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models},
  author={Tam, Zhi Rui and Wu, Cheng-Kuang and Tsai, Yi-Lin and Lin, Chieh-Yen and Lee, Hung-yi and Chen, Yun-Nung},
  booktitle={Proceedings of EMNLP 2024: Industry Track},
  year={2024},
  eprint={2408.02442},
  archivePrefix={arXiv}
}
@inproceedings{banerjee2025crane,
  title={CRANE: Reasoning with constrained LLM generation},
  author={Banerjee, Debangshu and Suresh, Tarun and Ugare, Shubham and Misailovic, Sasa and Singh, Gagandeep},
  booktitle={International Conference on Machine Learning (ICML)},
  year={2025},
  eprint={2502.09061},
  archivePrefix={arXiv}
}
@inproceedings{park2024gad,
  title={Grammar-Aligned Decoding},
  author={Park, Kanghee and Wang, Jiayu and Berg-Kirkpatrick, Taylor and Polikarpova, Nadia and D'Antoni, Loris},
  booktitle={Advances in Neural Information Processing Systems (NeurIPS)},
  year={2024},
  eprint={2405.21047},
  archivePrefix={arXiv}
}
@article{geng2025jsonschemabench,
  title={JSONSchemaBench: A Rigorous Benchmark of Structured Outputs for Language Models},
  author={Geng, Saibo and Cooper, Hudson and Moskal, Micha{\l} and Jenkins, Samuel and Berman, Julian and Ranchin, Nathan and others},
  journal={arXiv preprint arXiv:2501.10868},
  year={2025}
}
@article{nguyen2026inwriting,
  title={Thinking Before Constraining: A Unified Decoding Framework for Large Language Models},
  author={Nguyen, Ngoc Trinh Hung and Silva, Alonso and Zumot, Laith and Tupikina, Liubov and Aghasaryan, Armen and Alam, Mehwish},
  journal={arXiv preprint arXiv:2601.07525},
  year={2026}
}
@article{chavan2026cdsmall,
  title={Constrained Decoding Eliminates Structural Failures in Small LLMs but Reveals a Scale-Dependent Semantic Gap},
  author={Chavan, Akash},
  journal={arXiv preprint arXiv:2609.23742},
  year={2026}
}
@article{lee2026repair,
  title={Repair, Not Improvement: Decomposing Constrained Decoding in Tool-Call Abstention},
  author={Lee, Janghoon},
  journal={arXiv preprint arXiv:2608.13959},
  year={2026}
}
@inproceedings{wang2023selfconsistency,
  title={Self-Consistency Improves Chain of Thought Reasoning in Language Models},
  author={Wang, Xuezhi and Wei, Jason and Schuurmans, Dale and Le, Quoc and Chi, Ed and Narang, Sharan and Chowdhery, Aakanksha and Zhou, Denny},
  booktitle={International Conference on Learning Representations (ICLR)},
  year={2023},
  eprint={2203.11171},
  archivePrefix={arXiv}
}
@inproceedings{aggarwal2023adaptive,
  title={Let's Sample Step by Step: Adaptive-Consistency for Efficient Reasoning and Coding with LLMs},
  author={Aggarwal, Pranjal and Madaan, Aman and Yang, Yiming and Mausam},
  booktitle={Proceedings of EMNLP 2023},
  year={2023},
  eprint={2305.11860},
  archivePrefix={arXiv}
}
@article{snell2024scaling,
  title={Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters},
  author={Snell, Charlie and Lee, Jaehoon and Xu, Kelvin and Kumar, Aviral},
  journal={arXiv preprint arXiv:2408.03314},
  year={2024}
}
@article{chen2023usc,
  title={Universal Self-Consistency for Large Language Model Generation},
  author={Chen, Xinyun and Aksitov, Renat and Alon, Uri and Ren, Jie and Xiao, Kefan and Yin, Pengcheng and others},
  journal={arXiv preprint arXiv:2311.17311},
  year={2023}
}
@inproceedings{wang2024softsc,
  title={Soft Self-Consistency Improves Language Model Agents},
  author={Wang, Han and Prasad, Archiki and Stengel-Eskin, Elias and Bansal, Mohit},
  booktitle={Proceedings of ACL 2024},
  year={2024},
  eprint={2402.13212},
  archivePrefix={arXiv}
}
@article{sethi2026trace,
  title={Don't Overthink It: Inter-Rollout Action Agreement as a Free Adaptive-Compute Signal for LLM Agents},
  author={Sethi, Khushal},
  journal={arXiv preprint arXiv:2604.08369},
  year={2026}
}
@article{lee2026catts,
  title={Agentic Test-Time Scaling for WebAgents},
  author={Lee, Nicholas and Erdogan, Lutfi Eren and John, Chris Joseph and Krishnapillai, Surya and Mahoney, Michael W. and Keutzer, Kurt and others},
  journal={arXiv preprint arXiv:2602.12276},
  year={2026}
}
@article{zhu2025ttsagents,
  title={Scaling Test-time Compute for LLM Agents},
  author={Zhu, King and Li, Hanhao and Wu, Siwei and Xing, Tianshun and Ma, Dehua and Tang, Xiangru and others},
  journal={arXiv preprint arXiv:2506.12928},
  year={2025}
}
@article{li2024moreagents,
  title={More Agents Is All You Need},
  author={Li, Junyou and Zhang, Qin and Yu, Yangbin and Fu, Qiang and Ye, Deheng},
  journal={Transactions on Machine Learning Research},
  year={2024},
  eprint={2402.05120},
  archivePrefix={arXiv}
}
@article{mehta2026disagree,
  title={When Agents Disagree With Themselves: Behavioral Consistency as an Uncertainty Signal for LLM Agents},
  author={Mehta, Aman},
  journal={arXiv preprint arXiv:2602.11619},
  year={2026}
}
@inproceedings{wang2024rcagent,
  title={RCAgent: Cloud Root Cause Analysis by Autonomous Agents with Tool-Augmented Large Language Models},
  author={Wang, Zefan and Liu, Zichuan and Zhang, Yingying and Zhong, Aoxiao and Wang, Jihong and Yin, Fengbin and others},
  booktitle={Proceedings of CIKM 2024},
  year={2024},
  eprint={2310.16340},
  archivePrefix={arXiv}
}
@article{hao2026kate,
  title={Pushing the Limits of LLM Tool Calling via Experiential Knowledge Integration and Activation},
  author={Hao, Yupu and Jin, Zhuoran and Liao, Huanxuan and Liu, Kang and Zhao, Jun},
  journal={arXiv preprint arXiv:2606.10875},
  year={2026}
}
@inproceedings{huang2024cannotselfcorrect,
  title={Large Language Models Cannot Self-Correct Reasoning Yet},
  author={Huang, Jie and Chen, Xinyun and Mishra, Swaroop and Zheng, Huaixiu Steven and Yu, Adams Wei and Song, Xinying and Zhou, Denny},
  booktitle={International Conference on Learning Representations (ICLR)},
  year={2024},
  eprint={2310.01798},
  archivePrefix={arXiv}
}
@article{liu2024lostmiddle,
  title={Lost in the Middle: How Language Models Use Long Contexts},
  author={Liu, Nelson F. and Lin, Kevin and Hewitt, John and Paranjape, Ashwin and Bevilacqua, Michele and Petroni, Fabio and Liang, Percy},
  journal={Transactions of the Association for Computational Linguistics},
  note={arXiv comment: accepted to TACL 2023; check final volume/year},
  year={2024},
  eprint={2307.03172},
  archivePrefix={arXiv}
}
@inproceedings{lindenbauer2025complexitytrap,
  title={The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management},
  author={Lindenbauer, Tobias and Slinko, Igor and Felder, Ludwig and Bogomolov, Egor and Zharov, Yaroslav},
  booktitle={4th Deep Learning for Code Workshop (DL4C) at NeurIPS 2025},
  year={2025},
  eprint={2508.21433},
  archivePrefix={arXiv}
}
@inproceedings{kang2026acon,
  title={ACON: Optimizing Context Compression for Long-horizon LLM Agents},
  author={Kang, Minki and Chen, Wei-Ning and Han, Dongge and Inan, Huseyin A. and Wutschitz, Lukas and Chen, Yanzhi and others},
  booktitle={International Conference on Machine Learning (ICML)},
  year={2026},
  eprint={2510.00615},
  archivePrefix={arXiv}
}
@article{packer2023memgpt,
  title={MemGPT: Towards LLMs as Operating Systems},
  author={Packer, Charles and Wooders, Sarah and Lin, Kevin and Fang, Vivian and Patil, Shishir G. and Stoica, Ion and Gonzalez, Joseph E.},
  journal={arXiv preprint arXiv:2310.08560},
  year={2023}
}
@article{laban2025lostmultiturn,
  title={LLMs Get Lost In Multi-Turn Conversation},
  author={Laban, Philippe and Hayashi, Hiroaki and Zhou, Yingbo and Neville, Jennifer},
  journal={arXiv preprint arXiv:2505.06120},
  year={2025}
}
@article{wang2024awm,
  title={Agent Workflow Memory},
  author={Wang, Zora Zhiruo and Mao, Jiayuan and Fried, Daniel and Neubig, Graham},
  journal={arXiv preprint arXiv:2409.07429},
  year={2024}
}
@InProceedings{patil2025bfcl,
  title={The Berkeley Function Calling Leaderboard ({BFCL}): From Tool Use to Agentic Evaluation of Large Language Models},
  author={Patil, Shishir G and Mao, Huanzhi and Yan, Fanjia and Ji, Charlie Cheng-Jie and Suresh, Vishnu and Stoica, Ion and Gonzalez, Joseph E.},
  booktitle={Proceedings of the 42nd International Conference on Machine Learning},
  pages={48371--48392},
  year={2025},
  volume={267},
  series={Proceedings of Machine Learning Research},
  publisher={PMLR},
  url={https://proceedings.mlr.press/v267/patil25a.html}
}
@article{yao2024taubench,
  title={$\tau$-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains},
  author={Yao, Shunyu and Shinn, Noah and Razavi, Pedram and Narasimhan, Karthik},
  journal={arXiv preprint arXiv:2406.12045},
  year={2024}
}
@article{barres2025tau2bench,
  title={$\tau^2$-Bench: Evaluating Conversational Agents in a Dual-Control Environment},
  author={Barres, Victor and Dong, Honghua and Ray, Soham and Si, Xujie and Narasimhan, Karthik},
  journal={arXiv preprint arXiv:2506.07982},
  year={2025}
}
@inproceedings{li2023apibank,
  title={API-Bank: A Comprehensive Benchmark for Tool-Augmented LLMs},
  author={Li, Minghao and Zhao, Yingxiu and Yu, Bowen and Song, Feifan and Li, Hangyu and Yu, Haiyang and others},
  booktitle={Proceedings of EMNLP 2023},
  year={2023},
  eprint={2304.08244},
  archivePrefix={arXiv}
}
@article{basu2024nestful,
  title={NESTFUL: A Benchmark for Evaluating LLMs on Nested Sequences of API Calls},
  author={Basu, Kinjal and Abdelaziz, Ibrahim and Kate, Kiran and Agarwal, Mayank and Crouse, Maxwell and Rizk, Yara and others},
  journal={arXiv preprint arXiv:2409.03797},
  year={2024}
}
@article{lu2024toolsandbox,
  title={ToolSandbox: A Stateful, Conversational, Interactive Evaluation Benchmark for LLM Tool Use Capabilities},
  author={Lu, Jiarui and Holleis, Thomas and Zhang, Yizhe and Aumayer, Bernhard and Nan, Feng and Bai, Felix and others},
  journal={arXiv preprint arXiv:2408.04682},
  year={2024}
}
@inproceedings{ye2025toolhop,
  title={ToolHop: A Query-Driven Benchmark for Evaluating Large Language Models in Multi-Hop Tool Use},
  author={Ye, Junjie and Du, Zhengyin and Yao, Xuesong and Lin, Weijian and Xu, Yufei and Chen, Zehui and others},
  booktitle={Proceedings of ACL 2025},
  year={2025},
  eprint={2501.02506},
  archivePrefix={arXiv}
}
@inproceedings{ross2025when2call,
  title={When2Call: When (not) to Call Tools},
  author={Ross, Hayley and Mahabaleshwarkar, Ameya Sunil and Suhara, Yoshi},
  booktitle={Proceedings of NAACL 2025 (Volume 1: Long Papers)},
  pages={3391--3409},
  year={2025},
  eprint={2504.18851},
  archivePrefix={arXiv}
}
@inproceedings{liu2024agentbench,
  title={AgentBench: Evaluating LLMs as Agents},
  author={Liu, Xiao and Yu, Hao and Zhang, Hanchen and Xu, Yifan and Lei, Xuanyu and Lai, Hanyu and others},
  booktitle={International Conference on Learning Representations (ICLR)},
  year={2024},
  eprint={2308.03688},
  archivePrefix={arXiv}
}
@article{wang2024mtubench,
  title={MTU-Bench: A Multi-granularity Tool-Use Benchmark for Large Language Models},
  author={Wang, Pei and Wu, Yanan and Wang, Zekun and Liu, Jiaheng and Song, Xiaoshuai and Peng, Zhongyuan and others},
  journal={arXiv preprint arXiv:2410.11710},
  year={2024}
}
@inproceedings{ma2024mnms,
  title={m\&m's: A Benchmark to Evaluate Tool-Use for multi-step multi-modal Tasks},
  author={Ma, Zixian and Huang, Weikai and Zhang, Jieyu and Gupta, Tanmay and Krishna, Ranjay},
  booktitle={European Conference on Computer Vision (ECCV)},
  year={2024},
  eprint={2403.11085},
  archivePrefix={arXiv}
}
@article{lei2025mcpverse,
  title={MCPVerse: An Expansive, Real-World Benchmark for Agentic Tool Use},
  author={Lei, Fei and Yang, Yibo and Sun, Wenxiu and Lin, Dahua},
  journal={arXiv preprint arXiv:2508.16260},
  year={2025}
}
@inproceedings{zhao2026calibration,
  title={Calibration is the Bottleneck: An Action-Class Diagnostic of Multi-Turn Tool-Calling},
  author={Zhao, Kangjia and Li, Jiajun and Shen, Haozhan and Chow, Wei and Li, Linfeng and Song, Hang and others},
  booktitle={Findings of EMNLP 2026},
  year={2026},
  eprint={2609.00949},
  archivePrefix={arXiv}
}
@inproceedings{sun2026when2tool,
  title={LLM Agents Already Know When to Call Tools -- Even Without Reasoning},
  author={Sun, Chung-En and Liu, Linbo and Yan, Ge and Wang, Zimo and Weng, Tsui-Wei},
  booktitle={Advances in Neural Information Processing Systems (NeurIPS)},
  year={2026},
  eprint={2605.09252},
  archivePrefix={arXiv}
}
@article{hsieh2023tooldoc,
  title={Tool Documentation Enables Zero-Shot Tool-Usage with Large Language Models},
  author={Hsieh, Cheng-Yu and Chen, Si-An and Li, Chun-Liang and Fujii, Yasuhisa and Ratner, Alexander and Lee, Chen-Yu and others},
  journal={arXiv preprint arXiv:2308.00675},
  year={2023}
}
@article{xu2026tooluse_survey,
  title={The Evolution of Tool Use in LLM Agents: From Single-Tool Call to Multi-Tool Orchestration},
  author={Xu, Haoyuan and Li, Chang and Ma, Xinyan and Ou, Xianhao and Zhang, Zihan and He, Tao and others},
  journal={arXiv preprint arXiv:2603.22862},
  year={2026}
}
```

*Notes on BibTeX:*
- Author lists ending in "and others" were truncated by the arXiv API output (only the first six authors are shown).
- For ReAct, Plan-and-Solve, LLMCompiler, Self-Consistency, Lost-in-the-Middle and Huang et al., the full author lists were completed from background knowledge and should be double-checked before submission.
- Where only "ACL 2025" is known, the main vs. Findings distinction for ToolRet is unconfirmed.
