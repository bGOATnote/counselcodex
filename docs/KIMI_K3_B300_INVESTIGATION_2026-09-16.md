# Kimi K3 on NVIDIA B300: feasibility investigation

16 September 2026. Documentation review only. No hardware was allocated, weights downloaded, or inference run. This investigation is separate from the submitted presentation and frozen clinical results.

## Finding

**An eight-GPU B300 server is a documented deployment target. A single B300 GPU cannot hold the released model entirely in GPU memory.** The relevant distinction is the number of GPUs in the server.

| Item | Verified specification |
| --- | --- |
| Model | `moonshotai/Kimi-K3`, API identifier `kimi-k3` |
| Parameters | 2.8 trillion total, 104 billion active per token |
| Released precision | MXFP4 weights with MXFP8 activations |
| Reasoning | Always enabled, with low, high or max effort |

These are publisher specifications. They do not establish performance on this clinical task. [Official model card](https://huggingface.co/moonshotai/Kimi-K3).

The published repository is approximately **1.56 TB** with 96 weight shards. [Checkpoint files](https://huggingface.co/moonshotai/Kimi-K3/tree/main).

NVIDIA specifies **288 GB per B300 GPU**, or **2,304 GB across eight GPUs** in a DGX B300 with NVLink/NVSwitch connectivity. Its default host memory is 2 TB, expandable to 4 TB. [NVIDIA specifications](https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html).

**Memory calculation:** 2.8 trillion parameters at an idealized four bits require about **1.4 TB** before additional precision, scales, buffers or cache. Active parameters describe computation per token, rather than the storage required for all experts. The official configuration retains higher precision for several components. Therefore the active count does not make the full checkpoint fit on one GPU. CPU or expert offload could change the memory arrangement, but this review did not establish a supported single-B300 recipe or usable latency. [Model configuration](https://huggingface.co/moonshotai/Kimi-K3/blob/main/config.json).

## Serving evidence

SGLang documents **B300 1×8 Unified Low-Latency and Balanced** configurations. Its final-weight speed round uses `v0.5.18 @ 71de97b2` with 8,192 input and 1,024 output tokens. The page explicitly says accuracy has not been re-measured. Its speculative-decoding figures use a simulated acceptance length, so they cannot predict measured acceptance on patient messages. KDA state and MLA cache allocations also limit usable concurrency. [SGLang cookbook](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3).

The vLLM recipe remains marked pre-release and describes at least eight **GB300** GPUs, a CUDA 13 image and an r580-or-newer driver. That is a different documented hardware configuration. For B300, begin from the corresponding SGLang recipe and verify the actual container and driver combination. [vLLM recipe](https://recipes.vllm.ai/moonshotai/Kimi-K3).

The model uses the custom Kimi K3 License, including deployment and distribution conditions. Check the intended use against that license before integration. [Official license](https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE).

## Proposed bounded experiment

1. **Freeze the environment.** Record an immutable checkpoint revision, container digest, driver, GPU topology, precision, parser and reasoning settings. Confirm disk and host-memory headroom before downloading.
2. **Establish serving correctness.** On 8×B300, run one structured-output smoke test at low concurrency. Start without speculative decoding or cache-precision changes. Measure memory use and preserve startup failures.
3. **Freeze the clinical protocol.** Reuse the exact three-bucket system prompt and message-only inputs. Choose one effort and an output limit before generation. Generate once for each of the 50 cases, without label context or case-specific retries.
4. **Score after freezing outputs.** Use physician v3 over **50 cases**, retaining C25 urgent and C32/C34/C38 self-care. Compare every case with frozen Fable and list exact disagreements. Report failed or truncated outputs in the denominator. CSV agreement is not a target.
5. **Measure the actual workload.** Report first-token and complete-response latency, input and output tokens, malformed responses, memory headroom and throughput at stated concurrency. Separate warm-up from measurements. Model and effort effects require separate comparisons.
6. **Decide the next step.** The 50 known development cases support exploration. Any replacement claim requires new independently reviewed cases and predefined clinical acceptance criteria.

No Kimi physician-agreement score or B300 latency has been measured in this repository. The current Fable result remains **48/50**, and the current GUI and V25 remain unchanged.
