# Testing & Validation Framework Specification

This document details the test harness built into the Vidilearn core engine to ensure scalability and offline correctness.

---

## 1. Test Harness Architecture

Vidilearn includes built-in commands to evaluate processing velocity, accuracy, and memory leak profiles.

### A. Test-Suite Execution (`test-suite`)
Executes validation assertions over structured JSON test cases.
* **Command**: `vidilearn test-suite datasets/youtube`
* **Asserts**: Checks transcript presence, minimum word counts, heading extraction, and metadata formatting.
* **Output**: Prints the Golden Benchmark Results report (Success rate, latency metrics, failed tests reasons).

### B. Embedding Benchmark (`benchmark`)
Measures the velocity of the local embedding tokenizer and vector layer.
* **Command**: `vidilearn benchmark`
* **Output**: Tracks processing speed (vectors/sec) and heap RAM usage footprint.

### C. RAG Verification (`rag-test`)
Tests end-to-end RAG pipeline recall.
* **Command**: `vidilearn rag-test`
* **Output**: Asserts that matching content blocks are retrieved correctly for sample query strings.

### D. Memory Profile stress testing (`stress`)
Simulates constant chunk processing over time to detect potential memory leaks.
* **Command**: `vidilearn stress --hours 1`
* **Output**: Periodically logs the active heap memory usage.

### E. Live Stream Telemetry (`live-test`)
Monitors buffer delay, connection drops, and packet loss statistics.
* **Command**: `vidilearn live-test <youtube_stream_url>`
