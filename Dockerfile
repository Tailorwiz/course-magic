# Course Magic — production image for Railway.
#
# A Node app that also runs the Kokoro TTS Python worker (server/tts_worker.py)
# for motion-video narration. Kokoro is free, open-source, self-hosted — and
# unlike ElevenLabs' free tier it works from a datacenter. The Kokoro model is
# baked into the image so there is no first-render download.
#
# Video rendering itself happens on AWS Lambda (Remotion Lambda), not here.

FROM node:20-slim

# System dependencies:
#  - python3 / pip : run the Kokoro TTS worker
#  - curl          : download the Kokoro model during build
#  - build-essential / python3-dev : compile any native npm modules
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     python3 python3-pip python3-dev build-essential curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps for Kokoro TTS (kokoro-onnx pulls in onnxruntime).
RUN pip3 install --break-system-packages --no-cache-dir \
    kokoro-onnx soundfile numpy

# Node dependencies — copy manifests first for layer caching.
COPY package.json package-lock.json ./
RUN npm install

# Application source (node_modules etc. excluded via .dockerignore).
COPY . .

# Bake the Kokoro model files into the image (~350MB) so the TTS worker
# never has to download them at runtime. server/tts_worker.py looks in /app.
RUN curl -fL -o /app/kokoro-v1.0.onnx \
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx \
  && curl -fL -o /app/voices-v1.0.bin \
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# Build the client bundle.
RUN npx vite build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
