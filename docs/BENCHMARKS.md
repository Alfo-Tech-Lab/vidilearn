# Performance Benchmarks & Targets

This document outlines the performance latency targets for the local core engine running on default hardware profiles.

---

## 1. Golden Performance Targets

| Processing Task | Execution Metric Target | Description |
| --- | --- | --- |
| YouTube Extraction | `< 5.0s` | Subtitle extraction, metadata lookup |
| Web Page Parse | `< 3.0s` | Readability text block extraction |
| PDF Extraction | `< 3.0s` | Local PDF content reading (under 100 pages) |
| Embedding Speed | `> 500 chunks/min` | Local model vector computation |
| Search Latency | `< 100ms` | Hybrid FTS5 and vector query retrieval |
| Idle RAM | `< 300MB` | CLI and database standby footprint |

---

## 2. Benchmark Hardware Baseline

Performance targets are measured against a standard developer notebook configuration:
* **CPU**: Apple M1 / Intel Core i7 (4 cores minimum)
* **RAM**: 16GB LPDDR4
* **Storage**: PCIe NVMe SSD (Read >2000 MB/s)
* **API dependency**: 0% (100% offline local models)
