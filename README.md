# RAG Answer Bot

This project uses ChromaDB and GigaChat/OpenRouter to perform Retrieval-Augmented Generation (RAG).

## Setup

### Node.js
```bash
npm install
```

### Python
```bash
python -m venv chroma-env
source chroma-env/bin/activate     #( win: chroma-env\Scripts\activate )
pip install -r requirements.txt
chroma run --host 0.0.0.0 --port 8000
```
## Workflow

### Create embeddings DB

```bash
node embed_chunks.js
```

### Call prompt

```bash
node answer_prompt.js "какие бк работают с google pay?"
```