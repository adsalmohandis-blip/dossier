"use strict";

// Detects the firmware toolchain in a repository. Read-only.

const fs = require("fs");
const path = require("path");

const SIGNATURES = [
  {
    id: "zephyr",
    label: "Zephyr RTOS",
    files: ["west.yml", "prj.conf"],
    build_command: "west build",
    artifacts: { map: "build/zephyr/zephyr.map", binary: "build/zephyr/zephyr.bin", sbom: "build/zephyr/zephyr.spdx" }
  },
  {
    id: "platformio",
    label: "PlatformIO",
    files: ["platformio.ini"],
    build_command: "pio run",
    artifacts: { map: ".pio/build", binary: ".pio/build", sbom: null }
  },
  {
    id: "esp_idf",
    label: "ESP-IDF",
    files: ["sdkconfig", "sdkconfig.defaults"],
    build_command: "idf.py build",
    artifacts: { map: "build", binary: "build", sbom: null }
  },
  {
    id: "cmake",
    label: "CMake (generic)",
    files: ["CMakeLists.txt"],
    build_command: "cmake --build build",
    artifacts: { map: "build", binary: "build", sbom: null }
  }
];

function detect(root) {
  const base = root || process.cwd();
  const matches = [];
  for (const signature of SIGNATURES) {
    const hit = signature.files.find((file) => fs.existsSync(path.join(base, file)));
    if (hit) matches.push({ ...signature, matched_on: hit });
  }
  if (matches.length === 0) {
    return { id: "unknown", label: "Unknown", matched_on: null, build_command: null, artifacts: {} };
  }
  return matches[0];
}

module.exports = { detect, SIGNATURES };
