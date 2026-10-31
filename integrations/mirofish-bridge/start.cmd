@echo off
rem Start the OpenAI-compatible bridge that MiroFish reaches as host.docker.internal:8799.
node "%~dp0bridge.mjs"
