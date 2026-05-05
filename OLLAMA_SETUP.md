# Ollama Setup Guide

This project uses **Ollama** with **Llama 2 70B** for local AI inference. No API keys required—everything runs on your machine!

## Prerequisites

- **For Llama 3.1 8B**: 6–8 GB disk space, 8–12 GB VRAM
- **For Llama 3.1 70B**: 40–50 GB disk space, 40+ GB VRAM
- GPU support recommended (NVIDIA/AMD) for faster inference

## Installation & Setup

### Step 1: Install Ollama

Download and install from **https://ollama.ai**

- **Windows**: OllamaSetup.exe installer
- **macOS**: DMG package
- **Linux**: Curl install script

### Step 2: Pull the Llama 3.1 8B Model

Open a terminal and run:

```bash
ollama pull llama3.1:8b
```

This downloads ~4 GB. Much faster—2–5 minutes on a good connection!

**(For powerful systems)** If you have 40+ GB VRAM and want better quality:
```bash
ollama pull llama3.1:70b  # ~40 GB download
```

### Step 3: Start Ollama Service

The Ollama service should auto-start on install. Verify it's running:

```bash
# Windows: check Services (Ollama should be running)
# macOS/Linux: run manually
ollama serve
```

The API will be available at **`http://localhost:11434`** by default.

### Step 4: Configure Environment

Create `.env.local` in the project root:

```bash
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=llama2:70b
```

(These match the `.env.example` defaults, so if you're just using defaults, you can skip this step.)

### Step 5: Start the Dev Server

```bash
npm run dev
```

Visit **http://localhost:3000** and try an AI feature:
- Generate flashcards from a PDF
- Generate a quiz
- Chat with Study Companion
- Prioritize tasks
- Plan your week
- Check passing target

## Troubleshooting

### "Connection refused" / Ollama not responding

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# If that fails, start it manually
ollama serve
```

### Model download stuck or very slow

- Check your internet connection
- Try resuming: `ollama pull llama2:70b` again
- Consider pulling a smaller model first: `ollama pull llama2:7b` (3 GB)

### High memory usage or slowness

If inference is slow:
- **Option A**: Use a smaller model: `ollama pull mistral:7b` or `ollama pull neural-chat:7b`
- **Option B**: Ensure your GPU is being used (NVIDIA/AMD support built into Ollama)
- **Option C**: Reduce load by closing other apps

### Testing a specific endpoint

```bash
# Test flashcard generation
curl -X POST http://localhost:3000/api/ai/flashcards/generate \
  -F "file=@sample.txt" \
  -F "deckName=My Deck"

# Test task prioritization
curl -X POST http://localhost:3000/api/ai/task-value/prioritize \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"name": "Study Math", "course": "MAT101", "estimatedHours": 3},
      {"name": "Write Essay", "course": "ENG201", "estimatedHours": 4}
    ]
  }'
```

## Model Options

- **llama3.1:8b** – Great balance, 12GB VRAM sweet spot (4.9 GB download) ⭐ **Recommended**
- **llama3.1:70b** – Best quality, needs 40+ GB VRAM (40+ GB download)
- **mistral:7b** – Better quality than 7B, slightly slower (4 GB)
- **neural-chat:7b** – Best for chat, friendly tone (4 GB)
- **llama2:7b** – Fastest, light (3 GB download)
- **llama2:13b** – Higher quality, needs 20GB VRAM (8 GB download)

Switch with:

```bash
ollama pull <model-name>
# Update .env.local or .env.example:
# OLLAMA_MODEL=<model-name>
```

## Performance Notes (Llama 2 8B)

- **First request after Ollama starts**: Loads model into memory (~10–30s)
- **Subsequent requests**: 2–5s per query on CPU, <1s with GPU acceleration
- **Memory usage**: ~6–8 GB with 12GB VRAM (safe headroom)
- **Stream endpoints**: Study Companion chat streams deltas as they arrive (progressive output)
- **Batch requests**: Multiple concurrent requests may slow down; sequential is smoother

## Next Steps

1. Run the dev server: `npm run dev`
2. Visit http://localhost:3000
3. Try generating flashcards or a quiz
4. Check the browser console for any errors
5. Report issues in the project Issues tab

Enjoy free, local AI! 🚀
